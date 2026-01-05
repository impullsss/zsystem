import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";

let aimingHandler = null;

// --- КЛАСС МЕНЕДЖЕРА ПРИЦЕЛИВАНИЯ ---
class AimingManager {
    constructor(actor, item, attack, modifier, dialogApp) {
        this.actor = actor;
        this.item = item;
        this.attack = attack;
        this.modifier = modifier;
        this.dialogApp = dialogApp;
        this.sourceToken = actor.getActiveTokens()[0];
        
        // UI элементы
        this.hud = null;
        this.graphics = new PIXI.Graphics(); // Слой для рисования линии

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onRightClick = this._onRightClick.bind(this);
        
        this.activate();
    }

    activate() {
        if (!this.sourceToken) return ui.notifications.error("Токен не найден!");
        
        // 1. Добавляем системный класс на BODY (понадобится для CSS)
        document.body.classList.add('zsystem-aiming-focus');

        // 2. Создаем HUD
        this.hud = $(`<div id="z-aiming-hud"></div>`);
        $('body').append(this.hud);

        // 3. Добавляем графику
        canvas.interface.addChild(this.graphics);

        // 4. Скрываем все окна БЕЗОПАСНО
        // Нам нужно отключить pointer-events ПРЯМО СЕЙЧАС, а не после анимации
        const allWindows = $('.window-app');
        allWindows.css({
            'pointer-events': 'none', // Отключаем клики сквозь окна
            'user-select': 'none'
        }).animate({ opacity: 0 }, 250);

        // 5. Включаем слушатели
        canvas.stage.on('mousemove', this._onMouseMove);
        canvas.stage.on('mousedown', this._onClick);
        canvas.stage.on('rightdown', this._onRightClick);
        
        ui.notifications.info("РЕЖИМ ОГНЯ: ЛКМ - Стрелять, ПКМ - Выход.");
        document.body.style.cursor = "crosshair";
    }

    deactivate() {
        // 1. Убираем системный класс
        document.body.classList.remove('zsystem-aiming-focus');

        // 2. Возвращаем видимость и КЛИКАБЕЛЬНОСТЬ окнам
        const allWindows = $('.window-app');
        allWindows.css({
            'pointer-events': 'all',
            'user-select': 'auto'
        }).animate({ opacity: 1 }, 200);

        // 3. Отключаем всё остальное
        canvas.stage.off('mousemove', this._onMouseMove);
        canvas.stage.off('mousedown', this._onClick);
        canvas.stage.off('rightdown', this._onRightClick);
        document.body.style.cursor = "default";
        
        if (this.hud) {
            this.hud.remove();
            this.hud = null;
        }

        this.graphics.clear();
        canvas.interface.removeChild(this.graphics);
        
        if (game.user.targets.size > 0) {
            game.user.targets.forEach(t => t.setTarget(false, {releaseOthers: false}));
        }
    }

    _onMouseMove(event) {
        const pos = event.data.getLocalPosition(canvas.tokens);
        
        // Ищем токен под курсором
        const target = canvas.tokens.placeables.find(t => {
            return t.visible && 
                   t.id !== this.sourceToken.id &&
                   t.hitArea.contains(pos.x - t.x, pos.y - t.y);
        });

        // Позиция HUD
        const clientX = event.data.originalEvent.clientX;
        const clientY = event.data.originalEvent.clientY;
        
        if (this.hud) {
            this.hud.css({ top: clientY + 15, left: clientX + 15 });
        }

        // Очищаем старую линию
        this.graphics.clear();

        if (target) {
            this._updateHudContent(target);
            this.hud.show();
        } else {
            this.hud.hide();
        }
    }

    async _onClick(event) {
        if (event.data.button !== 0) return; // Только ЛКМ

        const pos = event.data.getLocalPosition(canvas.tokens);
        const target = canvas.tokens.placeables.find(t => {
            return t.visible && 
                   t.id !== this.sourceToken.id &&
                   t.hitArea.contains(pos.x - t.x, pos.y - t.y);
        });

        if (target) {
            const curAP = this.actor.system.resources.ap.value;
            const cost = Number(this.attack.ap) || 0;
            
            if (curAP < cost) {
                ui.notifications.warn("Недостаточно AP!");
                return;
            }

            target.setTarget(true, {releaseOthers: true, groupSelection: false});
            
            await _executeAttack(this.actor, this.item, this.attack, "torso", this.modifier);
            
            this._updateHudContent(target);
        }
    }

