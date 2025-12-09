import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

// ... (_calcResult, _getSlotMachineHTML, rollSkill - без изменений) ...
export function _calcResult(roll, target) {
    if (roll <= 5) return "crit-success";
    if (roll >= 96) return "crit-fail";
    if (roll <= target) return "success";
    return "fail";
}

export function _getSlotMachineHTML(label, target, rollTotal, resultType) {
    let statusClass = (resultType.includes("success")) ? "success" : "failure";
    let statusLabel = (resultType === "crit-success") ? "КРИТ. УСПЕХ" : (resultType === "success" ? "УСПЕХ" : (resultType === "crit-fail" ? "КРИТ. ПРОВАЛ" : "ПРОВАЛ"));
    return `<div class="z-chat-card"><div class="z-card-header">${label}</div><div class="z-card-sub">Цель: ${target}%</div><div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${rollTotal}</div></div></div><div class="z-result-label ${statusClass}">${statusLabel}</div></div>`;
}

export async function rollSkill(actor, skillId) {
    const skill = actor.system.skills[skillId];
    if (!skill) return;
    const roll = new Roll("1d100");
    await roll.evaluate();
    const resultType = _calcResult(roll.total, skill.value);
    const label = skillId.charAt(0).toUpperCase() + skillId.slice(1);
    const content = _getSlotMachineHTML(label, skill.value, roll.total, resultType);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({actor}), content });
}

/**
 * Инициация Атаки (HYBRID FIX)
 */
export async function performAttack(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return;
  if (actor.hasStatusEffect("panic")) return ui.notifications.error("Паника!");

  let attackOptions = item.system.attacks || {};
  if (Object.keys(attackOptions).length === 0) {
      // Авто-генерация для простого оружия
      attackOptions["default"] = { 
          name: "Атака", 
          ap: item.system.apCost || 3, 
          dmg: item.system.damage || "1d6", 
          noise: item.system.noise || 0 
      };
  }
  
  let buttonsHTML = "";
  for (let [key, atk] of Object.entries(attackOptions)) {
    const totalNoise = (Number(item.system.noise) || 0) + (Number(atk.noise) || 0);
    buttonsHTML += `<button class="z-attack-btn" data-key="${key}"><div class="atk-name">${atk.name}</div><div class="atk-info">AP: ${atk.ap} | Noise: ${totalNoise}</div></button>`;
  }
  
  new Dialog({
    title: `Атака: ${item.name}`, 
    content: `<form class="z-attack-dialog"><div class="form-group"><label>Цель:</label><select id="aim-location"><option value="torso">Торс</option><option value="head">Голова</option><option value="lArm">Л.Рука</option><option value="rArm">П.Рука</option><option value="lLeg">Л.Нога</option><option value="rLeg">П.Нога</option></select></div><hr><div class="attack-buttons">${buttonsHTML}</div></form>`,
    buttons: {},
    render: (html) => {
      html.find('.z-attack-btn').click(async (ev) => {
        ev.preventDefault();
        const key = ev.currentTarget.dataset.key;
        const loc = html.find('#aim-location').val();
        
        Object.values(ui.windows).forEach(w => { if (w.title === `Атака: ${item.name}`) w.close(); });
        await _executeAttack(actor, item, attackOptions[key], loc);
      });
    }
  }).render(true);
}

