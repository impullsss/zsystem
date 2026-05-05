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
import { PlayerHUD } from "./module/player-hud.js";
import { StealthDetectionManager } from "./module/stealth.js";
import { GMHandler } from "./module/gm-handler.js";
import { ZSystemActions } from "./module/actions.js";
import { registerZSystemHandlebarsHelpers } from "./module/handlebars-helpers.js";
import { initTravelSceneConfigHooks } from "./module/travel-scene-config.js";
import { initTokenMovementHooks } from "./module/token-movement.js";
import { createSurvivalStarterItems, getSurvivalItemData } from "./module/survival-item-blueprints.js";
import { buildCampPlan, resolveDirtyWaterRisk, resolveGatheringAttempt } from "./module/survival-gathering.js";
import { buildWeaponRepairPlan, resolveWeaponRepairAttempt } from "./module/survival-maintenance.js";


Hooks.once("init", () => {
  console.log("ZSystem | Initializing...");
  loadTemplates(["systems/zsystem/sheets/partials/project-card.hbs"]);

  registerZSystemHandlebarsHelpers();

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

  game.settings.register("zsystem", "allowInfectionBelowOne", {
    name: "Антибиотик снижает инфекцию до 0",
    hint: "Если включено — антибиотик может снизить инфекцию ниже стадии 1 (до полного излечения). По умолчанию минимум — стадия 1.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("zsystem", "randomizeZombieStats", {
    name: "Рандомизация характеристик зомби",
    hint: "Если включено — зомби при спавне получают случайные ХП и характеристики (имитация разной степени гниения).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("zsystem", "hideSocialFactors", {
    name: "Скрывать факторы соц. проверок",
    hint: "Игроки видят только результат и общую оценку сложности, без отношения и пресета NPC.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("zsystem", "forceD100Roll", {
    name: "Debug: фиксированный d100",
    hint: "0 = обычный случайный бросок. 1-100 = все проверки d100 используют это число для быстрого теста критов/провалов.",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: {
      min: 0,
      max: 100,
      step: 1
    }
  });

  game.settings.register("zsystem", "firearmBallisticsPreview", {
    name: "Огнестрел: показывать баллистику при прицеливании",
    hint: "Показывает в HUD токены на линии огня, за целью и внутри конуса очереди. Урон не применяется.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("zsystem", "firearmBallisticsChatMode", {
    name: "Огнестрел: баллистика в чате",
    hint: "off = скрыть отчёт, report = только отчёт, manual = отчёт и GM-кнопки, auto = отчёт и автоматический побочный урон.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "Выкл.",
      report: "Только отчёт",
      manual: "Отчёт + ручные GM-кнопки",
      auto: "Отчёт + авто-урон"
    },
    default: "manual"
  });

  game.settings.register("zsystem", "armorWearMode", {
    name: "Броня: износ от поглощения",
    hint: "off = не показывать, report = только подсказка в Absorb Log, auto = автоматически снижать прочность брони.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "Выкл.",
      report: "Только отчёт",
      auto: "Авто-износ"
    },
    default: "report"
  });

  game.settings.register("zsystem", "travelEventMode", {
    name: "Путешествия: события дороги",
    hint: "off = не бросать события, report = иногда добавлять событие дороги в карточку путешествия.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "Выкл.",
      report: "Отчёт в чате"
    },
    default: "off"
  });

  game.settings.register("zsystem", "travelMaintenanceMode", {
    name: "Путешествия: износ транспорта",
    hint: "off = не считать, report = показывать риск износа/поломки, auto = автоматически снижать прочность транспорта.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "Выкл.",
      report: "Только отчёт",
      auto: "Авто-износ"
    },
    default: "report"
  });

  game.settings.register("zsystem", "travelSupplyMode", {
    name: "Путешествия: еда, вода и усталость",
    hint: "off = не считать, report = показывать расход еды/воды и риск усталости, auto = автоматически списывать припасы и применять усталость.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "Выкл.",
      report: "Только отчёт",
      auto: "Авто-расход и усталость"
    },
    default: "report"
  });

  game.settings.register("zsystem", "traumaMode", {
    name: "\u0422\u0440\u0430\u0432\u043c\u044b: \u0440\u0435\u0436\u0438\u043c \u043e\u0442\u0447\u0451\u0442\u0430",
    hint: "off = \u043d\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c, report = \u0442\u043e\u043b\u044c\u043a\u043e \u043e\u0442\u0447\u0451\u0442, manual = \u043e\u0442\u0447\u0451\u0442 \u0438 GM-\u043a\u043d\u043e\u043f\u043a\u0438 \u043f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u0439.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      off: "\u0412\u044b\u043a\u043b.",
      report: "\u0422\u043e\u043b\u044c\u043a\u043e \u043e\u0442\u0447\u0451\u0442",
      manual: "\u041e\u0442\u0447\u0451\u0442 + \u0440\u0443\u0447\u043d\u044b\u0435 GM-\u043a\u043d\u043e\u043f\u043a\u0438"
    },
    default: "manual"
  });

  game.settings.register("zsystem", "traumaSeverityMultiplier", {
    name: "\u0422\u0440\u0430\u0432\u043c\u044b: \u0436\u0451\u0441\u0442\u043a\u043e\u0441\u0442\u044c",
    hint: "1.0 = \u0431\u0430\u0437\u043e\u0432\u044b\u0439 \u0440\u0435\u0436\u0438\u043c. \u041c\u0435\u043d\u044c\u0448\u0435 1 \u0434\u0435\u043b\u0430\u0435\u0442 \u0442\u0440\u0430\u0432\u043c\u044b \u0440\u0435\u0436\u0435, \u0431\u043e\u043b\u044c\u0448\u0435 1 \u0434\u0435\u043b\u0430\u0435\u0442 \u0438\u0445 \u0447\u0430\u0449\u0435 \u0438 \u0442\u044f\u0436\u0435\u043b\u0435\u0435.",
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    range: {
      min: 0.25,
      max: 2,
      step: 0.05
    }
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

Hooks.once("ready", () => {
    console.log("ZSystem | Ready.");
    game.zsystem = game.zsystem || {};
    game.zsystem.survival = {
      createStarterItems: createSurvivalStarterItems,
      getItemData: getSurvivalItemData,
      gather: resolveGatheringAttempt,
      camp: buildCampPlan,
      dirtyWaterRisk: resolveDirtyWaterRisk,
      weaponRepairPlan: buildWeaponRepairPlan,
      weaponRepairAttempt: resolveWeaponRepairAttempt
    };
    PlayerHUD.init();
    StealthDetectionManager.initHooks();
    GMHandler.initHooks();
    ZSystemActions.initHooks();
    initTravelSceneConfigHooks();
    initTokenMovementHooks();
});

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

Hooks.on("canvasReady", () => {
    // Если это игрок, принудительно снимаем выделение со всех токенов через 100мс
    if (!game.user.isGM) {
        setTimeout(() => {
            canvas.tokens.releaseAll();
        }, 100);
    }
});

Hooks.on("createActiveEffect", async (effect, options, userId) => {
    if (userId !== game.user.id) return;
    const actor = effect.parent;
    if (!actor) return;

    if (effect.statuses.has("invisible")) {
        if (actor.isToken) await actor.token.update({ hidden: true });
        else for (let t of actor.getActiveTokens()) await t.document.update({ hidden: true });
    }

    // Слепота: сужаем обзор токена до 1.5 клеток (видит вплотную)
    if (effect.statuses.has("blind")) {
        const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens().map(t => t.document);
        for (let tokenDoc of tokens) {
            await tokenDoc.setFlag("zsystem", "sightBeforeBlind", tokenDoc.sight?.range ?? 30);
            await tokenDoc.update({ "sight.range": 1.5 });
        }
    }
});

Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    if (userId !== game.user.id) return;
    const actor = effect.parent;
    if (!actor) return;

    if (effect.statuses.has("invisible")) {
        if (actor.isToken) await actor.token.update({ hidden: false });
        else for (let t of actor.getActiveTokens()) await t.document.update({ hidden: false });
    }

    // Слепота: возвращаем исходный обзор
    if (effect.statuses.has("blind")) {
        const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens().map(t => t.document);
        for (let tokenDoc of tokens) {
            const original = tokenDoc.getFlag("zsystem", "sightBeforeBlind") ?? 30;
            await tokenDoc.update({ "sight.range": original });
            await tokenDoc.unsetFlag("zsystem", "sightBeforeBlind");
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