    _onRightClick() {
        this.deactivate();
        aimingHandler = null;
        ui.notifications.info("Стрельба завершена.");
    }

    _updateHudContent(target) {
        if (!this.hud) return;

        // Расчет шанса
        const chanceData = _calculateHitChance(this.actor, this.item, this.attack, this.sourceToken, target, this.modifier);
        const hitChance = chanceData.total;
        
        // Цвета
        let colorHex = 0xff5252; // Числовой для PIXI (Красный)
        let colorCSS = "#ff5252"; // Строковый для CSS

        if (hitChance >= 80) { colorHex = 0x69f0ae; colorCSS = "#69f0ae"; } // Зеленый
        else if (hitChance >= 50) { colorHex = 0xffab91; colorCSS = "#ffab91"; } // Оранжевый

        // === РИСОВАНИЕ ЛИНИИ (PIXI) ===
        // Рисуем линию от центра к центру
        this.graphics.lineStyle(4, colorHex, 0.6); // Толщина 4, прозрачность 0.6
        this.graphics.moveTo(this.sourceToken.center.x, this.sourceToken.center.y);
        this.graphics.lineTo(target.center.x, target.center.y);
        
        // Кружок на цели
        this.graphics.beginFill(colorHex, 0.2);
        this.graphics.drawCircle(target.center.x, target.center.y, target.w / 2);
        this.graphics.endFill();
        // ==============================

        // HTML HUD (Без изменений)
        let detailsHtml = "";
        if (chanceData.details.coverPen < 0) detailsHtml += `<div class="aim-detail"><span>Укрытие:</span> <span>${chanceData.details.coverPen}%</span></div>`;
        if (chanceData.details.rangePen < 0) detailsHtml += `<div class="aim-detail"><span>Дальность:</span> <span>${chanceData.details.rangePen}%</span></div>`;
        if (chanceData.details.intervPen < 0) detailsHtml += `<div class="aim-detail"><span>Помеха:</span> <span>${chanceData.details.intervPen}%</span></div>`;
        if (chanceData.details.evasionMod < 0) detailsHtml += `<div class="aim-detail"><span>Уклонение:</span> <span>${chanceData.details.evasionMod}%</span></div>`;

        let warnHtml = "";
        if (chanceData.details.coverPen <= -1000) warnHtml = `<div class="aim-warn">ЦЕЛЬ НЕ ВИДНА</div>`;
        
        const html = `
            <div class="chance-header" style="color:${colorCSS}">ШАНС: ${hitChance}%</div>
            <div style="font-size:0.9em; font-weight:bold; margin-bottom:5px;">${target.name}</div>
            ${detailsHtml}
            ${warnHtml}
            <div style="margin-top:5px; border-top:1px solid #555; padding-top:2px; font-size:0.8em; color:#888;">
                AP: ${this.attack.ap} | ЛКМ: Огонь
            </div>
        `;

        this.hud.html(html);
        this.hud.css("border-left-color", colorCSS);
    }
}

// === ВЫНЕСЕННАЯ ФУНКЦИЯ РАСЧЕТА ===
function _calculateHitChance(actor, item, attack, sourceToken, targetToken, modifier) {
    let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : ((item.system.isThrowing && item.system.weaponType !== 'melee') ? 'athletics' : 'melee');
    const skillVal = actor.system.skills[skillType]?.value || 0;
    const atkMod = Number(attack.mod) || 0;
    
    // Укрытие
    const coverData = _calculateCover(sourceToken, targetToken);
    const coverPen = coverData.penalty;
    
    // Дальность
    const dist = canvas.grid.measureDistance(sourceToken, targetToken);
    const rangeData = _calculateRangePenalty(item, dist);
    const rangePen = rangeData.penalty;
    
    // Помехи
    let intervPen = 0;
    if (item.system.weaponType === 'ranged') {
        const obs = _checkInterveningTokens(sourceToken, targetToken);
        intervPen = obs.length * -20;
    }
    
    // Уклонение
    let evasionMod = 0;
    if (!targetToken.actor?.hasStatusEffect("prone")) {
        evasionMod = -((targetToken.actor?.system.secondary?.evasion?.value || 0) * 3);
    }

    const total = Math.max(0, skillVal + atkMod + coverPen + rangePen + intervPen + evasionMod + modifier);
    return { total, details: { coverPen, rangePen, intervPen } };
}

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

