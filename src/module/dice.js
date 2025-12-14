import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

// === ДИАЛОГ БРОСКА ===
export async function showRollDialog(label, callback) {
    const content = `
    <form>
        <div class="form-group">
            <label>Модификатор (+/-)</label>
            <input type="number" name="modifier" value="0" autofocus/>
        </div>
        <div class="form-group">
            <label>Режим броска</label>
            <select name="rollMode">
                <option value="roll">Публичный</option>
                <option value="gmroll">Бросок Ведущему (Private)</option>
                <option value="blindroll">Слепой бросок (Blind)</option>
                <option value="selfroll">Только для себя (Self)</option>
            </select>
        </div>
    </form>`;

    new Dialog({
        title: `Проверка: ${label}`,
        content: content,
        buttons: {
            roll: {
                label: "Бросок",
                icon: '<i class="fas fa-dice"></i>',
                callback: (html) => {
                    const modifier = Number(html.find('[name="modifier"]').val()) || 0;
                    const rollMode = html.find('[name="rollMode"]').val();
                    callback(modifier, rollMode);
                }
            }
        },
        default: "roll"
    }).render(true);
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
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

// === БРОСОК НАВЫКА ===
export async function rollSkill(actor, skillId) {
    const skill = actor.system.skills[skillId];
    if (!skill) return;
    
    const label = {
        melee: "Ближний бой", ranged: "Стрельба", science: "Наука", 
        mechanical: "Механика", medical: "Медицина", diplomacy: "Дипломатия",
        leadership: "Лидерство", survival: "Выживание", athletics: "Атлетика",
        stealth: "Скрытность"
    }[skillId] || skillId;

    showRollDialog(label, async (modifier, rollMode) => {
        const roll = new Roll("1d100");
        await roll.evaluate();
        
        const effectiveTarget = skill.value + modifier;
        const resultType = _calcResult(roll.total, effectiveTarget);
        
        const modText = modifier !== 0 ? ` (${modifier > 0 ? "+" : ""}${modifier})` : "";
        const cardHtml = _getSlotMachineHTML(`${label}${modText}`, effectiveTarget, roll.total, resultType);
        
        await roll.toMessage({ 
            speaker: ChatMessage.getSpeaker({actor}), 
            content: cardHtml,
            flags: { zsystem: { type: "skill", key: skillId } }
        }, { 
            rollMode: rollMode 
        });
    });
}

// === АТАКА (ДИАЛОГ) ===
export async function performAttack(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return;
  if (actor.hasStatusEffect("panic")) return ui.notifications.error("Паника! Персонаж не контролирует себя.");

  let attackOptions = item.system.attacks || {};
  if (Object.keys(attackOptions).length === 0) {
      attackOptions["default"] = { 
          name: "Атака", ap: item.system.apCost || 3, 
          dmg: item.system.damage || "1d6", noise: item.system.noise || 0 
      };
  }
  
  let buttonsHTML = "";
  for (let [key, atk] of Object.entries(attackOptions)) {
    const totalNoise = (Number(item.system.noise) || 0) + (Number(atk.noise) || 0);
    buttonsHTML += `<button class="z-attack-btn" data-key="${key}"><div class="atk-name">${atk.name}</div><div class="atk-info">AP: ${atk.ap} | Noise: ${totalNoise}</div></button>`;
  }
  
  const dialogContent = `
  <form class="z-attack-dialog">
      <div class="grid grid-2col" style="margin-bottom:10px;">
          <div class="form-group">
              <label>Модификатор</label>
              <input type="number" id="atk-modifier" value="0" style="text-align:center;"/>
          </div>
          <div class="form-group">
              <label>Режим</label>
              <select id="atk-rollMode">
                  <option value="roll">Публичный</option>
                  <option value="gmroll">Бросок Ведущему</option>
                  <option value="blindroll">Слепой бросок</option>
                  <option value="selfroll">Только для себя</option>
              </select>
          </div>
      </div>
      <div class="form-group"><label>Цель:</label><select id="aim-location"><option value="torso">Торс</option><option value="head">Голова (-40)</option><option value="lArm">Л.Рука (-20)</option><option value="rArm">П.Рука (-20)</option><option value="lLeg">Л.Нога (-20)</option><option value="rLeg">П.Нога (-20)</option></select></div>
      <hr>
      <div class="attack-buttons">${buttonsHTML}</div>
  </form>`;

  new Dialog({
    title: `Атака: ${item.name}`, 
    content: dialogContent,
    buttons: {},
    render: (html) => {
      html.find('.z-attack-btn').click(async (ev) => {
        ev.preventDefault();
        const key = ev.currentTarget.dataset.key;
        const loc = html.find('#aim-location').val();
        
        const modifier = Number(html.find('#atk-modifier').val()) || 0;
        const rollMode = html.find('#atk-rollMode').val();
        
        Object.values(ui.windows).forEach(w => { if (w.title === `Атака: ${item.name}`) w.close(); });
        await _executeAttack(actor, item, attackOptions[key], loc, modifier, rollMode);
      });
    }
  }).render(true);
}

// === ЛОГИКА АТАКИ (ИСПОЛНЕНИЕ) ===
async function _executeAttack(actor, item, attack, location = "torso", modifier = 0, rollMode = "roll") {
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  
  if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP (нужно ${apCost})`);

  // --- ВЫЧИСЛЕНИЕ ЦЕЛЕЙ И МОДИФИКАТОРОВ ---
  let targets = Array.from(game.user.targets);
  let targetToken = targets.length > 0 ? targets[0] : null;
  let sourceToken = actor.getActiveTokens()[0]; // Берем первый токен актора

  // Базовые параметры
  let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : ((item.system.isThrowing && item.system.weaponType !== 'melee') ? 'athletics' : 'melee');
  const skillVal = actor.system.skills[skillType]?.value || 0;
  const atkMod = Number(attack.mod) || 0;
  const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);
  
  // Переменные для расчета
  let coverPenalty = 0;
  let coverLabel = "";
  let rangePenalty = 0;
  let rangeLabel = "";
  let evasionMod = 0;
  let evasionMsg = "";
  let targetName = "Нет цели";

  // --- ЛОГИКА ЦЕЛИ (Укрытия, Дистанция, Уклонение) ---
  if (targetToken && sourceToken) {
      targetName = targetToken.name;
      const dist = canvas.grid.measureDistance(sourceToken, targetToken);

      // 1. Укрытие (Только для дальнего боя или если есть препятствия)
      // Для ближнего боя укрытие обычно игнорируется, если мы в соседней клетке, 
      // но оставим проверку, вдруг бьют через окно копьем.
      const coverData = _calculateCover(sourceToken, targetToken);
      coverPenalty = coverData.penalty;
      coverLabel = coverData.label ? ` [${coverData.label} ${coverData.penalty}]` : "";

      if (coverPenalty <= -1000) {
          return ui.notifications.error("Цель не видна (Полное укрытие)!");
      }

      // 2. Дальность
      const rangeData = _calculateRangePenalty(item, dist);
      rangePenalty = rangeData.penalty;
      rangeLabel = rangeData.label ? ` [${rangeData.label} ${rangeData.penalty}]` : "";

      // 3. Уклонение
      if (!targetToken.actor?.hasStatusEffect("prone")) {
          const ev = targetToken.actor?.system.secondary?.evasion?.value || 0;
          evasionMod = -(ev * 3);
          if (evasionMod !== 0) evasionMsg = ` [Eva ${evasionMod}%]`;
      }
  }

  // --- РАСХОД РЕСУРСОВ ---
  let isThrowingAction = (attack.mode === 'throw') || (item.system.isThrowing && item.system.weaponType !== 'melee');
  const isGrenade = isThrowingAction && (Number(item.system.blastRadius) > 0);
  
  if (!isThrowingAction && item.system.ammoType) {
      const curMag = Number(item.system.mag.value) || 0;
      let ammoCost = attack.name.match(/burst|очередь/i) ? 3 : 1;
      if (curMag < ammoCost) return ui.notifications.warn("Щелк! Нет патронов.");
      await item.update({ "system.mag.value": curMag - ammoCost });
  }
  await actor.update({"system.resources.ap.value": curAP - apCost});

  // --- БРОСОК ---
  // Суммируем все модификаторы
  const totalChance = Math.max(0, skillVal + atkMod + aimMod + evasionMod + coverPenalty + rangePenalty + modifier);
  
  const roll = new Roll("1d100");
  await roll.evaluate();

  // Крит
  const isStealth = actor.hasStatusEffect("stealth");
  const baseCrit = Number(item.system.critChance) || 0;
  const critThreshold = 5 + baseCrit + (isStealth ? 5 : 0);

  let resultType = "fail";
  if (roll.total <= critThreshold) resultType = "crit-success";
  else if (roll.total <= totalChance) resultType = "success";
  else if (roll.total >= 96) resultType = "crit-fail";

  const isHit = resultType.includes("success");
  const isCrit = resultType === "crit-success";

  // --- УРОН ---
  let dmgAmount = 0;
  let dmgDisplay = "";
  let rawDmgFormula = attack.dmg || "0";
  const damageDataForGM = []; 

  if (isHit || isGrenade) {
      let formula = attack.dmg || "0";
      if (isGrenade && !isHit) formula = `ceil((${formula}) / 2)`; 
      
      if (isCrit) {
          const mult = Number(item.system.critMult) || 1.5;
          formula = `ceil((${formula}) * ${mult})`;
      }
      
      if (skillType === 'melee' && !isThrowingAction) {
          const s = actor.system.attributes.str.value;
          const req = item.system.strReq || 1;
          if (s >= req) formula += ` + ${s - req}`;
          else formula = `ceil((${formula}) * 0.5)`;
      }
      rawDmgFormula = formula;

      const rDmg = new Roll(formula, actor.getRollData());
      await rDmg.evaluate();
      dmgAmount = Math.max(1, rDmg.total);
      
      dmgDisplay = `<div class="z-damage-box"><div class="dmg-label">УРОН ${isCrit?"(КРИТ!)":""}</div><div class="dmg-val">${dmgAmount}</div></div>`;

      // Собираем цели для урона
      if (targets.length > 0) {
          targets.forEach(t => {
             damageDataForGM.push({ uuid: t.document.uuid, amount: dmgAmount, type: item.system.damageType||"blunt", limb: location });
          });
      }
  }

  // --- ШУМ ---
  let baseNoise = (Number(item.system.noise)||0) + (Number(attack.noise)||0);
  if (isStealth && baseNoise > 0) baseNoise = Math.ceil(baseNoise / 2);
  const noiseHtml = baseNoise > 0 ? `<div class="z-noise-alert">🔊 Шум: +${baseNoise} ${isStealth ? '(Стелс)' : ''}</div>` : "";

  // --- ЧАТ КАРТОЧКА ---
  const modText = modifier !== 0 ? ` (${modifier > 0 ? "+" : ""}${modifier})` : "";
  // Добавляем инфу об укрытии и дальности в заголовок
  const headerInfo = item.name + evasionMsg + coverLabel + rangeLabel + modText;
  
  const cardHtml = _getSlotMachineHTML(headerInfo, totalChance, roll.total, resultType);
  
  const gmContent = `
  <div style="font-size:0.85em; background:#1a1a1a; color:#ccc; padding:5px; border:1px dashed #555; font-family:monospace; margin-top:5px;">
      <div style="color:#ffab91; font-weight:bold; border-bottom:1px solid #333;">GM INFO: ${actor.name} -> ${targetName}</div>
      Skill: ${skillVal}<br>
      Mods: Atk(${atkMod}) Aim(${aimMod}) Eva(${evasionMod}) User(${modifier})<br>
      <b>Cover: ${coverPenalty} | Range: ${rangePenalty}</b><br>
      <b>Total Chance: ${totalChance}%</b><br>
      <hr style="margin:2px 0; border-color:#333;">
      Formula: ${rawDmgFormula}<br>
      Result: ${dmgAmount}
  </div>`;

  await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `${cardHtml}${dmgDisplay}${noiseHtml}<div class="z-ap-spent">-${apCost} AP</div>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: {
          zsystem: {
              noiseAdd: baseNoise,
              damageData: damageDataForGM,
              gmInfo: gmContent
          }
      }
  }, { rollMode: rollMode });

  if (isThrowingAction) {
      if (item.system.quantity > 1) await item.update({"system.quantity": item.system.quantity - 1});
      else await item.delete();
  }
}

