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

// Глобальный перехватчик: только ГМ исполняет команды
Hooks.on("createChatMessage", async (message, options, userId) => {
  if (!game.user.isGM) return; // Только ГМ обрабатывает логику
  
  const flags = message.flags?.zsystem;
  if (!flags) return;

  // 1. ШУМ (Без изменений)
  if (flags.noiseAdd > 0) {
    const current = game.settings.get("zsystem", "currentNoise");
    await game.settings.set("zsystem", "currentNoise", Math.max(0, current + flags.noiseAdd));
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
     // ... код ...
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
  // ... Init код без изменений ...
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

Hooks.on("preUpdateToken", (tokenDoc, changes, context, userId) => {
  if (changes.x === undefined && changes.y === undefined) return true;
  const actor = tokenDoc.actor;
  if (
    !actor ||
    !tokenDoc.inCombat ||
    ["container", "harvest_spot"].includes(actor.type)
  )
    return true;

  const size = canvas.grid.size;
  const dx = Math.abs((changes.x ?? tokenDoc.x) - tokenDoc.x) / size;
  const dy = Math.abs((changes.y ?? tokenDoc.y) - tokenDoc.y) / size;
  const squaresMoved = Math.max(Math.round(dx), Math.round(dy));
  if (squaresMoved <= 0) return true;

  let cost =
    squaresMoved * (actor.effects.some((e) => e.statuses.has("prone")) ? 2 : 1);
  const curAP = actor.system.resources.ap.value;

  if (curAP < cost) {
    if (!game.user.isGM) {
      ui.notifications.warn("Недостаточно AP.");
      return false;
    } else {
      ui.notifications.warn("GM Override: Moving with insufficient AP.");
    }
  }
  actor.update({ "system.resources.ap.value": curAP - cost });
  return true;
});
