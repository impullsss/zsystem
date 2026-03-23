import { ZActor } from "./module/actor.js";
import { ZActorSheet } from "./module/actor-sheet.js";
import { ZShelterSheet } from "./module/shelter-sheet.js";
import { ZContainerSheet } from "./module/container-sheet.js";
import { ZItem } from "./module/item.js";
import { ZItemSheet } from "./module/item-sheet.js";
import { NoiseManager } from "./module/noise.js";
import { ZChat } from "./module/chat.js";
import { GLOBAL_STATUSES, INJURY_EFFECTS } from "./module/constants.js";
import { ZHarvestSheet } from "./module/harvest-sheet.js";
import { ZVehicleSheet } from "./module/vehicle-sheet.js";
import { TravelManager } from "./module/travel.js"; 
import { PerkLogic } from "./module/perk-logic.js"; 

// Глобальный перехватчик: только ГМ исполняет команды
Hooks.on("createChatMessage", async (message, options, userId) => {
  if (!game.user.isGM) return; // Только ГМ обрабатывает логику
  
  const flags = message.flags?.zsystem;

  if (flags?.transferItem) {
    const { sourceUuid, targetActorUuid } = flags.transferItem;
    
    // fromUuid работает и с простыми ID, и с полными путями Actor.id или Scene.id.Token.id
    const item = await fromUuid(sourceUuid);
    const targetActor = await fromUuid(targetActorUuid);

    if (item && targetActor) {
        // Если targetActor - это токен, берем его актора
        const target = targetActor.actor || targetActor;
        
        const itemData = item.toObject();
        await target.createEmbeddedDocuments("Item", [itemData]);
        await item.delete();
        
        console.log(`ZSystem | ГМ переложил ${item.name} в инвентарь ${target.name}`);
    }
  }

  if (!flags) return;

  if (flags.type === "heal") {
      const { healerUuid, targetUuid, itemData, limbKey } = flags;
      
      const healer = await fromUuid(healerUuid);
      const target = await fromUuid(targetUuid);
      
      if (healer && target) {
          // Вызываем метод НА АКТОРЕ, но исполняет его ГМ (потому что этот код работает у ГМа)
          // Если target - токен, берем .actor
          const realTarget = target.actor || target;
          const realHealer = healer.actor || healer;
          
          await realTarget.applyMedicineLogic(realHealer, itemData, limbKey);
      }
  }

  // --- НОВОЕ: Перемотка Времени (Travel System) ---
  if (flags.advanceTime > 0) {
      await game.time.advance(flags.advanceTime);
      // Опционально: можно не писать уведомление, так как чат-карта уже есть
  }

  // УДАЛЕНИЕ ПРЕДМЕТА (При перемещении без прав владельца)
  if (flags.deleteItemUuid) {
      const itemToDelete = await fromUuid(flags.deleteItemUuid);
      if (itemToDelete) {
          await itemToDelete.delete();
          // Удаляем техническое сообщение
          setTimeout(() => message.delete(), 500); 
      }
  }

  // 1. ШУМ И АГРО
  if (flags.noiseAdd > 0) {
    // А) Глобальный шум
    const current = game.settings.get("zsystem", "currentNoise");
    await game.settings.set("zsystem", "currentNoise", Math.max(0, current + flags.noiseAdd));

    // Б) Локальное Агро (НОВОЕ)
    // Пытаемся найти токен источника
    let sourceToken = null;
    
    // 1. Пробуем через speaker.token (если это токен на сцене)
    if (message.speaker?.token) {
        sourceToken = canvas.tokens.get(message.speaker.token);
    } 
    // 2. Если нет, пробуем через speaker.actor (находим первый активный токен этого актора)
    else if (message.speaker?.actor) {
        const actor = game.actors.get(message.speaker.actor);
        if (actor) {
            const tokens = actor.getActiveTokens();
            if (tokens.length > 0) sourceToken = tokens[0];
        }
    }

    // Если нашли источник — запускаем проверку
    if (sourceToken) {
        await NoiseManager.checkAggro(sourceToken, flags.noiseAdd);
    }
  }

  // --- НОВОЕ: РАСПАКОВКА GM INFO ---
  // ГМ видит сообщение с флагом gmInfo и создает для себя приватную копию
  if (flags.gmInfo) {
      // Создаем сообщение локально только для ГМа (себя)
      // Важно: мы не используем Socket, мы просто создаем сообщение в чате ГМа от имени Системы
      await ChatMessage.create({
          user: game.user.id,
          speaker: { alias: "System" },
          content: flags.gmInfo,
          whisper: [game.user.id],
          type: CONST.CHAT_MESSAGE_TYPES.WHISPER,
          sound: null // Без звука
      });
      
      // Опционально: очистить флаг из оригинала, чтобы не дублировать при перезагрузке, 
      // но это не обязательно для чата.
  }
  // --------------------------------

  // 2. УРОН И ЭФФЕКТЫ
  if (flags.damageData && Array.isArray(flags.damageData)) {
      const undoLog = [];
      for (let entry of flags.damageData) {
        const doc = await fromUuid(entry.uuid);
        const actor = doc?.actor || doc;
        if (actor) {
             // 1. Наносим урон
             const undoData = await actor.applyDamage(entry.amount, entry.type, entry.limb);
             
             // 2. Накладываем эффекты (НОВОЕ)
             if (entry.effects && entry.effects.length > 0) {
                 for (let effectId of entry.effects) {
                     // Ищем данные эффекта в константах
                     // Важно: GLOBAL_STATUSES должен быть импортирован в main.js
                     const statusData = Object.values(GLOBAL_STATUSES).find(s => s.id === effectId || s.statuses.includes(effectId));
                     
                     if (statusData && !actor.hasStatusEffect(statusData.id)) {
                         const created = await actor.createEmbeddedDocuments("ActiveEffect", [statusData]);
                         // Добавляем ID созданного эффекта в лог отмены, чтобы кнопка "Отменить" сняла и его
                         if (undoData && created.length > 0) {
                             undoData.createdEffectIds.push(created[0].id);
                         }
                         // Уведомление
                         ui.notifications.info(`${actor.name}: наложен эффект ${statusData.label}`);
                     }
                 }
             }

             if (undoData) undoLog.push(undoData);
        }
      }
      if (undoLog.length > 0) await message.setFlag("zsystem", "undoData", undoLog);
  }

  // 3. ОБНОВЛЕНИЕ АКТОРОВ (Без изменений)
  if (flags.actorUpdate) {
    const doc = await fromUuid(flags.actorUpdate.uuid);
    const actor = doc?.actor || doc;
    if (actor) {
      const updates = flags.actorUpdate.updates;
      await actor.update(updates);
      if (updates.img && actor.isToken) {
        await actor.token.update({ texture: { src: updates.img } });
      }
    }
  }

   // 4. ВИЗУАЛЬНЫЕ ЭФФЕКТЫ (Трассеры) --- НОВОЕ ---
  if (flags.visuals && flags.visuals.type === "tracer") {
      const data = flags.visuals.data;
      // ГМ создает рисунок
      const doc = (await canvas.scene.createEmbeddedDocuments("Drawing", [data]))[0];
      
      // Удаляем рисунок через 1 сек
      if (doc) {
          setTimeout(async () => { 
              if (canvas.scene.drawings.has(doc.id)) await doc.delete(); 
          }, 1000);
      }
      
      // Удаляем само техническое сообщение, чтобы не засорять чат ГМа
      // (Делаем небольшую задержку, чтобы не конфликтовать с созданием)
      setTimeout(() => message.delete(), 500);
  }

});

  