// ЛОГИКА АТАКИ
// === ВАЖНО: НОВАЯ ФУНКЦИЯ АТАКИ ЧЕРЕЗ ЧАТ-КОМАНДЫ ===
async function _executeAttack(actor, item, attack, location = "torso") {
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP (нужно ${apCost})`);

  // 1. Инициализация (метательное, гранаты, патроны)
  let isThrowingAction = false;
  if (attack.mode === 'throw') isThrowingAction = true;
  else if (item.system.isThrowing && item.system.weaponType !== 'melee') isThrowingAction = true;
  
  const isGrenade = isThrowingAction && (Number(item.system.blastRadius) > 0);
  const isThrownWeapon = isThrowingAction && !isGrenade; 

  // Трата патронов
  if (!isThrowingAction && item.system.ammoType) {
      const maxMag = Number(item.system.mag?.max) || 0;
      if (maxMag > 0) {
          const curMag = Number(item.system.mag.value) || 0;
          let cost = attack.name.match(/burst|очередь/i) ? 3 : 1;
          if (curMag < cost) return ui.notifications.warn("Щелк! Нет патронов.");
          await item.update({ "system.mag.value": curMag - cost });
      }
  }

  // 2. Получение целей
  let targets = Array.from(game.user.targets);
  if (isGrenade) {
      // Старый код шаблона работает, если не крашится. Если крашится - убери await _placeTemplate и поставь заглушку
      // Для надежности я оставлю выбор целей игроком
      if (targets.length === 0) ui.notifications.info("Гранату нужно кидать в кого-то (пока так).");
  }

  // 3. Списываем AP (У себя менять можно)
  await actor.update({"system.resources.ap.value": curAP - apCost});

  // 4. Математика Броска
  let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : ((isThrowingAction) ? 'athletics' : 'melee');
  const skillVal = actor.system.skills[skillType]?.value || 0;
  const atkMod = Number(attack.mod) || 0;
  const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);
  
  // Уклонение
  let evasionMod = 0;
  let evasionMsg = "";
  if (targets.length > 0 && targets[0].actor) {
      const targ = targets[0].actor;
      if (!targ.hasStatusEffect("prone")) {
          const ev = targ.system.secondary?.evasion?.value || 0;
          evasionMod = -(ev * 3);
          if (evasionMod !== 0) evasionMsg = ` [Eva ${evasionMod}%]`;
      }
  }

  const targetChance = Math.max(0, skillVal + atkMod + aimMod + evasionMod);
  const roll = new Roll("1d100");
  await roll.evaluate();
  
  // Результат
  const resultType = _calcResult(roll.total, targetChance);
  const isHit = resultType.includes("success");
  const isCrit = resultType === "crit-success";

  // 5. РАСЧЕТ УРОНА И ШУМА (Мы их просто считаем, но не наносим здесь)
  let dmgAmount = 0;
  let dmgDisplay = "";
  const damageDataForGM = []; // Список команд для ГМа

  if (isHit || isGrenade) {
      let formula = attack.dmg || "0";
      // Логика формулы
      if (isGrenade && !isHit) formula = `ceil((${formula}) / 2)`; // Взрыв рядом
      if (isCrit) formula = `ceil((${formula}) * 1.5)`;
      if (skillType === 'melee' || isThrownWeapon) {
          const s = actor.system.attributes.str.value;
          const req = item.system.strReq || 1;
          if (s >= req) formula += ` + ${s - req}`; else formula = `ceil((${formula}) * 0.5)`;
      }

      const rDmg = new Roll(formula, actor.getRollData());
      await rDmg.evaluate();
      dmgAmount = Math.max(1, rDmg.total);
      
      dmgDisplay = `<div class="z-damage-box"><div class="dmg-label">УРОН ${isCrit?"(КРИТ!)":""}</div><div class="dmg-val">${dmgAmount}</div></div>`;

      // ЗАПИСЫВАЕМ ЗАПИСКУ ГМУ: Кому и сколько нанести
      targets.forEach(t => {
          if (t.document?.uuid) { // Работает для токенов
              damageDataForGM.push({
                  uuid: t.document.uuid,
                  amount: dmgAmount,
                  type: item.system.damageType || "blunt",
                  limb: location
              });
          }
      });
  }

  const noise = (Number(item.system.noise)||0) + (Number(attack.noise)||0);
  const noiseHtml = noise > 0 ? `<div class="z-noise-alert">🔊 Шум: +${noise}</div>` : "";

  // 6. ОТПРАВЛЯЕМ ЧАТ СООБЩЕНИЕ (В нем флаги!)
  // Вот это главная строка. Она создает карту, и она же триггерит хук в main.js
  const cardHtml = _getSlotMachineHTML(item.name + evasionMsg, targetChance, roll.total, resultType);
  
  await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `${cardHtml}${dmgDisplay}${noiseHtml}<div class="z-ap-spent">-${apCost} AP</div>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: {
          zsystem: {
              noiseAdd: noise,          // Сколько добавить шума
              damageData: damageDataForGM // Список целей для урона
          }
      }
  });

  // Если это метательное оружие, тратим его у себя
  if (isThrowingAction) {
      if (item.system.quantity > 1) await item.update({"system.quantity": item.system.quantity - 1});
      else await item.delete();
  }
}

async function _placeTemplate(item) { /* Код без изменений из прошлого ответа */ 
    const radius = Number(item.system.blastRadius) || 1;
    const type = item.system.templateType === "cone" ? "cone" : "circle";
    const templateData = { t: type, user: game.user.id, distance: radius, direction: 0, x: 0, y: 0, fillColor: game.user.color, flags: { zsystem: { itemId: item.id } } };
    const doc = new MeasuredTemplateDocument(templateData, { parent: canvas.scene });
    const template = new MeasuredTemplate(doc);
    await template.draw();
    canvas.templates.preview.addChild(template);
    canvas.templates.activate();
    return new Promise((resolve) => {
        const handlers = {};
        handlers.move = (ev) => { const pos = ev.data.getLocalPosition(canvas.templates); template.document.x = pos.x; template.document.y = pos.y; template.refresh(); };
        handlers.confirm = async (ev) => {
             canvas.stage.off("mousemove", handlers.move); canvas.stage.off("mousedown", handlers.confirm); canvas.stage.off("rightdown", handlers.cancel);
             const targets = []; const { x, y, shape } = template;
             canvas.tokens.placeables.forEach(t => { if (!t.actor) return; if (shape.contains(t.center.x - x, t.center.y - y)) targets.push(t); });
             await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [template.document.toObject()]);
             canvas.templates.preview.removeChild(template); resolve(targets);
        };
        handlers.cancel = () => { canvas.stage.off("mousemove", handlers.move); canvas.stage.off("mousedown", handlers.confirm); canvas.stage.off("rightdown", handlers.cancel); canvas.templates.preview.removeChild(template); resolve(null); };
        canvas.stage.on("mousemove", handlers.move); canvas.stage.on("mousedown", handlers.confirm); canvas.stage.on("rightdown", handlers.cancel);
    });
}

export async function rollPanicTable(actor) {
    /* Твой старый код паники */
    const roll = new Roll("1d6"); await roll.evaluate(); const result = roll.total;
    let behavior = "", effectDetails = "";
    if (result <= 2) { behavior = "Сжаться в страхе"; effectDetails = "Prone, 0 AP."; await actor.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.prone]); await actor.update({"system.resources.ap.value": 0}); } 
    else if (result <= 4) { behavior = "Бегство"; effectDetails = "Потратьте AP на бегство."; } 
    else { behavior = "Берсерк"; effectDetails = "Атакуйте в рукопашную."; }
    const content = `<div class="z-chat-card" style="border-color:orange;"><div class="z-card-header" style="color:orange;">ПАНИКА!</div><div style="font-size:2em; font-weight:bold;">${result}</div><div>${behavior}</div></div>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor}), content });
}