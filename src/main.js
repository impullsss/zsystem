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
import { ZVehicleSheet } from "./module/vehicle-sheet.js";
import { TravelManager } from "./module/travel.js";

// Глобальный перехватчик: только ГМ исполняет команды
Hooks.on("createChatMessage", async (message, options, userId) => {
  if (!game.user.isGM) return; // Только ГМ обрабатывает логику
  
  const flags = message.flags?.zsystem;
  if (!flags) return;

  // --- НОВОЕ: Перемотка Времени (Travel System) ---
  if (flags.advanceTime > 0) {
      await game.time.advance(flags.advanceTime);
      // Опционально: можно не писать уведомление, так как чат-карта уже есть
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

  // 2. УРОН (Без изменений)
  if (flags.damageData && Array.isArray(flags.damageData)) {
      // ... (твой старый код обработки урона и Undo) ...
      const undoLog = [];
      for (let entry of flags.damageData) {
        // ...
        // КОД УРОНА ОСТАВЛЯЕМ КАК БЫЛ В ПРОШЛОМ ШАГЕ
        // ...
        const doc = await fromUuid(entry.uuid);
        const actor = doc?.actor || doc;
        if (actor) {
             const undoData = await actor.applyDamage(entry.amount, entry.type, entry.limb);
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

  CONFIG.Actor.documentClass = ZActor;
  CONFIG.Item.documentClass = ZItem;
  CONFIG.Combat.initiative = {
    formula: "1d10 + @attributes.per.value",
    decimals: 2,
  };

  CONFIG.statusEffects = Object.values(GLOBAL_STATUSES).map((s) => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
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

Hooks.on("preUpdateToken", async (tokenDoc, changes, context, userId) => {
  if (changes.x === undefined && changes.y === undefined) return true;
  
  // Проверка: Игрок ли двигает? ГМ может двигать что угодно без расхода.
  // Хотя для тестов удобно, чтобы и у ГМа списывалось. Оставим проверку только для AP.
  const isGM = game.user.isGM;

  const scene = tokenDoc.parent;
  const isGlobalMap = scene.getFlag("zsystem", "isGlobalMap");

  // === РЕЖИМ 1: ГЛОБАЛЬНАЯ КАРТА ===
  if (isGlobalMap) {
      // Вызываем TravelManager. Если он вернет false -> отменяем движение
      // Важно: TravelManager асинхронный, но preUpdateToken синхронный в плане возврата false.
      // В Foundry V10+ можно возвращать Promise, но лучше проверить. 
      // Если нужно строго блокировать, придется хитрить, но обычно await работает.
      
      // ВНИМАНИЕ: V12+ поддерживает async в pre-хуках.
      return await TravelManager.handleMovement(tokenDoc, changes);
  }

  // === РЕЖИМ 2: ТАКТИЧЕСКИЙ БОЙ (AP) ===
  const actor = tokenDoc.actor;
  if (!actor || !tokenDoc.inCombat || ["container", "harvest_spot", "vehicle"].includes(actor.type)) return true;

  const size = canvas.grid.size;
  const dx = Math.abs((changes.x ?? tokenDoc.x) - tokenDoc.x) / size;
  const dy = Math.abs((changes.y ?? tokenDoc.y) - tokenDoc.y) / size;
  const squaresMoved = Math.max(Math.round(dx), Math.round(dy));
  if (squaresMoved <= 0) return true;

  let costPerSquare = 1;
  if (actor.hasStatusEffect("prone")) costPerSquare += 1;
  if (actor.hasStatusEffect("overburdened")) costPerSquare = Math.max(costPerSquare, 2);
  if (actor.hasStatusEffect("stealth")) costPerSquare = Math.max(costPerSquare, 2);

  const totalCost = squaresMoved * costPerSquare;
  const curAP = actor.system.resources.ap.value;

  if (curAP < totalCost) {
    if (!isGM) {
      ui.notifications.warn(`Недостаточно AP. Нужно ${totalCost}, есть ${curAP}.`);
      return false;
    } else {
      ui.notifications.warn("GM Override: Moving with insufficient AP.");
    }
  }
  await actor.update({ "system.resources.ap.value": curAP - totalCost });
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