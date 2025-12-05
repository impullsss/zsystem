import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

// ... (_calcResult, _getSlotMachineHTML, rollSkill - без изменений) ...
function _calcResult(roll, target) {
    if (roll <= 5) return "crit-success";
    if (roll >= 96) return "crit-fail";
    if (roll <= target) return "success";
    return "fail";
}

function _getSlotMachineHTML(label, target, rollTotal, resultType) {
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
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({actor: actor}), content: content });
}

/**
 * Инициация Атаки (HYBRID FIX)
 */
export async function performAttack(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return ui.notifications.error("Предмет не найден!");
  if (actor.hasStatusEffect("panic")) return ui.notifications.error("Паника! Нельзя атаковать.");

  let attacks = item.system.attacks || {};
  let attackOptions = {};

  const baseAP = item.system.apCost || 3;
  const baseDmg = item.system.damage || "1d6";
  const baseNoise = item.system.noise || 0;

  // ЛОГИКА ГЕНЕРАЦИИ ОПЦИЙ
  const isCustomConfigured = Object.keys(attacks).length > 0;
  
  if (isCustomConfigured) {
      attackOptions = attacks;
  } else {
      // Если это ГИБРИД (Melee + Throwing)
      if (item.system.weaponType === 'melee' && item.system.isThrowing) {
          attackOptions["melee"] = { 
              name: "Удар (Melee)", mode: "melee", 
              ap: baseAP, dmg: baseDmg, mod: 0, noise: baseNoise 
          };
          attackOptions["throw"] = { 
              name: "Бросок (Throw)", mode: "throw",
              ap: baseAP, dmg: baseDmg, mod: 0, noise: baseNoise 
          };
      } 
      // Обычное оружие
      else {
          attackOptions["default"] = { 
              name: "Атака", 
              ap: baseAP, dmg: baseDmg, mod: 0, noise: baseNoise 
          };
      }
  }
  
  // Рендер кнопок
  let buttonsHTML = "";
  for (let [key, atk] of Object.entries(attackOptions)) {
    let effectInfo = atk.effect ? `<span style="color:cyan; font-size:0.8em; display:block;">${GLOBAL_STATUSES[atk.effect]?.label || atk.effect}</span>` : "";
    const totalNoise = (Number(item.system.noise) || 0) + (Number(atk.noise) || 0);
    
    buttonsHTML += `
      <button class="z-attack-btn" data-key="${key}">
        <div class="atk-name">${atk.name}</div>
        <div class="atk-info">AP: ${atk.ap} | Dmg: ${atk.dmg} | Noise: ${totalNoise}</div>
        ${effectInfo}
      </button>`;
  }
  
  const content = `
    <form class="z-attack-dialog">
      <div class="form-group">
        <label>Цель:</label>
        <select id="aim-location">
          <option value="torso">Торс (0%)</option>
          <option value="head">Голова (-40%)</option>
          <option value="lArm">Л. Рука (-20%)</option>
          <option value="rArm">П. Рука (-20%)</option>
          <option value="lLeg">Л. Нога (-20%)</option>
          <option value="rLeg">П. Нога (-20%)</option>
        </select>
      </div>
      <hr><div class="attack-buttons">${buttonsHTML}</div>
    </form>`;
  
  new Dialog({
    title: `Атака: ${item.name}`, content, buttons: {},
    render: (html) => {
      html.find('.z-attack-btn').click(async (ev) => {
        ev.preventDefault();
        const key = ev.currentTarget.dataset.key;
        const location = html.find('#aim-location').val(); 
        const selectedAttack = attackOptions[key];
        
        // Сворачиваем лист только при БРОСКЕ
        const isThrowAction = selectedAttack.mode === 'throw' || (item.system.isThrowing && item.system.weaponType !== 'melee');
        if (isThrowAction) actor.sheet.minimize(); 
        
        Object.values(ui.windows).forEach(w => { if (w.title === `Атака: ${item.name}`) w.close(); });
        
        await _executeAttack(actor, item, selectedAttack, location);
      });
    }
  }).render(true);
}

