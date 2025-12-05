import { ZActor } from "./module/actor.js";
import { ZActorSheet } from "./module/actor-sheet.js";
import { ZShelterSheet } from "./module/shelter-sheet.js";
import { ZContainerSheet } from "./module/container-sheet.js";
import { ZItem } from "./module/item.js";
import { ZItemSheet } from "./module/item-sheet.js";
import { NoiseManager } from "./module/noise.js";
import { ZChat } from "./module/chat.js";
import { GLOBAL_STATUSES } from "./module/constants.js";
import { ZHarvestSheet } from "./module/harvest-sheet.js";

Hooks.once("init", () => {
  console.log("ZSystem | Initializing (Chat-Ops Mode)...");

  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  // --- Helpers (Твой старый код хелперов) ---
  Handlebars.registerHelper('capitalize', str => typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '');
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('lt', (a, b) => a < b);
  Handlebars.registerHelper('eq', (a, b) => a == b);
  Handlebars.registerHelper('ne', (a, b) => a != b); 
  Handlebars.registerHelper('and', (a, b) => a && b);
  Handlebars.registerHelper('or', (a, b) => a || b);
  Handlebars.registerHelper('calculatePercentage', (value, max) => {
      value = Number(value) || 0;
      max = Number(max) || 1;
      return Math.min(100, Math.max(0, (value / max) * 100));
  });
  Handlebars.registerHelper('getLimbColor', (value, max) => {
      value = Number(value) || 0;
      max = Number(max) || 1;
      if (value <= 0) return "#000000";
      const pct = Math.min(1, Math.max(0, value / max));
      const hue = Math.floor(120 * pct);
      return `hsl(${hue}, 80%, 35%)`; 
  });
  
  // --- Config ---
  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;
  CONFIG.Combat.initiative = { formula: "1d10 + @attributes.per.value", decimals: 2 };

  const customTranslations = {
    TYPES: {
      Actor: { survivor: "Выживший", npc: "NPC", zombie: "Зомби", shelter: "Убежище", container: "Контейнер", harvest_spot: "Точка Сбора" },
      Item: { weapon: "Оружие", armor: "Броня", consumable: "Расходник", ammo: "Патроны", resource: "Ресурс", medicine: "Медицина", food: "Еда", materials: "Материалы", luxury: "Роскошь", misc: "Разное", upgrade: "Постройка", project: "Проект" }
    }
  };
  foundry.utils.mergeObject(game.i18n.translations, customTranslations);
  if (game.i18n._fallback) foundry.utils.mergeObject(game.i18n._fallback, customTranslations);

  CONFIG.statusEffects = Object.values(GLOBAL_STATUSES).map(s => ({
      id: s.id, label: s.label, icon: s.icon, statuses: [s.id] 
  }));
  CONFIG.statusEffects.push({ id: "dead", label: "Мертв", icon: "icons/svg/skull.svg", statuses: ["dead"] });

  // --- Registration ---
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("zsystem", ZActorSheet, { types: ["survivor", "npc", "zombie"], makeDefault: true, label: "Лист Персонажа" });
  Actors.registerSheet("zsystem", ZShelterSheet, { types: ["shelter"], makeDefault: true, label: "Управление Убежищем" });
  Actors.registerSheet("zsystem", ZContainerSheet, { types: ["container"], makeDefault: true, label: "Контейнер" });
  Actors.registerSheet("zsystem", ZHarvestSheet, { types: ["harvest_spot"], makeDefault: true, label: "Сбор Ресурсов" });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("zsystem", ZItemSheet, { makeDefault: true });

  NoiseManager.init();
  ZChat.init(); 
});

// === СОКЕТЫ: РЕГИСТРАЦИЯ ПРЯМО ТУТ ===
Hooks.once("socketlib.ready", () => {
    const socket = socketlib.registerSystem("zsystem");
    
    // Регистрируем функции из файла
    socket.register("addNoiseGM", GM_FUNCTIONS.addNoise);
    socket.register("applyDamageGM", GM_FUNCTIONS.applyDamage);

    game.zsystemSocket = socket;
    console.log("ZSystem | ✅ Socketlib ready & functions registered.");
});

