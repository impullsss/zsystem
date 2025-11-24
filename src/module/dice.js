import { NoiseManager } from "./noise.js"; 

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
    buttonsHTML += `
      <button class="z-attack-btn" data-key="${key}">
        <div class="atk-name">${atk.name}</div>
        <div class="atk-info">AP: ${atk.ap} | Dmg: ${atk.dmg} | Mod: ${atk.mod}%</div>
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

  // --- ПРОВЕРКА МАГАЗИНА ---
  const ammoType = item.system.ammoType;
  const maxMag = Number(item.system.mag?.max) || 0;
  
  // Если это огнестрел с магазином
  if (ammoType && maxMag > 0) {
      const curMag = Number(item.system.mag.value) || 0;
      let ammoCost = 1;
      if (attack.name.toLowerCase().match(/burst|очередь/)) ammoCost = 3;

      if (curMag < ammoCost) {
          return ui.notifications.warn(`Перезарядите оружие! (В стволе: ${curMag})`);
      }
      // Списываем из оружия
      await item.update({ "system.mag.value": curMag - ammoCost });
  }
  // -------------------------

  await actor.update({"system.resources.ap.value": curAP - apCost});

  let skillType = 'melee';
  // Используем сохраненный в предмете тип (надежнее)
  if (item.system.weaponType === 'ranged') skillType = 'ranged';
  else if (['pistol', 'rifle', 'shotgun'].includes(item.system.subtype)) skillType = 'ranged';

  const skill = actor.system.skills[skillType];
  const skillBase = skill ? skill.value : 0;
  const atkMod = Number(attack.mod) || 0;
  
  let aimMod = 0;
  if (location === "head") aimMod = -40;
  else if (location !== "torso") aimMod = -20;

  const targetChance = Math.max(0, skillBase + atkMod + aimMod); 
  const damageType = item.system.damageType || "blunt";

  const roll = new Roll("1d100");
  await roll.evaluate();
  const isHit = roll.total <= targetChance;

  let dmgHTML = "";
  let finalDamage = 0;
  let btnHTML = "";

  if (isHit) {
    try {
      let formulaString = attack.dmg || "0";
      // Логика силы только для Melee
      if (skillType === 'melee') {
        const str = Number(actor.system.attributes.str.value) || 1;
        const req = Number(item.system.strReq) || 1;
        if (str >= req) {
          const bonus = str - req;
          if (bonus > 0) formulaString += ` + ${bonus}`;
        } else {
          formulaString = `(${formulaString}) * 0.5`;
        }
      }
      
      const dmgRoll = new Roll(formulaString, actor.getRollData());
      await dmgRoll.evaluate();
      finalDamage = Math.ceil(dmgRoll.total); 
      
      dmgHTML = `<div class="z-damage-box"><div class="dmg-label">УРОН (${formulaString})</div><div class="dmg-val">${finalDamage} <span style="font-size:0.5em; color:#888;">${damageType}</span></div></div>`;
      btnHTML = `<button class="z-apply-damage" data-damage="${finalDamage}" data-type="${damageType}" data-limb="${location}"><i class="fas fa-crosshairs"></i> Применить (${_getLimbName(location)})</button>`;
    } catch (e) { dmgHTML = `<div style="color:red; font-size:0.8em">Ошибка формулы</div>`; }
  }

  const totalNoise = (Number(item.system.noise) || 0) + (Number(attack.noise) || 0);
  if (totalNoise > 0) {
    const { NoiseManager } = await import("./noise.js"); 
    NoiseManager.add(totalNoise);
  }
  const noiseHTML = totalNoise > 0 ? `<div class="z-noise-alert"><i class="fas fa-volume-up"></i> Шум: ${totalNoise}</div>` : "";

  const resultClass = isHit ? "success" : "failure";
  const resultText = isHit ? "ПОПАДАНИЕ" : "ПРОМАХ";

  const content = `
    <div class="z-chat-card">
      <div class="z-card-header">${item.name} <span style="font-size:0.8em; color:#aaa;">(${attack.name})</span></div>
      <div class="z-card-sub">${skillType.toUpperCase()} (${skillBase}) ${atkMod >= 0 ? '+' : ''}${atkMod} ${aimMod} (Aim) = <b>${targetChance}%</b></div>
      <div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${resultClass}">${roll.total}</div></div></div>
      <div class="z-result-label ${resultClass}">${resultText}</div>
      ${dmgHTML}
      ${btnHTML}
      ${noiseHTML}
      <div class="z-ap-spent">Потрачено <b>${apCost} AP</b></div>
    </div>
  `;

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: actor}), content: content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
}

function _getLimbName(key) {
    const map = { head: "Голова", torso: "Торс", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога" };
    return map[key] || key;
}