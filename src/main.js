import { ZActor } from "./module/actor.js";
import { ZActorSheet } from "./module/actor-sheet.js";
import { ZItem } from "./module/item.js";
import { ZItemSheet } from "./module/item-sheet.js";
import { NoiseManager } from "./module/noise.js";
import { ZChat } from "./module/chat.js";
import { GLOBAL_STATUSES } from "./module/constants.js";

Hooks.once("init", () => {
  console.log("ZSystem | Initializing ZSystem");

  // --- 1. ХЕЛПЕРЫ ---
  // ВАЖНО: Мы НЕ добавляем selectOptions, он встроен в Foundry V13
  Handlebars.registerHelper('capitalize', str => typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '');
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('lt', (a, b) => a < b);
  Handlebars.registerHelper('eq', (a, b) => a == b);
  Handlebars.registerHelper('ne', (a, b) => a != b); 
  Handlebars.registerHelper('and', (a, b) => a && b);
  Handlebars.registerHelper('or', (a, b) => a || b);
  
  // --- 2. НАСТРОЙКА КЛАССОВ ---
  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;
  CONFIG.Combat.initiative = { formula: "1d10 + @attributes.per.value", decimals: 2 };

  // --- 3. ЛЕЧЕНИЕ ВЫПАДАЮЩИХ СПИСКОВ (FIX [object Object]) ---
  // Мы прописываем названия жестко в конфиг.
  CONFIG.Actor.typeLabels = {
    survivor: "Выживший",
    npc: "NPC",
    zombie: "Зомби"
  };

  CONFIG.Item.typeLabels = {
    weapon: "Оружие",
    armor: "Броня",
    consumable: "Расходник",
    ammo: "Патроны",
    resource: "Ресурс",
    medicine: "Медицина",
    food: "Еда",
    materials: "Материалы",
    luxury: "Роскошь",
    misc: "Разное"
  };

  // --- 4. СТАТУСЫ ---
  CONFIG.statusEffects = [
    GLOBAL_STATUSES.bleeding,
    GLOBAL_STATUSES.prone,
    GLOBAL_STATUSES.panic,
    { id: "dead", label: "Мертв", icon: "icons/svg/skull.svg" }
  ];

  // --- 5. РЕГИСТРАЦИЯ ЛИСТОВ ---
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("zsystem", ZActorSheet, { 
    types: ["survivor", "npc", "zombie"], 
    makeDefault: true 
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("zsystem", ZItemSheet, { 
    makeDefault: true 
  });

  NoiseManager.init();
  ZChat.init(); 
});

Hooks.once("ready", async () => {
  
  // Хук начала хода
  Hooks.on("updateCombat", async (combat, changed) => {
    if (changed.turn !== undefined || changed.round !== undefined) {
      const combatant = combat.combatant;
      if (combatant?.actor?.onTurnStart) {
          await combatant.actor.onTurnStart();
      }
    }
  });

  // Хук Движения (Штраф Prone x2 AP)
  Hooks.on("preUpdateToken", (tokenDoc, changes, context, userId) => {
      if (changes.x === undefined && changes.y === undefined) return true;
      const actor = tokenDoc.actor;
      if (!actor || !tokenDoc.inCombat) return true;

      const currentPos = { x: tokenDoc.x, y: tokenDoc.y };
      const newPos = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
      const grid = canvas.grid;
      
      // Безопасный расчет дистанции для V13
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
      ui.notifications.info(`Движение: -${totalCost} AP ${isProne ? "(Ползком)" : ""}`);
      return true;
  });

  // Хук Стак Предметов
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
});