Hooks.once("ready", async () => {
  // Фолбек регистрация (на всякий случай)
  if (!game.zsystemSocket && game.modules.get("socketlib")?.active) {
      const socket = socketlib.registerSystem("zsystem");
      socket.register("addNoiseGM", GM_FUNCTIONS.addNoise);
      socket.register("applyDamageGM", GM_FUNCTIONS.applyDamage);
      game.zsystemSocket = socket;
  }

  console.log("ZSystem | Ready.");

  Hooks.on("createChatMessage", async (message, options, userId) => {
    // 1. Выполняет ТОЛЬКО ГМ (чтобы не было двойного урона)
    if (!game.user.isGM) return;

    // 2. Проверяем наличие наших флагов
    const flags = message.flags.zsystem;
    if (!flags) return;

    console.log("ZSystem (GM) | Received command via Chat:", flags);

    // --- ОБРАБОТКА ШУМА ---
    if (flags.noiseAdd > 0) {
        const current = game.settings.get("zsystem", "currentNoise");
        const newVal = Math.max(0, current + flags.noiseAdd);
        await game.settings.set("zsystem", "currentNoise", newVal);
        ui.notifications.info(`🔊 Шум вырос на ${flags.noiseAdd} (Всего: ${newVal})`);
    }

    // --- ОБРАБОТКА УРОНА ---
    if (flags.damageData && Array.isArray(flags.damageData)) {
        for (let target of flags.damageData) {
            // Находим актора
            const actor = await fromUuid(target.uuid);
            const realActor = actor?.actor || actor; // Если uuid токена -> берем актора

            if (realActor) {
                // Прямой вызов нанесения урона с полными правами ГМа
                await realActor.applyDamage(target.amount, target.type, target.limb, { fromSocket: true });
            } else {
                console.warn(`ZSystem | Target not found: ${target.uuid}`);
            }
        }
    }
});

 Hooks.on("updateCombat", async (combat, changed) => {
    if (game.user.isGM && (changed.turn !== undefined || changed.round !== undefined)) {
        const combatant = combat.combatant;
        if (combatant?.actor?.onTurnStart) await combatant.actor.onTurnStart();
    }
});

  Hooks.on("preUpdateToken", (tokenDoc, changes, context, userId) => {
    if (changes.x === undefined && changes.y === undefined) return true;
    const actor = tokenDoc.actor;
    if (!actor || !tokenDoc.inCombat) return true;
    const currentPos = { x: tokenDoc.x, y: tokenDoc.y };
    const newPos = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
    const size = canvas.grid.size;
    const dx = Math.abs(newPos.x - currentPos.x) / size;
    const dy = Math.abs(newPos.y - currentPos.y) / size;
    const squaresMoved = Math.max(Math.round(dx), Math.round(dy));
    if (squaresMoved <= 0) return true;
    let costPerSquare = 1;
    if (actor.effects.some(e => e.statuses.has("prone"))) costPerSquare = 2; 
    const totalCost = squaresMoved * costPerSquare;
    const curAP = actor.system.resources.ap.value;
    if (curAP < totalCost) {
        ui.notifications.warn(`${actor.name}: Недостаточно AP.`);
        return false;
    }
    actor.update({ "system.resources.ap.value": curAP - totalCost });
    return true;
});

  Hooks.on("preCreateItem", (itemDoc, createData) => {
      const parent = itemDoc.parent;
      if (!parent || parent.documentName !== "Actor") return true;
      const data = foundry.utils.mergeObject(itemDoc.toObject(), createData);
      const incomingName = (data.name || "").trim();
      const existingItem = parent.items.find(i => i.name === incomingName && i.type === data.type);
      if (existingItem) {
        const stackable = ["ammo", "consumable", "resource", "medicine", "food", "materials", "luxury", "misc"];
        if (stackable.includes(data.type)) {
            const newQty = (Number(existingItem.system.quantity) || 1) + (Number(data.system.quantity) || 1);
            existingItem.update({ "system.quantity": newQty });
            ui.notifications.info(`Стек: ${incomingName} (Всего: ${newQty})`);
            return false;
        }
      }
      return true;
  });

  Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
      const actor = tokenDoc.actor;
      if (actor && actor.system.attributes?.isHidden?.value) {
          tokenDoc.updateSource({ hidden: true });
      }
  });

  Hooks.on("updateActor", (actor, data, options, userId) => {
      if (foundry.utils.hasProperty(data, "system.attributes.isHidden.value")) {
          const isHidden = data.system.attributes.isHidden.value;
          const tokens = actor.getActiveTokens();
          tokens.forEach(t => t.document.update({ hidden: isHidden }));
      }
  });

  Hooks.on("updateToken", async (tokenDoc, changes, context, userId) => {
      if (!game.user.isGM) return; 
      if (!changes.x && !changes.y) return;
      const token = tokenDoc.object; 
      const actor = token.actor;
      if (!actor || ["container", "harvest_spot", "shelter"].includes(actor.type)) return;
      const isZombie = actor.type === "zombie"; 
      const containers = canvas.tokens.placeables.filter(t => t.actor && t.actor.type === "container");

      for (let cToken of containers) {
          const cActor = cToken.actor;
          const sys = cActor.system.attributes;
          if (!sys) continue;
          const dist = canvas.grid.measureDistance(token, cToken, {gridSpaces: true});
          const spotRadius = Number(sys.trapSpotRadius?.value) || 2; 

          if (!isZombie && sys.isHidden?.value && dist <= spotRadius) {
               const flagKey = `spotted_hidden_${cActor.id}`; 
               if (!actor.getFlag("zsystem", flagKey)) {
                   await actor.setFlag("zsystem", flagKey, true);
                   const per = actor.system.attributes.per.value;
                   const roll = new Roll("1d10 + @per", {per});
                   await roll.evaluate();
                   const dc = sys.spotDC?.value || 15;
                   if (roll.total >= dc) {
                       await cActor.update({"system.attributes.isHidden.value": false});
                       await cToken.document.update({hidden: false}); 
                       ChatMessage.create({ content: `👁️ <b>${actor.name}</b> замечает замаскированный тайник!`, speaker: ChatMessage.getSpeaker({actor}) });
                   } else {
                       ChatMessage.create({ content: `<i>${actor.name} не заметил тайник (PER ${roll.total} vs ${dc})</i>`, whisper: ChatMessage.getWhisperRecipients("GM") });
                   }
               }
          }
          if (sys.isTrapped?.value && sys.trapActive?.value && dist <= spotRadius) {
               const flagKey = `trap_spotted_${cActor.id}`; 
               if (!actor.getFlag("zsystem", flagKey)) {
                   await actor.setFlag("zsystem", flagKey, true); 
                   const per = actor.system.attributes.per.value;
                   const roll = new Roll("1d10 + @per", {per});
                   await roll.evaluate();
                   const dc = sys.trapDC?.value || 15;
                   if (roll.total >= dc) {
                       await cActor.setFlag("zsystem", `trapKnownBy_${actor.id}`, true);
                       ChatMessage.create({ content: `⚠️ <b>${actor.name}</b> замечает ловушку!`, whisper: ChatMessage.getWhisperRecipients("GM").concat([game.users.find(u => u.character?.id === actor.id)?.id].filter(x=>x)), speaker: ChatMessage.getSpeaker({actor}) });
                   } else {
                       ChatMessage.create({ content: `<i>${actor.name} не заметил ловушку (PER ${roll.total} vs ${dc})</i>`, whisper: ChatMessage.getWhisperRecipients("GM") });
                   }
               }
          }
          if (sys.isTrapped?.value && sys.trapActive?.value && dist < 0.9) {
              await cActor.update({"system.attributes.trapActive.value": false}); 
              const dmg = sys.trapDmg?.value || "2d6";
              const r = new Roll(dmg);
              await r.evaluate();
              await actor.applyDamage(r.total, "fire", "torso");
              NoiseManager.add(20);
              ChatMessage.create({ content: `<div style="color:red; font-weight:bold;">💥 ЛОВУШКА!</div><div>Урон: ${r.total}</div>`, speaker: ChatMessage.getSpeaker({actor: cActor}) });
          }
      }
  });
});