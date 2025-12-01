// --- START OF FILE src/module/dice.js ---

import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

/**
 * Определяет результат броска
 * 1-5: Крит Успех
 * <= Target: Успех
 * 96-100: Крит Провал
 * > Target: Провал
 */
function _calcResult(roll, target) {
    if (roll <= 5) return "crit-success";
    if (roll >= 96) return "crit-fail";
    if (roll <= target) return "success";
    return "fail";
}

/**
 * Генерирует HTML для чата (Слот-машина)
 */
function _getSlotMachineHTML(label, target, rollTotal, resultType) {
  let statusClass = "failure";
  let statusLabel = "ПРОВАЛ";
  
  if (resultType === "crit-success") { 
      statusClass = "success"; 
      statusLabel = "КРИТ. УСПЕХ"; 
  } else if (resultType === "success") { 
      statusClass = "success"; 
      statusLabel = "УСПЕХ"; 
  } else if (resultType === "crit-fail") { 
      statusClass = "failure"; 
      statusLabel = "КРИТ. ПРОВАЛ"; 
  }

  return `
    <div class="z-chat-card">
      <div class="z-card-header">${label}</div>
      <div class="z-card-sub">Цель: ${target}%</div>
      <div class="z-slot-machine">
        <div class="z-reel-window">
            <div class="z-reel-spin ${statusClass}">${rollTotal}</div>
        </div>
      </div>
      <div class="z-result-label ${statusClass}">${statusLabel}</div>
    </div>`;
}

/**
 * Бросок Навыка
 */
export async function rollSkill(actor, skillId) {
  const skill = actor.system.skills[skillId];
  if (!skill) return;
  
  const roll = new Roll("1d100");
  await roll.evaluate();
  
  const resultType = _calcResult(roll.total, skill.value);
  const label = skillId.charAt(0).toUpperCase() + skillId.slice(1);
  
  const content = _getSlotMachineHTML(label, skill.value, roll.total, resultType);
  
  await roll.toMessage({ 
      speaker: ChatMessage.getSpeaker({actor: actor}), 
      content: content 
  });
}

/**
 * Инициация Атаки (Диалог)
 */
export async function performAttack(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return ui.notifications.error("Предмет не найден!");
  
  if (actor.hasStatusEffect("panic")) {
      return ui.notifications.error("Вы в панике! Вы не можете контролировать свои атаки.");
  }
  
  const attacks = item.system.attacks || {};
  
  // Если атак нет, создаем дефолтную
  if (Object.keys(attacks).length === 0) {
    const defaultAttack = { 
        name: "Базовая атака", 
        ap: Number(item.system.apCost) || 3, 
        dmg: item.system.damage || "1d6", 
        mod: 0, 
        noise: item.system.noise || 0 
    };
    return _showAttackDialog(actor, item, { "default": defaultAttack });
  }
  
  return _showAttackDialog(actor, item, attacks);
}

/**
 * Отрисовка диалога выбора атаки
 */
async function _showAttackDialog(actor, item, attacks) {
  let buttonsHTML = "";
  
  for (let [key, atk] of Object.entries(attacks)) {
    let effectInfo = "";
    if (atk.effect) {
        effectInfo = `<span style="color:cyan; font-size:0.8em; display:block;">${GLOBAL_STATUSES[atk.effect]?.label || atk.effect} (${atk.chance}%)</span>`;
    }
    buttonsHTML += `
      <button class="z-attack-btn" data-key="${key}">
        <div class="atk-name">${atk.name}</div>
        <div class="atk-info">AP: ${atk.ap} | Dmg: ${atk.dmg} | Mod: ${atk.mod}%</div>
        ${effectInfo}
      </button>`;
  }
  
  const content = `
    <form class="z-attack-dialog">
      <div class="form-group">
        <label>Цель (Called Shot):</label>
        <select id="aim-location">
          <option value="torso">Торс (0%)</option>
          <option value="head">Голова (-40%)</option>
          <option value="lArm">Л. Рука (-20%)</option>
          <option value="rArm">П. Рука (-20%)</option>
          <option value="lLeg">Л. Нога (-20%)</option>
          <option value="rLeg">П. Нога (-20%)</option>
        </select>
      </div>
      <hr>
      <div class="attack-buttons">${buttonsHTML}</div>
    </form>
  `;
  
  new Dialog({
    title: `Атака: ${item.name}`, 
    content: content, 
    buttons: {},
    render: (html) => {
      html.find('.z-attack-btn').click(async (ev) => {
        ev.preventDefault();
        const key = ev.currentTarget.dataset.key;
        const location = html.find('#aim-location').val(); 
        const selectedAttack = attacks[key];
        
        // Закрываем диалог
        Object.values(ui.windows).forEach(w => { 
            if (w.title === `Атака: ${item.name}`) w.close(); 
        });
        
        await _executeAttack(actor, item, selectedAttack, location);
      });
    }
  }).render(true);
}

