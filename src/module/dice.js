import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

/**
 * Определение успеха броска (d100)
 */
function _calcResult(roll, target) {
    if (roll <= 5) return "crit-success";
    if (roll >= 96) return "crit-fail";
    if (roll <= target) return "success";
    return "fail";
}

/**
 * HTML генератор для чата (Слот-машина)
 */
function _getSlotMachineHTML(label, target, rollTotal, resultType) {
  let statusClass = (resultType.includes("success")) ? "success" : "failure";
  let statusLabel = (resultType === "crit-success") ? "КРИТ. УСПЕХ" : 
                    (resultType === "success" ? "УСПЕХ" : 
                    (resultType === "crit-fail" ? "КРИТ. ПРОВАЛ" : "ПРОВАЛ"));

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
 * Инициация Атаки (Диалог выбора)
 */
export async function performAttack(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return ui.notifications.error("Предмет не найден!");
  
  if (actor.hasStatusEffect("panic")) {
      return ui.notifications.error("Вы в панике! Вы не можете контролировать свои атаки.");
  }
  
  const attacks = item.system.attacks || {};
  let attackOptions = attacks;

  // Если атак нет, создаем дефолтную на лету
  if (Object.keys(attacks).length === 0) {
    attackOptions = { 
        "default": { 
            name: "Атака", 
            ap: item.system.apCost || 3, 
            dmg: item.system.damage || "1d6", 
            mod: 0, 
            noise: item.system.noise || 0 
        } 
    };
  }
  
  // Генерация кнопок
  let buttonsHTML = "";
  for (let [key, atk] of Object.entries(attackOptions)) {
    let effectInfo = "";
    if (atk.effect) {
        effectInfo = `<span style="color:cyan; font-size:0.8em; display:block;">${GLOBAL_STATUSES[atk.effect]?.label || atk.effect} (${atk.chance}%)</span>`;
    }
    // Считаем общий шум для отображения
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
        const selectedAttack = attackOptions[key];
        
        // Сворачиваем лист, если нужно кидать (чтобы видеть карту)
        if (item.system.isThrowing) {
            actor.sheet.minimize();
        }

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
 * Выполнение Атаки (Ядро логики)
 */
async function _executeAttack(actor, item, attack, location = "torso") {
  // 1. Проверка AP
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP! Нужно ${apCost}.`);

  // 2. Определение типа атаки
  const isThrowing = item.system.isThrowing;
  const isGrenade = isThrowing && (Number(item.system.blastRadius) > 0);
  const isThrownWeapon = isThrowing && !isGrenade;

  // 3. Проверка Патронов (если это не метательное)
  if (!isThrowing) {
      const ammoType = item.system.ammoType;
      const maxMag = Number(item.system.mag?.max) || 0;
      if (ammoType && maxMag > 0) {
          const curMag = Number(item.system.mag.value) || 0;
          let ammoCost = 1;
          if (attack.name.toLowerCase().match(/burst|очередь/)) ammoCost = 3;
          
          if (curMag < ammoCost) return ui.notifications.warn(`КЛИК! Оружие пусто.`);
          await item.update({ "system.mag.value": curMag - ammoCost });
      }
  }

  // --- ЛОГИКА ТАРГЕТИНГА / ШАБЛОНОВ ---
  let targets = Array.from(game.user.targets); 
  
  if (isGrenade) {
      // Ставим шаблон
      const templateTargets = await _placeTemplate(item);
      
      // Если templateTargets === null, значит игрок нажал ПКМ (отмена)
      if (templateTargets === null) {
          actor.sheet.maximize(); // Разворачиваем лист обратно
          return;
      }
      
      targets = templateTargets; // Переопределяем цели
  }
  // ------------------------------------

  // Списание AP
  await actor.update({"system.resources.ap.value": curAP - apCost});

  // 4. Расчет шанса
  let skillType = 'melee';
  if (item.system.weaponType === 'ranged') skillType = 'ranged';
  
  // ВАЖНО: Метательное всегда использует Атлетику
  if (isThrowing) skillType = 'athletics'; 

  const skill = actor.system.skills[skillType];
  const skillBase = skill ? skill.value : 0;
  const atkMod = Number(attack.mod) || 0;
  
  const isDizzy = actor.hasStatusEffect("dizzy");
  const dizzyMod = isDizzy ? -50 : 0;

  let aimMod = 0;
  if (location === "head") aimMod = -40;
  else if (location !== "torso") aimMod = -20;

  const targetChance = Math.max(0, skillBase + atkMod + aimMod + dizzyMod); 
  const damageType = item.system.damageType || "blunt";

  // 5. Бросок кубика
  const roll = new Roll("1d100");
  await roll.evaluate();
  
  const resultType = _calcResult(roll.total, targetChance);
  const isHit = (resultType === "success" || resultType === "crit-success");
  const isCrit = (resultType === "crit-success");

  // 6. Обработка Урона
  let dmgHTML = "";
  let btnHTML = "";
  let effectResultHTML = "";
  let autoDamageMsg = "";

  // Если это попадание ИЛИ это граната (гранаты взрываются и при промахе, просто слабее)
  if (isHit || isGrenade) {
    try {
      let formulaString = attack.dmg || "0";
      
      // Если Граната и Промах -> Половина урона (отклонение)
      if (isGrenade && !isHit) {
           formulaString = `ceil((${formulaString}) / 2)`; 
           autoDamageMsg += `<div style='color:orange; font-size:0.8em; margin-bottom:5px;'>⚠️ Промах! (Отклонение)</div>`;
      }
      
      // Бонус Силы (Только для ближнего боя, не метательного)
      if (skillType === 'melee' && !isThrowing) {
        const str = Number(actor.system.attributes.str.value) || 1;
        const req = Number(item.system.strReq) || 1;
        if (str >= req) {
          const bonus = str - req;
          if (bonus > 0) formulaString += ` + ${bonus}`;
        } else {
          formulaString = `ceil((${formulaString}) * 0.5)`; // Штраф за слабость
        }
      }
      
      // Крит
      if (isCrit) formulaString = `ceil((${formulaString}) * 1.5)`;

      const dmgRoll = new Roll(formulaString, actor.getRollData());
      await dmgRoll.evaluate();
      let finalDamage = Math.max(1, dmgRoll.total); 
      
      // АВТО-УРОН
      if (targets.length > 0) {
          for (let target of targets) {
              const tActor = target.actor;
              if (tActor) {
                  // --- А) ВЗРЫВ (ГРАНАТА) ---
                  if (isGrenade) {
                      // Наносим урон в Торс, чтобы посчитать резисты брони
                      const oldHP = tActor.system.resources.hp.value;
                      await tActor.applyDamage(finalDamage, damageType, "torso");
                      const newHP = tActor.system.resources.hp.value;
                      
                      // Вычисляем, сколько реально прошло урона
                      const actualDmg = oldHP - newHP;
                      
                      // Вычитаем этот же урон из остальных конечностей (симуляция взрывной волны)
                      if (actualDmg > 0) {
                          const limbs = ["head", "lArm", "rArm", "lLeg", "rLeg"];
                          const updates = {};
                          limbs.forEach(l => {
                              const cur = tActor.system.limbs[l]?.value;
                              if (cur !== undefined) {
                                  updates[`system.limbs.${l}.value`] = Math.max(0, cur - actualDmg);
                              }
                          });
                          if (Object.keys(updates).length > 0) await tActor.update(updates);
                          autoDamageMsg += `<div style="color:red; font-size:0.8em;">💥 ${target.name}: -${actualDmg} HP (Full Body)</div>`;
                      } else {
                          autoDamageMsg += `<div style="color:gray; font-size:0.8em;">🛡️ ${target.name}: Absorbed</div>`;
                      }
                  } 
                  
                  // --- Б) ТОЧЕЧНОЕ ПОПАДАНИЕ (Включая метательное) ---
                  else {
                      await tActor.applyDamage(finalDamage, damageType, location);
                      autoDamageMsg += `<div style="color:red; font-size:0.8em;">🩸 ${target.name}: -${finalDamage} HP</div>`;

                      // МЕХАНИКА ЗАСТРЕВАНИЯ ОРУЖИЯ
                      // Если метательное, не граната, и попало
                      if (isThrownWeapon && isHit) {
                          // Создаем копию предмета у жертвы
                          const itemData = item.toObject();
                          itemData.system.quantity = 1;
                          itemData.system.equipped = false; // В инвентарь
                          await tActor.createEmbeddedDocuments("Item", [itemData]);
                          autoDamageMsg += `<div style="color:#d84315; font-size:0.8em; font-weight:bold; border-top:1px dashed #777;">🗡️ Оружие застряло в цели!</div>`;
                      }
                  }
              }
          }
          btnHTML = `<div style="text-align:center; color:#888; font-style:italic;">Урон применен автоматически</div>`;
      } else {
           // Кнопка ручного применения
           btnHTML = `<button class="z-apply-damage" data-damage="${finalDamage}" data-type="${damageType}" data-limb="${location}"><i class="fas fa-crosshairs"></i> Применить (${location})</button>`;
      }
      
      // HTML Блок Урона
      const critLabel = isCrit ? `<span style="color:#66bb6a; font-weight:bold;">(КРИТ!)</span>` : "";
      dmgHTML = `<div class="z-damage-box">
                    <div class="dmg-label">УРОН ${critLabel}</div>
                    <div class="dmg-val">${finalDamage} <span style="font-size:0.5em; color:#888;">${damageType}</span></div>
                    ${autoDamageMsg}
                 </div>`;

      // Эффекты (Proc)
      if (attack.effect && attack.chance > 0 && isHit) {
          const statusDef = GLOBAL_STATUSES[attack.effect];
          const procRoll = new Roll("1d100");
          await procRoll.evaluate();
          
          if (procRoll.total <= attack.chance) {
             if (targets.length > 0) {
                 for (let t of targets) {
                     if (t.actor && !t.actor.hasStatusEffect(attack.effect)) {
                         await t.actor.createEmbeddedDocuments("ActiveEffect", [statusDef]);
                     }
                 }
                 effectResultHTML = `<div style="margin-top:5px; padding:4px; border:1px solid cyan; color:cyan; font-weight:bold;"><i class="fas fa-bolt"></i> ${statusDef?.label || attack.effect} наложен!</div>`;
             } else {
                 effectResultHTML = `<div style="margin-top:5px; padding:4px; border:1px solid cyan; color:cyan; font-weight:bold;"><i class="fas fa-bolt"></i> Эффект сработал!</div>`;
             }
          }
      }

    } catch (e) { dmgHTML = `<div style="color:red; font-size:0.8em">Err: ${e.message}</div>`; }
  }

  // 7. Шум (Сумма предмета и атаки)
  const itemNoise = Number(item.system.noise) || 0;
  const attackNoise = Number(attack.noise) || 0;
  const totalNoise = itemNoise + attackNoise;
  
  if (totalNoise > 0) NoiseManager.add(totalNoise);
  const noiseHTML = totalNoise > 0 ? `<div class="z-noise-alert"><i class="fas fa-volume-up"></i> Шум: ${totalNoise}</div>` : "";

  // 8. Расход метательного предмета
  if (isThrowing) {
      const qty = item.system.quantity;
      if (qty > 1) {
          await item.update({"system.quantity": qty - 1});
      } else {
          await item.delete();
      }
  }

  // 9. Сборка сообщения
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
 * Размещение шаблона (Native Foundry V13)
 * Возвращает массив токенов внутри.
 */
async function _placeTemplate(item) {
    const radius = Number(item.system.blastRadius) || 1;
    const type = item.system.templateType === "cone" ? "cone" : "circle";
    
    // Данные шаблона
    const templateData = {
        t: type,
        user: game.user.id,
        distance: radius,
        direction: 0,
        x: 0,
        y: 0,
        fillColor: game.user.color,
        flags: { zsystem: { itemId: item.id } }
    };

    const doc = new MeasuredTemplateDocument(templateData, { parent: canvas.scene });
    const template = new MeasuredTemplate(doc);
    
    // Рисуем превью
    await template.draw();
    canvas.templates.preview.addChild(template);
    canvas.templates.activate();

    return new Promise((resolve) => {
        const handlers = {};
        
        handlers.move = (event) => {
            const pos = event.data.getLocalPosition(canvas.templates);
            template.document.x = pos.x;
            template.document.y = pos.y;
            template.refresh();
        };
        
        handlers.confirm = async (event) => {
             canvas.stage.off("mousemove", handlers.move);
             canvas.stage.off("mousedown", handlers.confirm);
             canvas.stage.off("rightdown", handlers.cancel);
             
             // Ищем цели
             const targets = [];
             const { x, y, shape } = template;
             
             canvas.tokens.placeables.forEach(token => {
                 if (!token.actor) return;
                 const center = token.center;
                 if (shape.contains(center.x - x, center.y - y)) {
                     targets.push(token);
                 }
             });
             
             // Создаем РЕАЛЬНЫЙ шаблон (он останется на сцене)
             await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [template.document.toObject()]);
             
             // Удаляем превью
             canvas.templates.preview.removeChild(template);
             
             resolve(targets);
        };
        
        handlers.cancel = (event) => {
            canvas.stage.off("mousemove", handlers.move);
            canvas.stage.off("mousedown", handlers.confirm);
            canvas.stage.off("rightdown", handlers.cancel);
            
            canvas.templates.preview.removeChild(template);
            resolve(null);
        };

        canvas.stage.on("mousemove", handlers.move);
        canvas.stage.on("mousedown", handlers.confirm);
        canvas.stage.on("rightdown", handlers.cancel);
    });
}

/**
 * Таблица Паники
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