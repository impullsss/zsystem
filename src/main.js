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

// Глобальный перехватчик: только ГМ исполняет команды урона и шума
Hooks.on("createChatMessage", async (message, options, userId) => {
    // Выполнять только если я ГМ
    if (!game.user.isGM) return;

    // Проверяем, есть ли в сообщении флаги нашей системы
    const flags = message.flags?.zsystem;
    if (!flags) return;

    // 1. Обработка ШУМА
    if (flags.noiseAdd > 0) {
        const current = game.settings.get("zsystem", "currentNoise");
        await game.settings.set("zsystem", "currentNoise", Math.max(0, current + flags.noiseAdd));
        console.log(`ZSystem (GM) | Шум увеличен на ${flags.noiseAdd} через чат.`);
    }

    // 2. Обработка УРОНА
    // Формат damageData: [{ uuid: "Scene.Token...", amount: 10, type: "blunt", limb: "torso" }]
    if (flags.damageData && Array.isArray(flags.damageData)) {
        for (let entry of flags.damageData) {
            const doc = await fromUuid(entry.uuid);
            if (!doc) continue;
            
            // Если это токен, получаем актора. Если актор - берем его.
            const actor = doc.actor || doc;
            
            if (actor) {
                // Вызываем метод нанесения урона. 
                // Важно: здесь мы (ГМ) уже имеем права, поэтому просто вызываем функцию.
                await actor.applyDamage(entry.amount, entry.type, entry.limb);
            }
        }
    }
});

Hooks.once("init", () => {
  console.log("ZSystem | Initializing (Chat-Ops Mode)...");

  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  // --- Хелперы Handlebars ---
  Handlebars.registerHelper('capitalize', str => typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '');
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
  Handlebars.registerHelper('eq', (a, b) => a == b);
  Handlebars.registerHelper('ne', (a, b) => a != b);
  Handlebars.registerHelper('or', (a, b) => a || b);
  Handlebars.registerHelper('and', (a, b) => a && b);
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('gte', (a, b) => a >= b);
  Handlebars.registerHelper('lt', (a, b) => a < b);

  // --- Конфигурация Системы ---
  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;
  CONFIG.Combat.initiative = { formula: "1d10 + @attributes.per.value", decimals: 2 };

  CONFIG.statusEffects = Object.values(GLOBAL_STATUSES).map(s => ({
      id: s.id, label: s.label, icon: s.icon, statuses: [s.id] 
  }));
  CONFIG.statusEffects.push({ id: "dead", label: "Мертв", icon: "icons/svg/skull.svg", statuses: ["dead"] });

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

Hooks.once("ready", () => console.log("ZSystem | Ready."));

// --- Доп. Хуки (Движение, бой и т.д.) ---
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
    const size = canvas.grid.size;
    const dx = Math.abs((changes.x ?? tokenDoc.x) - tokenDoc.x) / size;
    const dy = Math.abs((changes.y ?? tokenDoc.y) - tokenDoc.y) / size;
    const squaresMoved = Math.max(Math.round(dx), Math.round(dy));
    if (squaresMoved <= 0) return true;
    let cost = squaresMoved * (actor.effects.some(e => e.statuses.has("prone")) ? 2 : 1);
    const curAP = actor.system.resources.ap.value;
    if (curAP < cost) {
        ui.notifications.warn("Недостаточно AP.");
        return false;
    }
    actor.update({ "system.resources.ap.value": curAP - cost });
    return true;
});