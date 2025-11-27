
import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

function _getSlotMachineHTML(label, target, rollTotal, isSuccess) {
  const statusClass = isSuccess ? "success" : "failure";
  const statusLabel = isSuccess ? "УСПЕХ" : "ПРОВАЛ";
  return `
    <div class="z-chat-card">
      <div class="z-card-header">${label}</div>
      <div class="z-card-sub">Цель: ${target}%</div>
      <div class="z-slot-machine">
        <div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${rollTotal}</div></div>
      </div>
      <div class="z-result-label ${statusClass}">${statusLabel}</div>
    </div>`;
}

export async function rollSkill(actor, skillId) {
  const skill = actor.system.skills[skillId];
  if (!skill) return;
  const roll = new Roll("1d100");
  await roll.evaluate();
  const isSuccess = roll.total <= skill.value;
  const label = skillId.charAt(0).toUpperCase() + skillId.slice(1);
  const content = _getSlotMachineHTML(label, skill.value, roll.total, isSuccess);
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({actor: actor}), content: content });
}

export async function performAttack(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return ui.notifications.error("Предмет не найден!");

  // Проверка на Панику
  if (actor.hasStatusEffect("panic")) {
      return ui.notifications.error("Вы в панике! Вы не можете контролировать свои атаки.");
  }

  const attacks = item.system.attacks || {};
  const attackKeys = Object.keys(attacks);

  if (attackKeys.length === 0) {
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

async function _showAttackDialog(actor, item, attacks) {
  let buttonsHTML = "";
  for (let [key, atk] of Object.entries(attacks)) {
    // Отображаем эффект в кнопке, если есть
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
        
        Object.values(ui.windows).forEach(w => { if (w.title === `Атака: ${item.name}`) w.close(); });

        await _executeAttack(actor, item, selectedAttack, location);
      });
    }
  }).render(true);
}

