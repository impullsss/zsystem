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
import { PlayerHUD } from "./module/player-hud.js";
import { StealthDetectionManager } from "./module/stealth.js";
import { GMHandler } from "./module/gm-handler.js";
import { ZSystemActions } from "./module/actions.js";


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
    PlayerHUD.init();
    StealthDetectionManager.initHooks();
    GMHandler.initHooks();
    ZSystemActions.initHooks();
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
        if (actor.hasStatusEffect("prone")) singleStepCost += 1;
        if (actor.hasStatusEffect("overburdened")) singleStepCost += 1;
        if (actor.hasStatusEffect("stealth")) singleStepCost += 1;
        if (actor.hasStatusEffect("injury-leg-lLeg")) singleStepCost += 1;
        if (actor.hasStatusEffect("injury-leg-rLeg")) singleStepCost += 1;

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

    // 8. Травма торса — каждый шаг наносит 1d5 урона
    if (actor.hasStatusEffect("injury-torso")) {
        const torsoRoll = new Roll("1d5");
        await torsoRoll.evaluate();
        await actor.applyDamage(torsoRoll.total, "true", "torso");
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div style="color:#e74c3c;">ТРАВМА ТОРСА: движение наносит ${torsoRoll.total} урона</div>`
        });
    }

    return true;
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