export async function performAttack(actor, itemId) {
    const item = actor.items.get(itemId);
    if (!item) return;
    if (actor.hasStatusEffect("panic")) return ui.notifications.error("Паника!");

    // --- ПРОВЕРКА ОЧЕРЕДИ ХОДА ---
    const isRestrictEnabled = game.settings.get("zsystem", "restrictAttack");
  
  if (isRestrictEnabled && game.combat && game.combat.active) {
        const combatant = game.combat.combatant;
        const token = actor.getActiveTokens()[0];
        if (token && combatant && combatant.tokenId !== token.id) {
            if (!game.user.isGM) {
                return ui.notifications.warn(`Сейчас ход персонажа: ${combatant.name}. Подождите своей очереди.`);
            }
        }
    }

    let attackOptions = item.system.attacks || {};
    if (Object.keys(attackOptions).length === 0) {
        attackOptions["default"] = { name: "Атака", ap: item.system.apCost, dmg: item.system.damage, noise: item.system.noise };
    }
    
    const lastKey = item.getFlag("zsystem", "lastAttackKey") || Object.keys(attackOptions)[0];

    let buttonsHTML = "";
    for (let [key, atk] of Object.entries(attackOptions)) {
        const totalNoise = (Number(item.system.noise)||0) + (Number(atk.noise)||0);
        const isSelected = (key === lastKey) ? "selected" : "";
        buttonsHTML += `
            <button class="z-attack-btn ${isSelected}" data-key="${key}">
                <div class="atk-name">${atk.name}</div>
                <div class="atk-info">AP: ${atk.ap} | Noise: ${totalNoise}</div>
            </button>`;
    }
    
    const isRanged = item.system.weaponType === 'ranged';
    const content = `
    <form class="z-attack-dialog">
        <div class="grid grid-2col" style="margin-bottom:10px;">
            <div class="form-group"><label>Модификатор</label><input type="number" id="atk-modifier" value="0"/></div>
            <div class="form-group"><label>Режим</label><select id="atk-rollMode"><option value="roll">Публичный</option><option value="gmroll">ГМ</option></select></div>
        </div>
        <div class="form-group"><label>Цель:</label><select id="aim-location"><option value="torso">Торс</option><option value="head">Голова (-40)</option><option value="lLeg">Ноги (-20)</option></select></div>
        ${isRanged ? `<div class="form-group" style="background:#263238; padding:5px; border-radius:3px;"><label style="color:#eceff1;">Ручное прицеливание</label><input type="checkbox" id="manual-aim" checked/></div>` : ""}
        <hr>
        <div class="attack-buttons">${buttonsHTML}</div>
    </form>`;

    new Dialog({
        title: `Атака: ${item.name}`, 
        content: content,
        buttons: {},
        render: (html) => {
            html.find('.z-attack-btn').click(async (ev) => {
                ev.preventDefault();
                const key = ev.currentTarget.dataset.key;
                const atk = attackOptions[key];
                await item.setFlag("zsystem", "lastAttackKey", key);

                const loc = html.find('#aim-location').val();
                const mod = Number(html.find('#atk-modifier').val()) || 0;
                const manualAim = html.find('#manual-aim').is(':checked');

                if (manualAim && isRanged) {
                    if (aimingHandler) aimingHandler.deactivate();
                    aimingHandler = new AimingManager(actor, item, atk, mod, null);
                } else {
                    await _executeAttack(actor, item, atk, loc, mod);
                }
            });
        }
    }).render(true);
}

