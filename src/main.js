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

// --- Хелпер для обработки сокетов ---
// Выносим функцию отдельно, чтобы она была стабильной
function handleZSystemSocket(data) {
    if (!game.user.isGM) return; 
    console.log("ZSystem (GM) | Socket received:", data);
    
    if (data.type === "noise") {
        NoiseManager.add(data.amount);
    }
}

Hooks.once("init", () => {
  console.log("ZSystem | Initializing...");

  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  // --- HANDLEBARS HELPERS ---
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
      
      if (value <= 0) return "#000000"; // Черный (мертв/отрублен)
      
      const pct = Math.min(1, Math.max(0, value / max));
      
      // HSL: 120 = Зеленый, 0 = Красный.
      // Мы идем от 120 до 0.
      const hue = Math.floor(120 * pct);
      
      // Насыщенность 60%, Темнота 40% (чтобы на бумаге смотрелось норм)
      return `hsl(${hue}, 80%, 35%)`; 
  });
  
  // --- CONFIG ---
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

  // --- REGISTRATION ---
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

Hooks.once("ready", async () => {
  // --- SOCKETS (FINAL ATTEMPT) ---
  // 1. Отключаем старое (если было)
  game.socket.off("system.zsystem");
  // 2. Включаем новое
  game.socket.on("system.zsystem", handleZSystemSocket);
  console.log("ZSystem | Socket Listener Attached.");
  // -------------------------------

  Hooks.on("updateCombat", async (combat, changed) => {
    if (changed.turn !== undefined || changed.round !== undefined) {
      const combatant = combat.combatant;
      if (combatant?.actor?.onTurnStart) await combatant.actor.onTurnStart();
    }
  });

  // Логика движения AP
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
      const isProne = actor.effects.some(e => e.statuses.has("prone"));
      if (isProne) costPerSquare = 2; 

      const totalCost = squaresMoved * costPerSquare;
      const curAP = actor.system.resources.ap.value;

      if (curAP < totalCost) {
          ui.notifications.warn(`${actor.name}: Недостаточно AP (${totalCost} нужно, ${curAP} есть).`);
          return false;
      }
      actor.update({ "system.resources.ap.value": curAP - totalCost });
      ui.notifications.info(`Движение: -${totalCost} AP`);
      return true;
  });

  // Логика стаков
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

  // Логика токенов
  Hooks.on("createToken", async (tokenDoc, options, userId) => {
      if (userId !== game.user.id) return;
      if (!tokenDoc.actorLink) {
          const actor = tokenDoc.actor;
          if (!actor) return;
          if (["harvest_spot", "container"].includes(actor.type)) {
              await actor.update({ "ownership.default": 3 });
          }
      }
  });

  Hooks.on("preDeleteToken", (tokenDoc, context, userId) => {
      if (game.user.isGM) return true;
      const actor = tokenDoc.actor;
      if (!actor) return true;
      if (["harvest_spot", "container"].includes(actor.type)) {
          ui.notifications.warn("Вы не можете удалить этот объект!");
          return false;
      }
      return true;
  });
});