// === ИСПРАВЛЕННЫЙ ХУК: Контекстное меню (Отмена Урона) ===
Hooks.on("getChatMessageContextOptions", (html, options) => {
  options.push({
    name: "Отменить Урон",
    icon: '<i class="fas fa-undo"></i>',
    condition: (li) => {
      const messageId = $(li).data("messageId");
      const message = game.messages.get(messageId);
      return game.user.isGM && message?.getFlag("zsystem", "undoData");
    },
    callback: async (li) => {
      const messageId = $(li).data("messageId");
      const message = game.messages.get(messageId);
      const undoLog = message?.getFlag("zsystem", "undoData");

      if (!undoLog || !Array.isArray(undoLog)) return;

      for (let entry of undoLog) {
        // ФИКС: Используем fromUuid для поиска, поддерживая и токены, и акторов
        const doc = await fromUuid(entry.uuid);
        const actor = doc?.actor || doc; // Если doc это TokenDocument, берем .actor. Если Actor, то это он сам.

        if (actor) {
          // 1. Откат значений
          if (!foundry.utils.isEmpty(entry.updates)) {
            await actor.update(entry.updates);
          }

          // 2. Удаление созданных эффектов
          if (entry.createdEffectIds && entry.createdEffectIds.length > 0) {
            // Фильтруем ID: удаляем только те, что реально существуют на акторе сейчас
            const idsToDelete = entry.createdEffectIds.filter((id) =>
              actor.effects.has(id)
            );

            if (idsToDelete.length > 0) {
              await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
            }
          }
          ui.notifications.info(`Откат для ${actor.name} выполнен.`);
        } else {
            ui.notifications.warn(`Не удалось найти актора для отката (UUID: ${entry.uuid})`);
        }
      }
      // Удаляем флаг, чтобы нельзя было отменить дважды
      await message.unsetFlag("zsystem", "undoData");
    },
  });
});