export async function rollPanicTable(actor) {
    const roll = new Roll("1d6"); await roll.evaluate(); const result = roll.total;
    let behavior = "", effectDetails = "";
    if (!actor.hasStatusEffect("panic")) {
        await actor.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.panic]);
    }
    if (result <= 2) { behavior = "Сжаться в страхе"; effectDetails = "Prone, 0 AP."; await actor.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.prone]); await actor.update({"system.resources.ap.value": 0}); } 
    else if (result <= 4) { behavior = "Бегство"; effectDetails = "Потратьте AP на бегство."; } 
    else { behavior = "Берсерк"; effectDetails = "Атакуйте в рукопашную."; }
    const content = `<div class="z-chat-card" style="border-color:orange;"><div class="z-card-header" style="color:orange;">ПАНИКА!</div><div style="font-size:2em; font-weight:bold;">${result}</div><div>${behavior}</div></div>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor}), content });
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ БОЯ ===

/**
 * Расчет укрытия (Cover) методом 4 лучей
 * @returns {Object} { penalty: number, label: string }
 */
function _calculateCover(sourceToken, targetToken) {
    if (!sourceToken || !targetToken) return { penalty: 0, label: "" };

    const sourceCenter = sourceToken.center;
    const t = targetToken;
    
    // 4 угла цели (с небольшим отступом внутрь 2px, чтобы не цеплять стены, на которых стоим)
    const corners = [
        { x: t.x + 2, y: t.y + 2 },
        { x: t.x + t.w - 2, y: t.y + 2 },
        { x: t.x + t.w - 2, y: t.y + t.h - 2 },
        { x: t.x + 2, y: t.y + t.h - 2 }
    ];

    let blockedCount = 0;

    for (let point of corners) {
        const hasCollision = CONFIG.Canvas.polygonBackends.move.testCollision(
            sourceCenter, 
            point, 
            { mode: "any", type: "move" } // "any" быстрее, нам достаточно знать факт пересечения
        );
        if (hasCollision) blockedCount++;
    }

    if (blockedCount === 0) return { penalty: 0, label: "" };
    if (blockedCount <= 2) return { penalty: -15, label: "Легкое укр." }; // 1-2 угла закрыты
    if (blockedCount === 3) return { penalty: -30, label: "Тяж. укр." };  // 3 угла закрыты
    
    return { penalty: -1000, label: "Не видно" }; // 4 угла закрыты (полная блокировка)
}

/**
 * Расчет штрафа за дальность
 */
function _calculateRangePenalty(item, dist) {
    const range = Number(item.system.range) || 1; // Базовая дальность оружия
    if (item.system.weaponType === 'melee') return { penalty: 0, label: "" };

    if (dist <= range) return { penalty: 0, label: "" };
    if (dist <= range * 2) return { penalty: -20, label: "Далеко" };
    
    return { penalty: -40, label: "Слишк. далеко" }; // Или запрет стрельбы
}