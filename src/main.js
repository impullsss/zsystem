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
  console.log("ZSystem | Initializing ZSystem");

  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  // Хелперы Handlebars (оставляем как было)
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
  
  // Классы
  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;
  CONFIG.Combat.initiative = { formula: "1d10 + @attributes.per.value", decimals: 2 };

  // Переводы (оставляем как было)
  const customTranslations = {
    TYPES: {
      Actor: { survivor: "Выживший", npc: "NPC", zombie: "Зомби", shelter: "Убежище" },
      Item: { weapon: "Оружие", armor: "Броня", consumable: "Расходник", ammo: "Патроны", resource: "Ресурс", medicine: "Медицина", food: "Еда", materials: "Материалы", luxury: "Роскошь", misc: "Разное", upgrade: "Постройка", project: "Проект" }
    }
  };
  foundry.utils.mergeObject(game.i18n.translations, customTranslations);
  if (game.i18n._fallback) foundry.utils.mergeObject(game.i18n._fallback, customTranslations);

  // --- ВАЖНО: СТАТУСЫ ДЛЯ ТОКЕНОВ ---
  // Мы берем значения из constants.js и превращаем в массив
  CONFIG.statusEffects = Object.values(GLOBAL_STATUSES).map(s => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      // Foundry v11+ может требовать statuses, v10 uses id
      statuses: [s.id] 
  }));
  // Добавляем стандартный статус "Мертв"
  CONFIG.statusEffects.push({ id: "dead", label: "Мертв", icon: "icons/svg/skull.svg", statuses: ["dead"] });

  // Регистрация листов
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
  
  Hooks.on("updateCombat", async (combat, changed) => {
    if (changed.turn !== undefined || changed.round !== undefined) {
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
      const grid = canvas.grid;
      const size = grid.size;
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

  Hooks.on("createToken", async (tokenDoc, options, userId) => {
      if (userId !== game.user.id) return;

      // Только для отвязанных токенов (не прототипов)
      if (!tokenDoc.actorLink) {
          const actor = tokenDoc.actor;
          if (!actor) return;

          if (["harvest_spot", "container"].includes(actor.type)) {
              // 3 = OWNER (Владелец). Это позволяет запускать скрипты внутри.
              await actor.update({
                  "ownership.default": 3 
              });
          }
      }
  });
  Hooks.on("preDeleteToken", (tokenDoc, context, userId) => {
      // Если удаляет ГМ - разрешаем
      if (game.user.isGM) return true;

      const actor = tokenDoc.actor;
      if (!actor) return true;

      // Если игрок пытается удалить лут
      if (["harvest_spot", "container"].includes(actor.type)) {
          ui.notifications.warn("Вы не можете удалить этот объект!");
          return false; // ОТМЕНЯЕМ УДАЛЕНИЕ
      }
      return true;
  });

});