// src/main.js
import { ZActor } from "./module/actor.js";
import { ZActorSheet } from "./module/actor-sheet.js";
import { ZItem } from "./module/item.js";
import { ZItemSheet } from "./module/item-sheet.js";
import { NoiseManager } from "./module/noise.js";
import { ZChat } from "./module/chat.js";

Hooks.once("init", () => {
  console.log("ZSystem | Initializing ZSystem");

  // --- РЕГИСТРАЦИЯ ХЕЛПЕРОВ HANDLEBARS ---
  Handlebars.registerHelper('capitalize', function(str) {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  Handlebars.registerHelper('gt', function(a, b) { return a > b; });
  Handlebars.registerHelper('eq', function(a, b) { return a == b; });
  Handlebars.registerHelper('and', function(a, b) { return a && b; });
  Handlebars.registerHelper('or', function(a, b) { return a || b; });
  
  Handlebars.registerHelper('concat', function() {
    var outStr = '';
    for (var arg in arguments) {
      if (typeof arguments[arg] !== 'object') {
        outStr += arguments[arg];
      }
    }
    return outStr;
  });
  // ---------------------------------------------------

  // 1. Регистрация классов документов
  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;

  // 2. Настройка Инициативы
  CONFIG.Combat.initiative = {
    formula: "1d10 + @attributes.per.value",
    decimals: 2
  };

  // 3. Регистрация листов (Sheets)
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("zsystem", ZActorSheet, {
    types: ["survivor", "npc"],
    makeDefault: true,
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("zsystem", ZItemSheet, {
    // ДОБАВИЛ "ammo" В СПИСОК НИЖЕ
    types: ["weapon", "armor", "consumable", "ammo", "resource", "medicine", "food", "materials", "luxury", "misc"],
    makeDefault: true,
  });

  // Настройки системы
  game.settings.register("zsystem", "apBaseFormula", {
    name: "AP base formula",
    hint: "Formula used to calculate base AP",
    scope: "world",
    config: true,
    type: String,
    default: "7 + Math.ceil((agi - 1) / 2)",
  });

  // Инициализация подсистем
  NoiseManager.init();
  ZChat.init(); 

  console.log("ZSystem | init hooks registered");
});

Hooks.once("ready", async () => {
  console.log("ZSystem | Ready — system loaded");

  // Хук восстановления AP
  Hooks.on("updateCombat", async (combat, changed) => {
    if (changed.turn !== undefined || changed.round !== undefined) {
      const combatant = combat.combatant;
      if (!combatant || !combatant.actor) return;
      
      const actor = combatant.actor;
      const maxAP = actor.system.resources.ap.max;
      await actor.update({ "system.resources.ap.value": maxAP });
      
      ui.notifications.info(`${actor.name}: AP восстановлены (${maxAP})`);
    }
  });

  // Хук для стака предметов
  Hooks.on("preCreateItem", (itemDoc, createData) => {
    const parent = itemDoc.parent;
    if (!parent || parent.documentName !== "Actor") return true;

    const data = foundry.utils.mergeObject(itemDoc.toObject(), createData);
    const incomingName = (data.name || "").trim();
    
    if (!incomingName) return true;

    const existingItem = parent.items.find(i => i.name === incomingName && i.type === data.type);
    
    if (existingItem) {
      const newQty = (existingItem.system.quantity || 1) + (data.system.quantity || 1);
      existingItem.update({ "system.quantity": newQty });
      ui.notifications.info(`Предмет "${incomingName}" объединен (Кол-во: ${newQty})`);
      return false;
    }
    return true;
  });
});