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
  if (!game.user.isGM) return;
  const flags = message.flags?.zsystem;
  if (!flags) return;

  // 1. ШУМ
  if (flags.noiseAdd > 0) {
    const current = game.settings.get("zsystem", "currentNoise");
    await game.settings.set(
      "zsystem",
      "currentNoise",
      Math.max(0, current + flags.noiseAdd)
    );
    console.log(`ZSystem (GM) | Шум увеличен на ${flags.noiseAdd}`);
  }

  // 2. УРОН
  if (flags.damageData && Array.isArray(flags.damageData)) {
    for (let entry of flags.damageData) {
      const doc = await fromUuid(entry.uuid);
      const actor = doc?.actor || doc;
      if (actor) await actor.applyDamage(entry.amount, entry.type, entry.limb);
    }
  }

  // 3. ОБНОВЛЕНИЕ АКТОРОВ (Для Контейнеров и Точек сбора)
  if (flags.actorUpdate) {
    const doc = await fromUuid(flags.actorUpdate.uuid);
    const actor = doc?.actor || doc;
    if (actor) {
      const updates = flags.actorUpdate.updates;
      await actor.update(updates);
      // Если меняется картинка, форсируем обновление текстуры токена
      if (updates.img && actor.isToken) {
        await actor.token.update({ texture: { src: updates.img } });
      }
    }
  }
});

Hooks.once("init", () => {
  console.log("ZSystem | Initializing...");
  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  // Helpers
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

// --- ВАЖНЫЙ ФИКС: ПРАВА НА ТОКЕНЫ ЛУТА ---
Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
    const actor = tokenDoc.actor;
    if (!actor) return;

    // 1. ЛУТ И КОНТЕЙНЕРЫ (Только настройки, БЕЗ прав)
    if (["container", "harvest_spot"].includes(actor.type)) {
        tokenDoc.updateSource({
            "actorLink": false,       // Всегда уникальные
            "sight.enabled": false,   // Нет зрения
            "disposition": 0,         // Нейтральные
            "displayBars": 0          // Скрыть бары HP
        });
    }

    // 2. ОСТАЛЬНАЯ ЛОГИКА (Скрытность)
    if (actor.system.attributes?.isHidden?.value) {
        tokenDoc.updateSource({ hidden: true });
    }
});

Hooks.on("createToken", async (tokenDoc, options, userId) => {
    // Выполняет только тот, кто создал токен (обычно ГМ), чтобы не было спама в БД
    if (userId !== game.user.id) return;

    // Работаем только с непривязанными токенами (лут)
    if (!tokenDoc.actorLink) {
        const actor = tokenDoc.actor;
        if (!actor) return;

        if (["harvest_spot", "container"].includes(actor.type)) {
            // ownership.default = 3 (OWNER). Делаем актора доступным всем.
            // Это меняет права именно на Синтетическом Акторе внутри сцены.
            console.log(`ZSystem | Granting Ownership for: ${actor.name}`);
            await actor.update({ "ownership.default": 3 });
        }
    }
});

Hooks.on("preDeleteToken", (tokenDoc, context, userId) => {
    // ГМу можно всё
    if (game.user.isGM) return true;

    const actor = tokenDoc.actor;
    if (!actor) return true;

    // Запрещаем игрокам удалять лут с карты (даже если они Owners)
    if (["harvest_spot", "container"].includes(actor.type)) {
        ui.notifications.warn("Вы не можете удалить этот объект!");
        return false;
    }
    return true;
});

Hooks.on("updateToken", async (tokenDoc, changes, context, userId) => {
  if (!game.user.isGM) return;
  if (!changes.x && !changes.y) return;
  const token = tokenDoc.object;
  const actor = token.actor;
  if (!actor || ["container", "harvest_spot", "shelter"].includes(actor.type))
    return;
  const isZombie = actor.type === "zombie";

  // ПРОВЕРКА ЛОВУШЕК И СХРОНОВ (Окружение)
  const containers = canvas.tokens.placeables.filter(
    (t) => t.actor && ["container", "harvest_spot"].includes(t.actor.type)
  );

  for (let cToken of containers) {
    const cActor = cToken.actor;
    const sys = cActor.system.attributes;
    if (!sys || cActor.type !== "container") continue;

    const dist = canvas.grid.measureDistance(token, cToken, {
      gridSpaces: true,
    });
    const spotRadius = Number(sys.trapSpotRadius?.value) || 2;

    // Схрон
    if (!isZombie && sys.isHidden?.value && dist <= spotRadius) {
      const flagKey = `spotted_hidden_${cActor.id}`;
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
            content: `👁️ <b>${actor.name}</b> замечает тайник!`,
            speaker: ChatMessage.getSpeaker({ actor }),
          });
        } else {
          ChatMessage.create({
            content: `<i>${actor.name} прошел мимо тайника (PER ${roll.total} vs ${dc})</i>`,
            whisper: ChatMessage.getWhisperRecipients("GM"),
          });
        }
      }
    }

    // Ловушка
    if (sys.isTrapped?.value && sys.trapActive?.value && dist < 0.9) {
      await cActor.update({ "system.attributes.trapActive.value": false });
      const dmg = sys.trapDmg?.value || "2d6";
      const r = new Roll(dmg);
      await r.evaluate();
      await actor.applyDamage(r.total, "fire", "torso");
      NoiseManager.add(20);
      ChatMessage.create({
        content: `<div style="color:red; font-weight:bold;">💥 ЛОВУШКА!</div><div>Урон: ${r.total}</div>`,
        speaker: ChatMessage.getSpeaker({ actor: cActor }),
      });
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