async function _executeAttack(actor, item, attack, location = "torso", modifier = 0, rollMode = "roll") {
  const apCost = Number(attack.ap) || 0;
  const curAP = Number(actor.system.resources.ap.value);
  if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP (нужно ${apCost})`);

  // --- ВЫЧИСЛЕНИЕ ЦЕЛЕЙ ---
  let targets = Array.from(game.user.targets);
  let targetToken = targets.length > 0 ? targets[0] : null;
  let sourceToken = actor.getActiveTokens()[0]; 

  let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : ((item.system.isThrowing && item.system.weaponType !== 'melee') ? 'athletics' : 'melee');
  const skillVal = actor.system.skills[skillType]?.value || 0;
  const atkMod = Number(attack.mod) || 0;
  const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);
  
  let coverPenalty = 0, coverLabel = "", rangePenalty = 0, rangeLabel = "", interventionPenalty = 0, interventionLabel = "", evasionMod = 0, evasionMsg = "", targetName = "Нет цели";

  if (targetToken && sourceToken) {
      targetName = targetToken.name;
      const dist = canvas.grid.measureDistance(sourceToken, targetToken);
      const coverData = _calculateCover(sourceToken, targetToken);
      coverPenalty = coverData.penalty;
      coverLabel = coverData.label ? ` [${coverData.label} ${coverData.penalty}]` : "";
      if (coverPenalty <= -1000) return ui.notifications.error("Цель не видна!");

      const rangeData = _calculateRangePenalty(item, dist);
      rangePenalty = rangeData.penalty;
      rangeLabel = rangeData.label ? ` [${rangeData.label} ${rangeData.penalty}]` : "";

      if (item.system.weaponType === 'ranged') {
          const obstacles = _checkInterveningTokens(sourceToken, targetToken);
          interventionPenalty = obstacles.length * -20;
          if (obstacles.length > 0) interventionLabel = ` [Помеха x${obstacles.length}: ${interventionPenalty}]`;
      }

      if (!targetToken.actor?.hasStatusEffect("prone")) {
          const ev = targetToken.actor?.system.secondary?.evasion?.value || 0;
          evasionMod = -(ev * 3);
          if (evasionMod !== 0) evasionMsg = ` [Eva ${evasionMod}%]`;
      }
  }

  // --- РАСХОД ---
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
  const totalChance = Math.max(0, skillVal + atkMod + aimMod + evasionMod + coverPenalty + rangePenalty + interventionPenalty + modifier);
  const roll = await new Roll("1d100").evaluate();

  const isStealth = actor.hasStatusEffect("stealth");
  const critThreshold = 5 + (Number(item.system.critChance) || 0) + (isStealth ? 5 : 0);

  let resultType = "fail";
  if (roll.total <= critThreshold) resultType = "crit-success";
  else if (roll.total <= totalChance) resultType = "success";
  else if (roll.total >= 96) resultType = "crit-fail";

  const isHit = resultType.includes("success");
  const isCrit = resultType === "crit-success";

  if (targetToken && sourceToken) _drawTracer(sourceToken, targetToken, isHit);

  // --- УРОН ---
  let dmgAmount = 0, dmgDisplay = "", rawDmgFormula = attack.dmg || "0";
  const damageDataForGM = []; 

  if (isHit || isGrenade) {
      let formula = attack.dmg || "0";
      if (isGrenade && !isHit) formula = `ceil((${formula}) / 2)`; 
      if (isCrit) formula = `ceil((${formula}) * ${(Number(item.system.critMult) || 1.5)})`;
      
      if (skillType === 'melee' && !isThrowingAction) {
          const s = actor.system.attributes.str.value;
          const req = item.system.strReq || 1;
          formula += s >= req ? ` + ${s - req}` : ` * 0.5`;
      }
      
      const rDmg = await new Roll(formula, actor.getRollData()).evaluate();
      dmgAmount = Math.max(1, rDmg.total);
      dmgDisplay = `<div class="z-damage-box"><div class="dmg-label">УРОН ${isCrit?"(КРИТ!)":""}</div><div class="dmg-val">${dmgAmount}</div></div>`;

      if (targets.length > 0) {
          targets.forEach(t => damageDataForGM.push({ uuid: t.document.uuid, amount: dmgAmount, type: item.system.damageType||"blunt", limb: location }));
      }
  }

  // --- ШУМ (ИСПРАВЛЕНО) ---
  let baseNoise = (Number(item.system.noise)||0) + (Number(attack.noise)||0);
  if (isStealth && baseNoise > 0) baseNoise = Math.ceil(baseNoise / 2);
  const finalNoise = Math.max(0, baseNoise); // Гарантируем, что не минус
  
  const noiseHtml = finalNoise > 0 ? `<div class="z-noise-alert">🔊 Шум: +${finalNoise} ${isStealth ? '(Стелс)' : ''}</div>` : "";

  const modText = modifier !== 0 ? ` (${modifier > 0 ? "+" : ""}${modifier})` : "";
  const headerInfo = item.name + evasionMsg + coverLabel + rangeLabel + interventionLabel + modText;
  const cardHtml = _getSlotMachineHTML(headerInfo, totalChance, roll.total, resultType);
  
  // Сообщение
  await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `${cardHtml}${dmgDisplay}${noiseHtml}<div class="z-ap-spent">-${apCost} AP</div>`,
      flags: { zsystem: { noiseAdd: finalNoise, damageData: damageDataForGM } }
  }, { rollMode: rollMode });

  if (isThrowingAction) {
      const qty = Number(item.system.quantity) || 1;
      if (qty > 1) await item.update({"system.quantity": qty - 1}); else await item.delete();
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
 * Проверяет, есть ли токены на линии огня
 * @returns {Array} Список токенов, перекрывающих обзор
 */
function _checkInterveningTokens(sourceToken, targetToken) {
    if (!sourceToken || !targetToken) return [];

    const ray = new Ray(sourceToken.center, targetToken.center);
    const obstacles = [];

    // Проходимся по всем токенам на сцене
    for (let t of canvas.tokens.placeables) {
        if (t.id === sourceToken.id || t.id === targetToken.id) continue; // Игнорируем себя и цель
        if (!t.actor) continue; // Игнорируем декор
        if (t.document.hidden) continue; // Игнорируем невидимых
        
        // Зомби не мешают друг другу (опционально, но логично для толпы)
        // if (sourceToken.actor.type === 'zombie' && t.actor.type === 'zombie') continue; 

        // Простая математика: расстояние от центра токена до отрезка (линии огня)
        // Если расстояние меньше радиуса токена (ширина/2) -> он на линии
        const dist = _distToSegment(t.center, sourceToken.center, targetToken.center);
        
        // Допустим, токен блокирует, если линия проходит ближе чем 0.3 клетки от его центра
        // (canvas.grid.size * 0.3). Это дает возможность стрелять "впритирку".
        const threshold = (t.w / 2) * 0.8; 
        
        if (dist < threshold) {
            obstacles.push(t);
        }
    }
    return obstacles;
}

// Математика: Расстояние от точки P до отрезка AB
function _distToSegment(p, a, b) {
    const l2 = (a.x - b.x)**2 + (a.y - b.y)**2;
    if (l2 === 0) return Math.sqrt((p.x - a.x)**2 + (p.y - a.y)**2);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((p.x - (a.x + t * (b.x - a.x)))**2 + (p.y - (a.y + t * (b.y - a.y)))**2);
}

// Визуализация Трассера
async function _drawTracer(source, target, isHit) {
    if (!source || !target) return;

    const s = source.center;
    const t = target.center;

    // Вычисляем Bounding Box
    const xMin = Math.min(s.x, t.x);
    const yMin = Math.min(s.y, t.y);
    const width = Math.abs(s.x - t.x);
    const height = Math.abs(s.y - t.y);

    const p0 = [s.x - xMin, s.y - yMin];
    const p1 = [t.x - xMin, t.y - yMin];

    const drawingData = {
        t: "p", 
        author: game.user.id,
        x: xMin,
        y: yMin,
        width: width,
        height: height,
        strokeWidth: 4,
        strokeColor: isHit ? "#69f0ae" : "#ff5252",
        strokeAlpha: 0.7,
        fillAlpha: 0,
        shape: {
            type: "p",
            points: [p0[0], p0[1], p1[0], p1[1]]
        }
    };

    // ЕСЛИ ГМ -> РИСУЕМ СРАЗУ
    if (game.user.isGM) {
        const doc = (await canvas.scene.createEmbeddedDocuments("Drawing", [drawingData]))[0];
        if (doc) {
            setTimeout(async () => { 
                if (canvas.scene.drawings.has(doc.id)) await doc.delete(); 
            }, 1000);
        }
    } 
    // ЕСЛИ ИГРОК -> ОТПРАВЛЯЕМ ЗАПРОС ГМу
    else {
        ChatMessage.create({
            content: "", // Пустое тело
            flags: {
                zsystem: {
                    visuals: {
                        type: "tracer",
                        data: drawingData
                    }
                }
            },
            whisper: ChatMessage.getWhisperRecipients("GM"),
            blind: true // Игрок даже не увидит, что отправил это
        });
    }
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