Hooks.once("init", () => {
  console.log("ZSystem | Initializing...");
  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  Handlebars.registerHelper("capitalize", (str) =>
    typeof str === "string" ? str.charAt(0).toUpperCase() + str.slice(1) : ""
  );
  Handlebars.registerHelper("calculatePercentage", (value, max) =>
    Math.min(
      100,
      Math.max(0, ((Number(value) || 0) / (Number(max) || 1)) * 100)
    )
  );
  Handlebars.registerHelper("getLimbColor", (value, max) => {
    const pct = Math.min(
      1,
      Math.max(0, (Number(value) || 0) / (Number(max) || 1))
    );
    const hue = Math.floor(120 * pct);
    return `hsl(${hue}, 80%, 35%)`;
  });

  Handlebars.registerHelper("eq", (a, b) => a == b);
  Handlebars.registerHelper("ne", (a, b) => a != b);
  Handlebars.registerHelper("or", (a, b) => a || b);
  Handlebars.registerHelper("and", (a, b) => a && b);
  Handlebars.registerHelper("gt", (a, b) => a > b);
  Handlebars.registerHelper("lt", (a, b) => a < b);
  Handlebars.registerHelper("gte", (a, b) => a >= b);
  Handlebars.registerHelper("mod", (a, b) => Number(a) % Number(b));
  Handlebars.registerHelper("floor", (a) => Math.floor(Number(a)));
  Handlebars.registerHelper("div", (a, b) => Number(a) / Number(b));
  Handlebars.registerHelper("mult", (a, b) => Number(a) * Number(b));
  Handlebars.registerHelper("sum", (a, b) => Number(a) + Number(b));

  game.settings.register("zsystem", "debugNoise", {
    name: "Debug: Визуализация Шума",
    hint: "Рисует круг радиуса шума при каждом действии (удаляется через 3 сек).",
    scope: "client",
    config: true,
    type: Boolean,
    default: true // Включим по умолчанию для тестов
  });

  game.settings.register("zsystem", "restrictMovement", {
    name: "Ограничить движение в бою",
    hint: "Игроки могут двигать токены только в свой ход.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Настройка контроля атак
  game.settings.register("zsystem", "restrictAttack", {
    name: "Ограничить атаки в бою",
    hint: "Игроки могут атаковать только в свой ход.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  // Настройки Прицеливания (Aiming)
  game.settings.register("zsystem", "aimCost", {
    name: "Цена прицеливания (AP)",
    hint: "Сколько AP стоит один шаг прицеливания.",
    scope: "world",
    config: true,
    type: Number,
    default: 1
  });

  game.settings.register("zsystem", "aimBonus", {
    name: "Бонус прицеливания (%)",
    hint: "Сколько % точности дает один шаг.",
    scope: "world",
    config: true,
    type: Number,
    default: 10
  });

  game.settings.register("zsystem", "aimMax", {
    name: "Максимум прицеливания (Шаги)",
    hint: "Сколько раз можно вложить AP в один выстрел.",
    scope: "world",
    config: true,
    type: Number,
    default: 3
  });

  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;
  CONFIG.Combat.initiative = {
    formula: "1d10 + @attributes.per.value",
    decimals: 2,
  };

 const allStatuses =[...Object.values(GLOBAL_STATUSES), ...Object.values(INJURY_EFFECTS)];
  
  CONFIG.statusEffects = allStatuses.map((s) => ({
    id: s.id,
    label: s.label || s.name, // У травм используется 'name', у статусов 'label'
    icon: s.icon || s.img,    // У травм 'img', у статусов 'icon'
    statuses: [s.id],
  }));

  CONFIG.statusEffects.push({
    id: "dead",
    label: "Мертв",
    icon: "icons/svg/skull.svg",
    statuses: ["dead"],
  });

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("zsystem", ZActorSheet, {
    types: ["survivor", "npc", "zombie"],
    makeDefault: true,
    label: "Лист Персонажа",
  });
  Actors.registerSheet("zsystem", ZShelterSheet, {
    types: ["shelter"],
    makeDefault: true,
    label: "Управление Убежищем",
  });
  Actors.registerSheet("zsystem", ZContainerSheet, {
    types: ["container"],
    makeDefault: true,
    label: "Контейнер",
  });
  Actors.registerSheet("zsystem", ZHarvestSheet, {
    types: ["harvest_spot"],
    makeDefault: true,
    label: "Сбор Ресурсов",
  });
  Actors.registerSheet("zsystem", ZVehicleSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "Транспорт"
  });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("zsystem", ZItemSheet, { makeDefault: true });

  NoiseManager.init();
  ZChat.init();
});

Hooks.once("ready", () => console.log("ZSystem | Ready."));

Hooks.on("updateCombat", async (combat, changed) => {
  if (
    game.user.isGM &&
    (changed.turn !== undefined || changed.round !== undefined)
  ) {
    const combatant = combat.combatant;
    if (combatant?.actor?.onTurnStart) await combatant.actor.onTurnStart();
  }
});

// --- Права на токены ---
Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
  const actor = tokenDoc.actor;
  if (!actor) return;
  if (["container", "harvest_spot"].includes(actor.type)) {
    tokenDoc.updateSource({
      actorLink: false,
      "sight.enabled": false,
      disposition: 0,
      displayBars: 0,
    });
  }
  if (actor.system.attributes?.isHidden?.value) {
    tokenDoc.updateSource({ hidden: true });
  }
});

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

// --- ЛОГИКА ТРИГГЕРОВ (ОСТАВЛЯЕМ КАК БЫЛО В ПРОШЛОМ ШАГЕ) ---
Hooks.on("updateToken", async (tokenDoc, changes, context, userId) => {
  if (userId !== game.user.id) return;
  if (!changes.x && !changes.y) return;

  const token = tokenDoc.object;
  const actor = token.actor;
  if (!actor || ["container", "harvest_spot", "shelter"].includes(actor.type))
    return;
  const isZombie = actor.type === "zombie";

  const interactiveObjs = canvas.tokens.placeables.filter(
    (t) => t.actor && ["container", "harvest_spot"].includes(t.actor.type)
  );

  for (let cToken of interactiveObjs) {
    const cActor = cToken.actor;
    const sys = cActor.system.attributes;
    if (!sys) continue;

    const dist = canvas.grid.measureDistance(token, cToken, {
      gridSpaces: true,
    });

    // 1. ОБНАРУЖЕНИЕ ТАЙНИКА
    if (!isZombie && sys.isHidden?.value) {
      const spotRadius = Number(sys.spotRadius?.value) || 2;
      if (dist <= spotRadius) {
        const flagKey = `checked_spot_${cToken.id}`;
        if (!actor.getFlag("zsystem", flagKey)) {
          await actor.setFlag("zsystem", flagKey, true);
          const per = actor.system.attributes.per.value;
          const roll = new Roll("1d10 + @per", { per });
          await roll.evaluate();
          const dc = sys.spotDC?.value || 15;
          if (roll.total >= dc) {
            await cActor.update({ "system.attributes.isHidden.value": false });
            await cToken.document.update({ hidden: false });
            ChatMessage.create({
              content: `<div style="color:green">👁️ <b>${actor.name}</b> замечает скрытый тайник!</div>`,
              speaker: ChatMessage.getSpeaker({ actor }),
            });
          } else {
            ChatMessage.create({
              content: `<i>${actor.name} проходит мимо тайника (PER ${roll.total} < ${dc})</i>`,
              whisper: ChatMessage.getWhisperRecipients("GM"),
            });
          }
        }
      }
    }

    // 2. АКТИВАЦИЯ ЛОВУШКИ
    if (sys.isTrapped?.value && sys.trapActive?.value) {
      const triggerDist = Number(sys.trapTriggerRadius?.value) || 1;
      if (dist <= triggerDist) {
        await cActor.update({ "system.attributes.trapActive.value": false });
        const dmgFormula = sys.trapDmg?.value || "2d6";
        const r = new Roll(dmgFormula);
        await r.evaluate();
        const noiseAmount = r.total > 0 ? 20 : 10;
        NoiseManager.add(noiseAmount);

        let targets = [actor];
        const blastRadius = Number(sys.trapDamageRadius?.value) || 0;
        if (blastRadius > 0) {
          const others = canvas.tokens.placeables.filter(
            (t) =>
              t.actor &&
              t.id !== token.id &&
              t.actor.type !== "container" &&
              t.actor.type !== "harvest_spot" &&
              canvas.grid.measureDistance(cToken, t, { gridSpaces: true }) <=
                blastRadius
          );
          others.forEach((t) => targets.push(t.actor));
        }

        const limbs = sys.trapLimbs || { torso: true };
        const activeLimbs = Object.keys(limbs).filter((k) => limbs[k]);
        if (activeLimbs.length === 0) activeLimbs.push("torso");

        ChatMessage.create({
          content: `<div style="color:red; font-weight:bold; font-size:1.2em;">💥 ЛОВУШКА СРАБОТАЛА!</div>
                          <div>Радиус: ${blastRadius}м</div>
                          <div>Урон: ${r.total} (x${activeLimbs.length} зон)</div>`,
          speaker: ChatMessage.getSpeaker({ actor: cActor }),
        });

        if (r.total > 0) {
          for (let victim of targets) {
            for (let limb of activeLimbs) {
              await victim.applyDamage(r.total, "fire", limb);
            }
          }
        }
      }
    }
  }
});

Hooks.on("renderSceneConfig", (app, html, data) => {
    // В V13 html приходит как DOM Element. Оборачиваем в jQuery.
    const $html = $(html);
    
    const scene = app.document; 
    if (!scene) return;

    const isGlobal = scene.getFlag("zsystem", "isGlobalMap");
    
    const formGroup = `
    <div class="form-group">
        <label>🌍 Глобальная Карта (Travel Mode)</label>
        <div class="form-fields">
            <input type="checkbox" name="flags.zsystem.isGlobalMap" ${isGlobal ? "checked" : ""}/>
        </div>
        <p class="notes">Если включено, движение токенов расходует Топливо (Vehicle) вместо AP.</p>
    </div>`;
    
    // Ищем инпут внутри вкладки Grid
    const gridInput = $html.find('select[name="grid.type"]');
    
    if (gridInput.length) {
        gridInput.closest(".form-group").after(formGroup);
    } else {
        // Фоллбэк: кидаем в начало вкладки Grid, если не нашли селект
        $html.find('div[data-tab="grid"]').prepend(formGroup);
    }
    
    // Обновляем высоту окна
    app.setPosition({height: "auto"});
});

Hooks.on("canvasReady", () => {
    // Если это игрок, принудительно снимаем выделение со всех токенов через 100мс
    if (!game.user.isGM) {
        setTimeout(() => {
            canvas.tokens.releaseAll();
        }, 100);
    }
});

Hooks.on("preUpdateToken", async (tokenDoc, changes, context, userId) => {
    // 1. Проверка движения
    if (changes.x === undefined && changes.y === undefined) return true;
    
    // 2. Инициатор (только свой токен)
    if (game.user.id !== userId) return true;

    const actor = tokenDoc.actor;
    if (!actor) return true;

    // --- ЛОГИКА ГЛОБАЛЬНОЙ КАРТЫ (ТРАНСПОРТ) ---
    const scene = tokenDoc.parent;
    const isGlobalMap = scene.getFlag("zsystem", "isGlobalMap");

    if (isGlobalMap) {
        // Если это глобальная карта — передаем управление TravelManager
        // Он сам спишет топливо и вернет true/false (разрешить ли движение)
        return await TravelManager.handleMovement(tokenDoc, changes);
    }

    // --- ЛОГИКА ТАКТИЧЕСКОГО БОЯ (AP) ---
    
    // 3. Проверка боя (AP расходуются только в бою)
    const inCombat = tokenDoc.inCombat || (game.combat?.active && game.combat.combatants.some(c => c.tokenId === tokenDoc.id));
    
    // Если мы НЕ на глобальной карте и НЕ в бою — движение свободное
    if (!inCombat) return true;

    // 4. Расчет клеток для AP
    const gridSize = canvas.dimensions.size; 
    const dx = Math.abs((changes.x ?? tokenDoc.x) - tokenDoc.x);
    const dy = Math.abs((changes.y ?? tokenDoc.y) - tokenDoc.y);
    const squaresMoved = Math.max(Math.round(dx / gridSize), Math.round(dy / gridSize));

    if (squaresMoved <= 0) return true;

    // 5. РАСЧЕТ СТОИМОСТИ AP
    let stepsCounter = actor.getFlag("zsystem", "turnSteps") || 0;
    let totalAPCost = 0;

    for (let i = 1; i <= squaresMoved; i++) {
        stepsCounter++;
        
        let singleStepCost = 1;
        if (actor.hasStatusEffect("prone")) singleStepCost = 2;
        if (actor.hasStatusEffect("overburdened")) singleStepCost = 2;
        if (actor.hasStatusEffect("stealth")) singleStepCost = 2;

        try {
            if (typeof PerkLogic !== "undefined") {
                singleStepCost = PerkLogic.onGetStepCost(actor, singleStepCost, stepsCounter);
            }
        } catch (e) { console.error("PerkLogic Error:", e); }

        totalAPCost += singleStepCost;
    }

    const currentAP = Number(actor.system.resources.ap?.value) || 0;

    // 6. Проверка лимита AP
    if (currentAP < totalAPCost) {
        ui.notifications.warn(`Недостаточно AP! Нужно: ${totalAPCost}, есть: ${currentAP}`);
        return false; // Блокируем ход
    }

    // 7. Списание AP
    await actor.update({ 
        "system.resources.ap.value": currentAP - totalAPCost,
        "flags.zsystem.turnSteps": stepsCounter
    });

    return true;
});

Hooks.on("createActiveEffect", async (effect, options, userId) => {
    if (userId !== game.user.id) return;
    if (effect.statuses.has("invisible")) {
        const actor = effect.parent;
        if (actor && actor.isToken) await actor.token.update({ hidden: true });
        else if (actor) {
            const tokens = actor.getActiveTokens();
            for (let t of tokens) await t.document.update({ hidden: true });
        }
    }
});

Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    if (userId !== game.user.id) return;
    if (effect.statuses.has("invisible")) {
        const actor = effect.parent;
        if (actor && actor.isToken) await actor.token.update({ hidden: false });
        else if (actor) {
            const tokens = actor.getActiveTokens();
            for (let t of tokens) await t.document.update({ hidden: false });
        }
    }
});