/**
 * Выполнение Атаки (Логика)
 */
async function _executeAttack(actor, item, attack, location = "torso") {
  // 1. Проверка AP
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP! Нужно ${apCost}.`);

  // 2. Проверка Патронов
  const ammoType = item.system.ammoType;
  const maxMag = Number(item.system.mag?.max) || 0;
  if (ammoType && maxMag > 0) {
      const curMag = Number(item.system.mag.value) || 0;
      let ammoCost = 1;
      if (attack.name.toLowerCase().match(/burst|очередь/)) ammoCost = 3;
      
      if (curMag < ammoCost) return ui.notifications.warn(`КЛИК! Оружие пусто.`);
      await item.update({ "system.mag.value": curMag - ammoCost });
  }

  // Списание AP
  await actor.update({"system.resources.ap.value": curAP - apCost});

  // 3. Расчет шанса попадания
  let skillType = 'melee';
  if (item.system.weaponType === 'ranged') skillType = 'ranged';
  else if (['pistol', 'rifle', 'shotgun'].includes(item.system.subtype)) skillType = 'ranged';

  const skill = actor.system.skills[skillType];
  const skillBase = skill ? skill.value : 0;
  const atkMod = Number(attack.mod) || 0;
  
  // Штрафы
  const isDizzy = actor.hasStatusEffect("dizzy");
  const dizzyMod = isDizzy ? -50 : 0;

  let aimMod = 0;
  if (location === "head") aimMod = -40;
  else if (location !== "torso") aimMod = -20;

  // Уклонение цели
  const targets = Array.from(game.user.targets);
  let targetEvasion = 0;
  if (targets.length > 0) {
      const tActor = targets[0].actor;
      if (tActor) targetEvasion = tActor.system.secondary?.evasion?.value || 0;
  }

  const targetChance = Math.max(0, skillBase + atkMod + aimMod + dizzyMod - targetEvasion); 
  const damageType = item.system.damageType || "blunt";

  // 4. Бросок кубика
  const roll = new Roll("1d100");
  await roll.evaluate();
  
  const resultType = _calcResult(roll.total, targetChance);
  const isHit = (resultType === "success" || resultType === "crit-success");
  const isCrit = (resultType === "crit-success");

  // 5. Обработка результата
  let dmgHTML = "";
  let btnHTML = "";
  let effectResultHTML = "";
  let autoDamageMsg = "";

  if (isHit) {
    try {
      // Формируем формулу урона
      let formulaString = attack.dmg || "0";
      
      // Бонус силы для ближнего боя
      if (skillType === 'melee') {
        const str = Number(actor.system.attributes.str.value) || 1;
        const req = Number(item.system.strReq) || 1;
        if (str >= req) {
          const bonus = str - req;
          if (bonus > 0) formulaString += ` + ${bonus}`;
        } else {
          formulaString = `(${formulaString}) * 0.5`; // Штраф за слабость
        }
      }
      
      const dmgRoll = new Roll(formulaString, actor.getRollData());
      await dmgRoll.evaluate();
      
      let finalDamage = Math.ceil(dmgRoll.total); 
      
      // КРИТИЧЕСКИЙ УРОН (x1.5)
      if (isCrit) {
          finalDamage = Math.ceil(finalDamage * 1.5);
      }
      
      // Авто-нанесение урона (если есть цель)
      if (targets.length > 0) {
          for (let target of targets) {
              if (target.actor) {
                  await target.actor.applyDamage(finalDamage, damageType, location);
                  autoDamageMsg += `<div style="color:red; font-weight:bold; font-size:0.8em; margin-top:2px;">>> АВТО: ${finalDamage} урона по ${target.name}</div>`;
              }
          }
           btnHTML = `<div style="text-align:center; color:#888; font-style:italic;">Урон нанесен автоматически</div>`;
      } else {
           // Кнопка для ручного применения
           btnHTML = `<button class="z-apply-damage" data-damage="${finalDamage}" data-type="${damageType}" data-limb="${location}"><i class="fas fa-crosshairs"></i> Применить (${location})</button>`;
      }
      
      // HTML Блок Урона
      const critLabel = isCrit ? `<span style="color:#66bb6a; font-weight:bold;">(КРИТ x1.5)</span>` : "";
      dmgHTML = `<div class="z-damage-box">
                    <div class="dmg-label">УРОН ${critLabel}</div>
                    <div class="dmg-val">${finalDamage} <span style="font-size:0.5em; color:#888;">${damageType}</span></div>
                    ${autoDamageMsg}
                 </div>`;

      // --- ЛОГИКА ЭФФЕКТОВ ---
      if (attack.effect && attack.chance > 0) {
          const statusDef = GLOBAL_STATUSES[attack.effect];
          let finalChance = attack.chance;
          
          // Сопротивление (Tenacity)
          if (statusDef && statusDef.isPhysical && targets.length > 0) {
              const targetActor = targets[0].actor;
              if (targetActor) {
                  const tenacity = targetActor.system.secondary?.tenacity?.value || 0;
                  finalChance = Math.max(0, finalChance - tenacity);
              }
          }

          const procRoll = new Roll("1d100");
          await procRoll.evaluate();
          const procSuccess = procRoll.total <= finalChance;
          const statusName = statusDef?.label || attack.effect;
          
          if (procSuccess) {
             if (targets.length > 0) {
                 for (let target of targets) {
                     if (target.actor) {
                         if (attack.effect === 'infected') {
                             // Инфекция (Скрыто)
                             await target.actor.update({
                                 "system.resources.infection.active": true,
                                 "system.resources.infection.stage": 1
                             });
                             ChatMessage.create({
                                 content: `<span style="color:purple; font-weight:bold;">(GM) ${target.name} ЗАРАЖЕН! (Скрыто)</span>`,
                                 whisper: ChatMessage.getWhisperRecipients("GM")
                             });
                         } else if (statusDef) {
                             // Обычный эффект
                             const hasEffect = target.actor.effects.some(e => e.statuses.has(attack.effect));
                             if (!hasEffect) await target.actor.createEmbeddedDocuments("ActiveEffect", [statusDef]);
                         }
                     }
                 }
                 if (attack.effect === 'infected') {
                     effectResultHTML = `<div style="margin-top:5px; color:purple; font-style:italic;">(GM: Инфекция применена скрыто)</div>`;
                 } else {
                     effectResultHTML = `<div style="margin-top:5px; padding:4px; border:1px solid cyan; color:cyan; font-weight:bold;"><i class="fas fa-bolt"></i> Эффект ${statusName} наложен!</div>`;
                 }
             } else {
                 effectResultHTML = `<div style="margin-top:5px; padding:4px; border:1px solid cyan; color:cyan; font-weight:bold;">
                    <i class="fas fa-bolt"></i> Эффект: ${statusName} СРАБОТАЛ!
                    <button class="z-apply-effect" data-effect="${attack.effect}" style="margin-top:2px; font-size:0.8em;">Наложить ${statusName}</button>
                 </div>`;
             }
          } else {
             effectResultHTML = `<div style="margin-top:5px; color:#666; font-size:0.8em;">Эффект ${statusName} не сработал (${procRoll.total} > ${finalChance}%)</div>`;
          }
      }

    } catch (e) { dmgHTML = `<div style="color:red; font-size:0.8em">Err: ${e.message}</div>`; }
  }

  // 6. Шум
  const totalNoise = (Number(item.system.noise) || 0) + (Number(attack.noise) || 0);
  if (totalNoise > 0) NoiseManager.add(totalNoise);
  const noiseHTML = totalNoise > 0 ? `<div class="z-noise-alert"><i class="fas fa-volume-up"></i> Шум: ${totalNoise}</div>` : "";

  // 7. Сборка сообщения
  const cardHTML = _getSlotMachineHTML(item.name, targetChance, roll.total, resultType);
  
  const content = `
    ${cardHTML}
    ${dmgHTML}
    ${btnHTML}
    ${effectResultHTML}
    ${noiseHTML}
    <div class="z-ap-spent">Потрачено <b>${apCost} AP</b></div>
  `;
  
  await ChatMessage.create({ 
      speaker: ChatMessage.getSpeaker({actor: actor}), 
      content: content, 
      type: CONST.CHAT_MESSAGE_TYPES.OTHER 
  });
}

/**
 * Таблица Паники (1d6)
 */
export async function rollPanicTable(actor) {
    const roll = new Roll("1d6");
    await roll.evaluate();
    const result = roll.total;
    let behavior = "";
    let effectDetails = "";

    if (result <= 2) {
        behavior = "Сжаться в страхе (Cower)";
        effectDetails = "Персонаж падает ничком (Prone) и пропускает ход. AP = 0.";
        await actor.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.prone]);
        await actor.update({"system.resources.ap.value": 0});
    } else if (result <= 4) {
        behavior = "Бегство (Flee)";
        effectDetails = "Вы должны потратить ВСЕ свои AP на движение максимально далеко от врагов.";
    } else {
        behavior = "Берсерк (Berserk)";
        effectDetails = "Вы должны атаковать ближайшую цель (даже союзника) оружием ближнего боя или голыми руками.";
    }

    const content = `
    <div class="z-chat-card" style="border-color:orange;">
      <div class="z-card-header" style="color:orange;">ПАНИКА!</div>
      <div class="z-card-sub">${actor.name} теряет контроль!</div>
      <div style="font-size:2em; font-weight:bold; margin:10px 0;">${result}</div>
      <div style="font-weight:bold; text-transform:uppercase;">${behavior}</div>
      <div style="font-style:italic; font-size:0.9em; margin-top:5px;">${effectDetails}</div>
    </div>
    `;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: actor}), content: content });
}

function _getLimbName(key) {
    const map = { head: "Голова", torso: "Торс", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога" };
    return map[key] || key;
}