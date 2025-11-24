import { ZActor } from "./module/actor.js";
import { ZActorSheet } from "./module/actor-sheet.js";
import { ZItem } from "./module/item.js";
import { ZItemSheet } from "./module/item-sheet.js";
import { NoiseManager } from "./module/noise.js";
import { ZChat } from "./module/chat.js";
import { GLOBAL_STATUSES } from "./module/constants.js";

Hooks.once("init", () => {
  console.log("ZSystem | Initializing ZSystem");

  // --- ХЕЛПЕРЫ ---
  Handlebars.registerHelper('capitalize', str => typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '');
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('lt', (a, b) => a < b);
  Handlebars.registerHelper('eq', (a, b) => a == b);
  Handlebars.registerHelper('ne', (a, b) => a != b); // Added Not Equal
  Handlebars.registerHelper('and', (a, b) => a && b);
  Handlebars.registerHelper('or', (a, b) => a || b);
  
  Handlebars.registerHelper('selectOptions', (choices, options) => {
      let selected = options.hash.selected;
      let html = "";
      for (let [key, label] of Object.entries(choices)) {
          const isSelected = selected === key ? "selected" : "";
          html += `<option value="${key}" ${isSelected}>${label}</option>`;
      }
      return new Handlebars.SafeString(html);
  });

  // 1. Классы
  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;

  // 2. Инициатива
  CONFIG.Combat.initiative = {
    formula: "1d10 + @attributes.per.value",
    decimals: 2
  };

   // --- РЕГИСТРАЦИЯ СТАТУСОВ ---
  CONFIG.statusEffects = [
    GLOBAL_STATUSES.bleeding,
    GLOBAL_STATUSES.prone,
    GLOBAL_STATUSES.panic,
    { id: "dead", label: "Мертв", name: "Мертв", icon: "icons/svg/skull.svg" }
  ];

  // 3. Листы
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("zsystem", ZActorSheet, { types: ["survivor", "npc"], makeDefault: true });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("zsystem", ZItemSheet, { makeDefault: true });

  NoiseManager.init();
  ZChat.init(); 

  console.log("ZSystem | init hooks registered");
});

Hooks.once("ready", async () => {
  
  // --- ХУК: СМЕНА ХОДА (Восстановление AP + Кровотечение) ---
  Hooks.on("updateCombat", async (combat, changed) => {
    // Реагируем только если сменился ход (turn) или раунд (round)
    if (changed.turn !== undefined || changed.round !== undefined) {
      const combatant = combat.combatant;
      if (!combatant || !combatant.actor) return;
      
      // Вызываем метод актера, где прописана вся логика начала хода
      await combatant.actor.onTurnStart();
    }
  });

  // --- ХУК: ДВИЖЕНИЕ (Списание AP) ---
  Hooks.on("preUpdateToken", (tokenDoc, changes, context, userId) => {
      // 1. Проверяем, двигается ли токен (изменились x или y)
      if (changes.x === undefined && changes.y === undefined) return true;
      
      const actor = tokenDoc.actor;
      if (!actor) return true;

      // 2. Работаем только если мы в бою (Turn-based logic)
      if (!tokenDoc.inCombat) return true;

      // 3. Вычисляем дистанцию
      // Для сетки 1x1 distance возвращает кол-во клеток (обычно)
      const currentPos = { x: tokenDoc.x, y: tokenDoc.y };
      const newPos = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
      
      // В Dead State диагонали стоят 1 AP (Chebyshev distance).
      // Foundry canvas.grid.measureDist может считать евклидову. 
      // Простой способ для клеточной логики:
      const grid = canvas.grid;
      const r1 = grid.getGridPositionFromPixels(currentPos.x, currentPos.y);
      const r2 = grid.getGridPositionFromPixels(newPos.x, newPos.y);
      
      // Разница в клетках (максимальная по оси - это и есть Chebyshev для 8 направлений)
      const dx = Math.abs(r1[0] - r2[0]);
      const dy = Math.abs(r1[1] - r2[1]);
      const squaresMoved = Math.max(dx, dy);

      if (squaresMoved <= 0) return true;

      // 4. Расчет стоимости (1 клетка = 1 AP)
      // Если есть штрафы на движение (от брони или ног), можно добавить сюда
      // const movePenalty = actor.system.secondary.movePenalty || 0;
      const cost = squaresMoved; // + movePenalty

      const curAP = actor.system.resources.ap.value;

      // 5. Проверка и списание
      if (curAP < cost) {
          ui.notifications.warn(`${actor.name}: Недостаточно AP для движения (Нужно: ${cost}, Есть: ${curAP})`);
          return false; // Блокируем движение
      }

      // Списываем AP (обновляем актера, но не ждем await, чтобы не фризить UI)
      actor.update({ "system.resources.ap.value": curAP - cost });
      
      // Визуальный фидбек
      ui.notifications.info(`${actor.name}: Движение -${cost} AP`);
      
      return true;
  });

  // ХУК: Стакинг предметов
  Hooks.on("preCreateItem", (itemDoc, createData) => {
    const parent = itemDoc.parent;
    if (!parent || parent.documentName !== "Actor") return true;
    const data = foundry.utils.mergeObject(itemDoc.toObject(), createData);
    const incomingName = (data.name || "").trim();
    if (!incomingName) return true;
    
    // Ищем предмет с таким же именем и типом
    const existingItem = parent.items.find(i => i.name === incomingName && i.type === data.type);
    
    if (existingItem) {
      // Если это стакуемый тип
      const stackable = ["ammo", "consumable", "resource", "medicine", "food", "materials", "luxury", "misc"];
      if (stackable.includes(data.type)) {
          const newQty = (Number(existingItem.system.quantity) || 1) + (Number(data.system.quantity) || 1);
          existingItem.update({ "system.quantity": newQty });
          ui.notifications.info(`Предмет "${incomingName}" добавлен в стак (Всего: ${newQty})`);
          return false; // Отменяем создание нового, так как обновили старый
      }
    }
    return true;
  });
});