async function _executeAttack(actor, item, attack, location = "torso") {
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP! Нужно ${apCost}.`);

  // --- МАГАЗИН ---
  const ammoType = item.system.ammoType;
  const maxMag = Number(item.system.mag?.max) || 0;
  
  if (ammoType && maxMag > 0) {
      const curMag = Number(item.system.mag.value) || 0;
      let ammoCost = 1;
      if (attack.name.toLowerCase().match(/burst|очередь/)) ammoCost = 3;

      if (curMag < ammoCost) {
          return ui.notifications.warn(`КЛИК! Пусто. (В стволе: ${curMag})`);
      }
      await item.update({ "system.mag.value": curMag - ammoCost });
  }

  // Списание AP
  await actor.update({"system.resources.ap.value": curAP - apCost});

  let skillType = 'melee';
  if (item.system.weaponType === 'ranged') skillType = 'ranged';
  else if (['pistol', 'rifle', 'shotgun'].includes(item.system.subtype)) skillType = 'ranged';

  const skill = actor.system.skills[skillType];
  const skillBase = skill ? skill.value : 0;
  const atkMod = Number(attack.mod) || 0;
  
  // Эффекты актора
  const isDizzy = actor.hasStatusEffect("dizzy");
  const dizzyMod = isDizzy ? -50 : 0;

  let aimMod = 0;
  if (location === "head") aimMod = -40;
  else if (location !== "torso") aimMod = -20;

  // УЧЕТ ЦЕЛЕЙ И УКЛОНЕНИЯ
  // Берем первую цель для расчета штрафа (если целей несколько, считаем по первой)
  const targets = Array.from(game.user.targets);
  let targetEvasion = 0;
  if (targets.length > 0) {
      const tActor = targets[0].actor;
      if (tActor) {
          targetEvasion = tActor.system.secondary?.evasion?.value || 0;
      }
  }

  // Формула попадания: Skill + Mods - TargetEvasion
  const targetChance = Math.max(0, skillBase + atkMod + aimMod + dizzyMod - targetEvasion); 
  const damageType = item.system.damageType || "blunt";

  const roll = new Roll("1d100");
  await roll.evaluate();
  const isHit = roll.total <= targetChance;

  let dmgHTML = "";
  let finalDamage = 0;
  let btnHTML = "";
  let effectResultHTML = "";
  let autoDamageMsg = "";

  if (isHit) {
    try {
      let formulaString = attack.dmg || "0";
      if (skillType === 'melee') {
        const str = Number(actor.system.attributes.str.value) || 1;
        const req = Number(item.system.strReq) || 1;
        if (str >= req) {
          const bonus = str - req;
          if (bonus > 0) formulaString += ` + ${bonus}`;
        } else {
          formulaString = `(${formulaString}) * 0.5`; // Штраф за слабую руку
        }
      }
      
      const dmgRoll = new Roll(formulaString, actor.getRollData());
      await dmgRoll.evaluate();
      finalDamage = Math.ceil(dmgRoll.total); 
      
      // --- АВТО-УРОН ПО ЦЕЛЯМ ---
      if (targets.length > 0) {
          for (let target of targets) {
              if (target.actor) {
                  await target.actor.applyDamage(finalDamage, damageType, location);
                  autoDamageMsg += `<div style="color:red; font-weight:bold; font-size:0.8em; margin-top:2px;">>> АВТО: ${finalDamage} урона по ${target.name}</div>`;
              }
          }
           btnHTML = `<div style="text-align:center; color:#888; font-style:italic;">Урон нанесен автоматически</div>`;
      } else {
           // Кнопка, если целей не было выбрано через T
           btnHTML = `<button class="z-apply-damage" data-damage="${finalDamage}" data-type="${damageType}" data-limb="${location}"><i class="fas fa-crosshairs"></i> Применить (${_getLimbName(location)})</button>`;
      }
      
      dmgHTML = `<div class="z-damage-box"><div class="dmg-label">УРОН (${formulaString})</div><div class="dmg-val">${finalDamage} <span style="font-size:0.5em; color:#888;">${damageType}</span></div>${autoDamageMsg}</div>`;

      // --- ЛОГИКА ЭФФЕКТОВ ОРУЖИЯ (PROC) ---
      if (attack.effect && attack.chance > 0) {
          const procRoll = new Roll("1d100");
          await procRoll.evaluate();
          const procSuccess = procRoll.total <= attack.chance;
          const statusName = GLOBAL_STATUSES[attack.effect]?.label || attack.effect;
          
          if (procSuccess) {
             // Если авто-урон был, накладываем эффект автоматически
             if (targets.length > 0) {
                 const statusData = GLOBAL_STATUSES[attack.effect];
                 for (let target of targets) {
                     if (target.actor) await target.actor.createEmbeddedDocuments("ActiveEffect", [statusData]);
                 }
                 effectResultHTML = `<div style="margin-top:5px; padding:4px; border:1px solid cyan; color:cyan; font-weight:bold;"><i class="fas fa-bolt"></i> Эффект ${statusName} наложен!</div>`;
             } else {
                 // Кнопка для ручного наложения
                 effectResultHTML = `<div style="margin-top:5px; padding:4px; border:1px solid cyan; color:cyan; font-weight:bold;">
                    <i class="fas fa-bolt"></i> Эффект: ${statusName} СРАБОТАЛ!
                    <button class="z-apply-effect" data-effect="${attack.effect}" style="margin-top:2px; font-size:0.8em;">Наложить ${statusName}</button>
                 </div>`;
             }
          } else {
             effectResultHTML = `<div style="margin-top:5px; color:#666; font-size:0.8em;">Эффект ${statusName} не сработал (${procRoll.total} > ${attack.chance})</div>`;
          }
      }

    } catch (e) { dmgHTML = `<div style="color:red; font-size:0.8em">Err: ${e.message}</div>`; }
  }

  // ШУМ
  const totalNoise = (Number(item.system.noise) || 0) + (Number(attack.noise) || 0);
  if (totalNoise > 0) {
    NoiseManager.add(totalNoise);
  }
  const noiseHTML = totalNoise > 0 ? `<div class="z-noise-alert"><i class="fas fa-volume-up"></i> Шум: ${totalNoise}</div>` : "";

  const resultClass = isHit ? "success" : "failure";
  const resultText = isHit ? "ПОПАДАНИЕ" : "ПРОМАХ";

  const content = `
    <div class="z-chat-card">
      <div class="z-card-header">${item.name} <span style="font-size:0.8em; color:#aaa;">(${attack.name})</span></div>
      <div class="z-card-sub">${skillType.toUpperCase()} (${skillBase}) ${atkMod >= 0 ? '+' : ''}${atkMod} ${aimMod} (Aim) - ${targetEvasion} (Eva) = <b>${targetChance}%</b></div>
      <div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${resultClass}">${roll.total}</div></div></div>
      <div class="z-result-label ${resultClass}">${resultText}</div>
      ${dmgHTML}
      ${btnHTML}
      ${effectResultHTML}
      ${noiseHTML}
      <div class="z-ap-spent">Потрачено <b>${apCost} AP</b></div>
    </div>
  `;

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: actor}), content: content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
}

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