// ЛОГИКА АТАКИ
async function _executeAttack(actor, item, attack, location = "torso") {
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  if (curAP < apCost) return ui.notifications.warn(`Нужно ${apCost} AP.`);

  // --- 1. ОПРЕДЕЛЕНИЕ ТИПА ---
  let isThrowingAction = false;
  if (attack.mode === 'throw') isThrowingAction = true;
  else if (item.system.isThrowing && item.system.weaponType !== 'melee') isThrowingAction = true;
  
  const isGrenade = isThrowingAction && (Number(item.system.blastRadius) > 0);
  const isThrownWeapon = isThrowingAction && !isGrenade; 

  // --- 2. ПАТРОНЫ ---
  if (!isThrowingAction && item.system.ammoType) {
      const maxMag = Number(item.system.mag?.max) || 0;
      if (maxMag > 0) {
          const curMag = Number(item.system.mag.value) || 0;
          let cost = attack.name.match(/burst|очередь/i) ? 3 : 1;
          if (curMag < cost) return ui.notifications.warn("Нет патронов!");
          await item.update({ "system.mag.value": curMag - cost });
      }
  }

  // --- 3. ШАБЛОНЫ ---
  let targets = Array.from(game.user.targets);
  if (isGrenade) {
      const t = await _placeTemplate(item);
      if (t === null) { actor.sheet.maximize(); return; }
      targets = t;
  }

  // --- 4. СПИСАНИЕ AP ---
  await actor.update({"system.resources.ap.value": curAP - apCost});

  // --- 5. РАСЧЕТ ШАНСОВ ---
  let skillType = 'melee';
  if (item.system.weaponType === 'ranged') skillType = 'ranged';
  if (isThrowingAction) skillType = 'athletics'; 

  const skill = actor.system.skills[skillType];
  const skillBase = skill ? skill.value : 0;
  const atkMod = Number(attack.mod) || 0;
  const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);
  
  // Уклонение
  let evasionPenalty = 0;
  let evasionMsg = "";
  if (targets.length > 0 && !isGrenade) { 
      const targetActor = targets[0].actor;
      if (targetActor) {
          const targetEvasion = targetActor.system.secondary?.evasion?.value || 0;
          if (!targetActor.hasStatusEffect("prone") && !targetActor.hasStatusEffect("status-unconscious")) {
              evasionPenalty = -(targetEvasion * 3); 
              if (evasionPenalty !== 0) evasionMsg = ` [Eva ${evasionPenalty}%]`;
          }
      }
  }

  // Дистанция
  let rangeMod = 0;
  let rangeMsg = "";
  if (targets.length > 0 && !isGrenade) {
      const token = actor.getActiveTokens()[0];
      const targetToken = targets[0];
      if (token) {
          const dist = canvas.grid.measureDistance(token, targetToken, { gridSpaces: true });
          
          if (!isThrowingAction && skillType === 'melee' && dist > 2) {
              return ui.notifications.warn(`Слишком далеко (${dist})!`);
          }
          
          if (isThrowingAction || skillType === 'ranged') {
              const range = Number(item.system.range) || 1;
              if (dist > range * 4) return ui.notifications.error("Вне дальности!");
              else if (dist > range * 2) { rangeMod = -40; rangeMsg=" [Экстр.]"; }
              else if (dist > range) { rangeMod = -20; rangeMsg=" [Далеко]"; }
              
              if (skillType === 'ranged' && dist <= 1.5 && item.system.subtype !== 'pistol') {
                  rangeMod = -20; rangeMsg=" [В упор]";
              }
          }
      }
  }

  // --- ИТОГОВЫЙ БРОСОК ---
  const targetChance = Math.max(0, skillBase + atkMod + aimMod + rangeMod + evasionPenalty);
  const roll = new Roll("1d100");
  await roll.evaluate();
  const resultType = _calcResult(roll.total, targetChance);
  const isHit = (resultType.includes("success"));
  const isCrit = (resultType === "crit-success");

  // ЛОГ ДЛЯ ОТЛАДКИ (Смотри в F12)
  console.log(`ZSystem Attack | Roll: ${roll.total} vs Target: ${targetChance} | Result: ${resultType}`);

  let dmgHTML = ""; 
  let autoDamageMsg = "";
  
  // --- 6. УРОН ---
  if (isHit || isGrenade) {
      try {
          let formula = attack.dmg || "0";
          if (isGrenade && !isHit) {
              formula = `ceil((${formula}) / 2)`;
              autoDamageMsg += `<div style='color:orange; font-size:0.8em;'>Промах (½ Урона)</div>`;
          }
          if (isCrit) formula = `ceil((${formula}) * 1.5)`;

          if (skillType === 'melee' || (isThrownWeapon)) {
              const str = actor.system.attributes.str.value;
              const req = item.system.strReq || 1;
              if (str >= req) formula += ` + ${str - req}`; 
              else formula = `ceil((${formula}) * 0.5)`;
          }

          const dmgRoll = new Roll(formula, actor.getRollData());
          await dmgRoll.evaluate();
          const finalDamage = Math.max(1, dmgRoll.total);
          
          if (targets.length > 0) {
              for (let t of targets) {
                  const tActor = t.actor;
                  if (!tActor) continue;

                  // === FIX: ЗАЩИТА ОТ КОНТЕЙНЕРОВ (У них нет HP) ===
                  if (!tActor.system.resources?.hp) {
                      console.log("ZSystem | Skipping damage for non-living target:", t.name);
                      continue; 
                  }
                  // ==================================================
                  
                  if (isGrenade) {
                      const oldHP = tActor.system.resources.hp.value;
                      await tActor.applyDamage(finalDamage, "fire", "torso"); 
                      
                      // Расчет для конечностей (только если есть ресурсы)
                      if (tActor.system.resources?.hp) {
                          const realDmg = oldHP - tActor.system.resources.hp.value;
                          if (realDmg > 0) {
                              const updates = {};
                              ["head", "lArm", "rArm", "lLeg", "rLeg"].forEach(l => {
                                  if (tActor.system.limbs && tActor.system.limbs[l]) {
                                      const v = tActor.system.limbs[l].value;
                                      updates[`system.limbs.${l}.value`] = Math.max(0, v - realDmg);
                                  }
                              });
                              if(Object.keys(updates).length) await tActor.update(updates);
                              autoDamageMsg += `<div style="color:red; font-size:0.8em;">💥 ${t.name}: -${realDmg}</div>`;
                          }
                      }
                  } else {
                      // Обычная атака
                      await tActor.applyDamage(finalDamage, item.system.damageType || "blunt", location);
                      autoDamageMsg += `<div style="color:red; font-size:0.8em;">🩸 ${t.name}: -${finalDamage} HP</div>`;
                      
                      if (isThrownWeapon && isHit) {
                          const itemData = item.toObject();
                          itemData.system.quantity = 1;
                          itemData.system.equipped = false; 
                          await tActor.createEmbeddedDocuments("Item", [itemData]);
                          autoDamageMsg += `<div style="color:#d84315; font-size:0.7em;">🗡️ Застряло!</div>`;
                      }
                  }
              }
          }
          dmgHTML = `<div class="z-damage-box"><div class="dmg-label">УРОН ${isCrit ? "(КРИТ!)" : ""}</div><div class="dmg-val">${finalDamage}</div>${autoDamageMsg}</div>`;
      } catch(e) { console.error("ZSystem Attack Error:", e); }
  }

  if (isThrowingAction) {
      const qty = item.system.quantity;
      if (qty > 1) await item.update({"system.quantity": qty - 1});
      else await item.delete();
  }

  // ШУМ
  const itemNoise = Number(item.system.noise) || 0;
  const attackNoise = Number(attack.noise) || 0;
  const totalNoise = itemNoise + attackNoise;
  if (totalNoise > 0) NoiseManager.add(totalNoise);
  const noiseHTML = totalNoise ? `<div class="z-noise-alert">🔊 Шум: ${totalNoise}</div>` : "";

  const cardHTML = _getSlotMachineHTML(item.name + rangeMsg + evasionMsg, targetChance, roll.total, resultType);
  const content = `${cardHTML}${dmgHTML}${noiseHTML}<div class="z-ap-spent">-${apCost} AP</div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor}), content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
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