Hooks.on("deleteCombat", async (combat, options, userId) => {
    if (!game.user.isGM) return;

    for (let combatant of combat.combatants) {
        const actor = combatant.actor;
        if (actor) {
            const maxAP = actor.system.resources.ap.max || 7;
            await actor.update({ "system.resources.ap.value": maxAP });
        }
    }
    ui.notifications.info("Бой окончен. Очки действия восстановлены.");
});

Hooks.on("dropCanvasData", async (canvas, data) => {
    if (data.type !== "Item") return true;

    const targetToken = canvas.tokens.placeables.find(t => 
        (data.x >= t.x) && (data.x <= (t.x + t.w)) && (data.y >= t.y) && (data.y <= (t.y + t.h))
    );

    if (!targetToken || !targetToken.actor) return true;

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem || !sourceItem.actor || sourceItem.actor.uuid === targetToken.actor.uuid) return true;

    const sourceActor = sourceItem.actor;
    const targetActor = targetToken.actor;

    // Проверка дистанции
    const sourceToken = sourceActor.getActiveTokens()[0];
    if (sourceToken && canvas.grid.measureDistance(sourceToken, targetToken) > 2.5) {
        ui.notifications.warn("Слишком далеко!");
        return false;
    }

    // ВАЖНО: Вместо того чтобы менять данные самим, 
    // создаем невидимое сообщение, которое ГМ обработает
    ChatMessage.create({
        content: `<i>Система: Передача предмета ${sourceItem.name}...</i>`,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        flags: {
            zsystem: {
                transferItem: {
                    sourceUuid: sourceItem.uuid,
                    targetActorUuid: targetActor.uuid
                }
            }
        }
    });

    ui.notifications.info(`Запрос на передачу ${sourceItem.name} отправлен.`);
    return false;
});
// Логика действий (вынесем в глобальный класс, чтобы не загромождать хук)
class ZSystemActions {
    static async interact() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken) return ui.notifications.warn("Сначала выделите своего персонажа!");

        // Ищем цели в радиусе 3.5 метров
        const targets = canvas.tokens.placeables.filter(t => {
            if (t.id === myToken.id || !t.actor) return false;
            return canvas.grid.measureDistance(myToken, t) <= 3.5;
        });

        if (targets.length === 0) return ui.notifications.warn("Рядом нет ничего интересного.");

        // Сортировка по дистанции
        targets.sort((a, b) => canvas.grid.measureDistance(myToken, a) - canvas.grid.measureDistance(myToken, b));
        const target = targets[0];

        // ВНИМАНИЕ: Если это контейнер или NPC, принудительно открываем лист.
        // Мы используем render(true), но Foundry v13 может блокировать это без прав.
        // Если лист не открывается, ГМу нужно поставить права "Observer" для игроков.
        target.actor.sheet.render(true);
        ui.notifications.info(`Взаимодействие с ${target.name}`);
    }

    static async manualSearch() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken) return ui.notifications.warn("Сначала выделите своего персонажа!");
        
        const actor = myToken.actor;

        // 1. Выполняем бросок Восприятия
        // Мы используем существующий метод актора, но нам нужен результат броска
        const label = "Поиск (Восприятие)";
        
        // Повторяем логику броска, чтобы получить доступ к результату (total)
        const per = actor.system.attributes.per.value;
        const roll = new Roll("1d10 + @per", { per });
        await roll.evaluate();

        // Отправляем бросок в чат
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `<b>${actor.name}</b> внимательно осматривает местность...`
        });

        const searchResult = roll.total;
        let foundCount = 0;

        // 2. Ищем скрытые токены на сцене
        const hiddenTokens = canvas.tokens.placeables.filter(t => t.document.hidden);

        for (let t of hiddenTokens) {
            const targetActor = t.actor;
            if (!targetActor) continue;

            const sys = targetActor.system.attributes;
            // Проверяем, есть ли у объекта параметры сложности обнаружения (DC)
            const spotDC = sys?.spotDC?.value || 15;
            const spotRadius = sys?.spotRadius?.value || 5; // Радиус поиска в метрах

            // Проверка дистанции
            const dist = canvas.grid.measureDistance(myToken, t);

            if (dist <= spotRadius) {
                // Если бросок выше или равен сложности обнаружения
                if (searchResult >= spotDC) {
                    // Раскрываем токен!
                    await t.document.update({ hidden: false });
                    
                    // Визуальный эффект над найденным объектом
                    canvas.interface.createScrollingText(t.center, "👁️ Найдено!", {
                        fill: "#ffeb3b",
                        stroke: 0x000000,
                        fontSize: 32,
                        fontWeight: "bold"
                    });
                    
                    foundCount++;
                }
            }
        }

        if (foundCount > 0) {
            ui.notifications.info(`Вы обнаружили что-то интересное! (${foundCount} шт.)`);
        } else {
            // Маленький спецэффект вокруг игрока, чтобы показать радиус поиска
            this._visualizeSearchRadius(myToken, 5); 
        }
    }

    // Вспомогательный метод для красоты
    static async _visualizeSearchRadius(token, radius) {
        const templateData = {
            t: "circle",
            user: game.user.id,
            distance: radius,
            direction: 0,
            x: token.center.x,
            y: token.center.y,
            fillColor: "#512da8",
            alpha: 0.1,
            borderColor: "#9575cd"
        };
        const doc = (await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]))[0];
        setTimeout(() => { if (doc) doc.delete(); }, 1500);
    }
}

// === 2. ХУК РЕГИСТРАЦИИ (С ПОДДЕРЖКОЙ MONK'S MODULES) ===
Hooks.on("getSceneControlButtons", (controls) => {
    const zControl = {
        name: "zsystem-actions",
        title: "Действия Выживания",
        layer: "tokens", 
        icon: "fas fa-biohazard",
        visible: true,
        tools: [
            {
                name: "z-interact",
                title: "Взаимодействовать",
                icon: "fas fa-hand-paper",
                button: true, // Это мгновенное действие
                onClick: () => ZSystemActions.interact()
            },
            {
                name: "z-search",
                title: "Поиск (Восприятие)",
                icon: "fas fa-search",
                button: true, // Это мгновенное действие
                onClick: () => ZSystemActions.manualSearch()
            }
        ]
    };

    if (Array.isArray(controls)) controls.push(zControl);
    else controls["zsystem-actions"] = zControl;
});

Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type !== "Item") return true;
  createItemMacro(data, slot);
  return false;
});

async function createItemMacro(data, slot) {
  // Получаем предмет по его UUID
  const item = await fromUuid(data.uuid);
  if (!item || item.type !== "weapon") {
      return ui.notifications.warn("На панель можно выносить только оружие.");
  }

  // Команда, которую будет исполнять макрос
  const command = `game.zsystem.rollItemMacro("${item.name}");`;
  
  // Проверяем, существует ли уже такой макрос
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "zsystem.itemMacro": true }
    });
  }

  // Назначаем макрос в выбранный слот
  game.user.assignHotbarMacro(macro, slot);
}

// Регистрируем глобальный хелпер для макроса в объекте game
Hooks.once("ready", () => {
    game.zsystem = game.zsystem || {};
    game.zsystem.rollItemMacro = (itemName) => {
        const speaker = ChatMessage.getSpeaker();
        let actor;
        if (speaker.token) actor = canvas.tokens.get(speaker.token).actor;
        if (!actor) actor = game.actors.get(speaker.actor);
        
        if (!actor) return ui.notifications.warn("Сначала выберите токен персонажа!");

        const item = actor.items.find(i => i.name === itemName);
        if (!item) return ui.notifications.warn(`У персонажа ${actor.name} нет предмета "${itemName}"`);

        return actor.performAttack(item.id);
    };
});

// === АВТО-ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ПРИ ВЫДЕЛЕНИИ ===
Hooks.on("controlToken", (token, controlled) => {
    // Ждем 50мс, чтобы Foundry успела обновить массив canvas.tokens.controlled
    setTimeout(() => {
        Object.values(ui.windows).forEach(app => {
            // Проверяем, что это окно Актора и нужного типа
            if (app.document && app.document.documentName === "Actor" && 
               ["harvest_spot", "container"].includes(app.document.type)) {
                app.render(false);
            }
        });
    }, 50); 
});