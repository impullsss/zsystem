import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";
import { PerkLogic } from "./perk-logic.js";

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
        this.graphics = new PIXI.Graphics(); 

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onRightClick = this._onRightClick.bind(this);
        
        this.activate();
    }

    activate() {
        if (!this.sourceToken) return ui.notifications.error("Токен не найден!");
        
        document.body.classList.add('zsystem-aiming-focus');

        this.hud = $(`<div id="z-aiming-hud"></div>`);
        $('body').append(this.hud);

        canvas.interface.addChild(this.graphics);

        const allWindows = $('.window-app');
        allWindows.css({
            'pointer-events': 'none', 
            'user-select': 'none'
        }).animate({ opacity: 0 }, 250);

        canvas.stage.on('mousemove', this._onMouseMove);
        canvas.stage.on('mousedown', this._onClick);
        canvas.stage.on('rightdown', this._onRightClick);
        
        ui.notifications.info("РЕЖИМ ПРИЦЕЛИВАНИЯ: ЛКМ - Действие, ПКМ - Выход.");
        document.body.style.cursor = "crosshair";
    }

    deactivate() {
        document.body.classList.remove('zsystem-aiming-focus');

        const allWindows = $('.window-app');
        allWindows.css({
            'pointer-events': 'all',
            'user-select': 'auto'
        }).animate({ opacity: 1 }, 200);

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
        
        const target = canvas.tokens.placeables.find(t => {
            return t.visible && 
                   t.id !== this.sourceToken.id &&
                   t.hitArea.contains(pos.x - t.x, pos.y - t.y);
        });

        const clientX = event.data.originalEvent.clientX;
        const clientY = event.data.originalEvent.clientY;
        
        if (this.hud) {
            this.hud.css({ top: clientY + 15, left: clientX + 15 });
        }

        this.graphics.clear();

        if (target) {
            this._updateHudContent(target);
            this.hud.show();
        } else {
            this.hud.hide();
        }
    }

    async _onClick(event) {
        if (event.data.button !== 0) return; 

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
            
            // Получаем выбранную локацию из диалога (если он виден)
            const location = $('#aim-location').val() || "torso";
            
            await _executeAttack(this.actor, this.item, this.attack, location, this.modifier);
            
            this._updateHudContent(target);
        }
    }

    _onRightClick() {
        this.deactivate();
        aimingHandler = null;
        ui.notifications.info("Действие отменено.");
    }

    _updateHudContent(target) {
        if (!this.hud) return;

        // Расчет шанса
        const chanceData = _calculateHitChance(this.actor, this.item, this.attack, this.sourceToken, target, this.modifier);
        const hitChance = chanceData.total;
        
        let colorHex = 0xff5252; 
        let colorCSS = "#ff5252"; 

        if (hitChance >= 80) { colorHex = 0x69f0ae; colorCSS = "#69f0ae"; } 
        else if (hitChance >= 50) { colorHex = 0xffab91; colorCSS = "#ffab91"; } 

        // Рисование линии (PIXI)
        this.graphics.lineStyle(4, colorHex, 0.6); 
        this.graphics.moveTo(this.sourceToken.center.x, this.sourceToken.center.y);
        this.graphics.lineTo(target.center.x, target.center.y);
        
        this.graphics.beginFill(colorHex, 0.2);
        this.graphics.drawCircle(target.center.x, target.center.y, target.w / 2);
        this.graphics.endFill();

        // Текст HUD
        let detailsHtml = "";
        if (chanceData.details.coverPen < 0) detailsHtml += `<div class="aim-detail"><span>Укрытие:</span> <span>${chanceData.details.coverPen}%</span></div>`;
        if (chanceData.details.rangePen < 0) detailsHtml += `<div class="aim-detail"><span>Дальность:</span> <span>${chanceData.details.rangePen}%</span></div>`;
        if (chanceData.details.intervPen < 0) detailsHtml += `<div class="aim-detail"><span>Помеха:</span> <span>${chanceData.details.intervPen}%</span></div>`;
        if (chanceData.details.evasionMod < 0) detailsHtml += `<div class="aim-detail"><span>Уклонение:</span> <span>${chanceData.details.evasionMod}%</span></div>`;

        let warnHtml = "";
        if (chanceData.details.coverPen <= -1000) warnHtml = `<div class="aim-warn">ЦЕЛЬ ЗА ПРЕГРАДОЙ</div>`;
        
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
    
    const location = $('#aim-location').val() || "torso";
    const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);

    const dist = canvas.grid.measureDistance(sourceToken, targetToken);
    // Берем дальность из оружия или дефолт 1.5м
    const weaponReach = Number(item.system.range) || 1.5;

    // Укрытие
    let coverPen = 0;
    // ФИКС: В ближнем бою игнорируем укрытие, если мы в пределах досягаемости оружия
    const isMeleeHit = (skillType === 'melee' && dist <= weaponReach);
    
    if (!isMeleeHit) {
        const coverData = _calculateCover(sourceToken, targetToken);
        coverPen = coverData.penalty;
    }
    
    const rangeData = _calculateRangePenalty(item, dist);
    const rangePen = rangeData.penalty;
    
    // Помехи (Живой щит)
    let intervPen = 0;
    // ФИКС: Помехи считаются ТОЛЬКО для стрельбы
    if (item.system.weaponType === 'ranged') {
        const obs = _checkInterveningTokens(sourceToken, targetToken);
        intervPen = obs.length * -20;
    }
    
    let evasionMod = 0;
    if (!targetToken.actor?.hasStatusEffect("prone")) {
        evasionMod = -((targetToken.actor?.system.secondary?.evasion?.value || 0));
    }

    const total = Math.max(0, skillVal + atkMod + aimMod + coverPen + rangePen + intervPen + evasionMod + modifier);
    return { total, details: { coverPen, rangePen, intervPen, evasionMod } };
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
                <option value="gmroll">Приватный (ГМ)</option>
                <option value="blindroll">Слепой (ГМ)</option>
                <option value="selfroll">Только себе</option>
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
        const roll = await new Roll("1d100").evaluate();
        
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

// === ВЫПОЛНЕНИЕ АТАКИ ===
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
            if (!game.user.isGM) return ui.notifications.warn(`Сейчас ход: ${combatant.name}.`);
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
        buttonsHTML += `<button class="z-attack-btn ${isSelected}" data-key="${key}">
                        <div class="atk-name">${atk.name}</div>
                        <div class="atk-info">AP: ${atk.ap} | Noise: ${totalNoise}</div>
                    </button>`;
    }
    
    const content = `
    <form class="z-attack-dialog">
        <div class="grid grid-2col" style="margin-bottom:10px;">
            <div class="form-group"><label>Модификатор</label><input type="number" id="atk-modifier" value="0"/></div>
            <div class="form-group"><label>Режим</label><select id="atk-rollMode"><option value="roll">Публичный</option><option value="gmroll">ГМ</option></select></div>
        </div>
        <div class="form-group"><label>Цель:</label><select id="aim-location"><option value="torso">Торс</option><option value="head">Голова (-40)</option><option value="lLeg">Ноги (-20)</option></select></div>
        
        <!-- Галка теперь доступна всегда (для Melee тоже) -->
        <div class="form-group" style="background:#263238; padding:5px; border-radius:3px;">
            <label style="color:#eceff1;">Ручное прицеливание</label>
            <input type="checkbox" id="manual-aim" checked/>
        </div>
        
        <hr>
        <div class="attack-buttons">${buttonsHTML}</div>
    </form>`;

    const d = new Dialog({
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

                if (manualAim) {
                    if (aimingHandler) aimingHandler.deactivate();
                    aimingHandler = new AimingManager(actor, item, atk, mod, d);
                } else {
                    await _executeAttack(actor, item, atk, loc, mod);
                }
            });
        }
    });
    d.render(true);
}

// === ИСПОЛНЕНИЕ АТАКИ ===
async function _executeAttack(actor, item, attack, location = "torso", modifier = 0, rollMode = "roll") {
    console.log("ZSystem | [CHECKPOINT 1] Вход в атаку:", item.name);

    // 1. ОПРЕДЕЛЯЕМ ТОКЕНЫ
    const sourceToken = actor.getActiveTokens()[0]; 
    const targets = Array.from(game.user.targets);
    const targetToken = targets.length > 0 ? targets[0] : null;

    if (!sourceToken) return ui.notifications.error("Токен атакующего не найден!");

    // 2. ПРОВЕРКА РЕСУРСОВ
    const apCost = Number(attack.ap) || 0;
    const curAP = Number(actor.system.resources.ap.value) || 0;
    if (curAP < apCost) return ui.notifications.warn(`Недостаточно AP`);

    console.log("ZSystem | [CHECKPOINT 2] AP проверено. Списание патронов...");

    // 3. РАСХОД ПАТРОНОВ (Более безопасный расчет)
    const isThrowingAction = (attack.mode === 'throw' || item.system.isThrowing === true);
    const spentBullets = parseInt(attack.bullets) || (item.system.ammoType ? 1 : 0);
    
    if (!isThrowingAction && item.system.ammoType) {
        const curMag = parseInt(item.system.mag.value) || 0;
        if (curMag < spentBullets) {
            console.log("ZSystem | Ошибка: Мало патронов");
            return ui.notifications.warn(`Недостаточно патронов! Нужно: ${spentBullets}`);
        }
        await item.update({ "system.mag.value": Math.max(0, curMag - spentBullets) });
    }

    // Списываем AP
    await actor.update({"system.resources.ap.value": Math.max(0, curAP - apCost)});
    
    console.log("ZSystem | [CHECKPOINT 3] Ресурсы списаны. Запуск анимации...");

    // 4. ЗАПУСК АНИМАЦИИ (ПРИНУДИТЕЛЬНО)
    try {
        const aaModule = game.modules.get("automated-animations");
        // Пробуем разные варианты API для V13
        const aaApi = aaModule?.api || window.AutoAnimations?.api || window.AutomatedAnimations;
        
        if (aaApi && typeof aaApi.playAnimation === "function") {
            console.log("ZSystem | [ANIMATION] Вызов API A-A...");
            aaApi.playAnimation(sourceToken, item, { targets: targets });
        } else {
            console.warn("ZSystem | [ANIMATION] API Automated Animations не найдено. Пробую Hook...");
            Hooks.callAll("AutomatedAnimations-Workflow", sourceToken, item, { targets: targets });
        }
    } catch (err) {
        console.error("ZSystem | Ошибка в блоке анимации:", err);
    }

    console.log("ZSystem | [CHECKPOINT 4] Расчет попадания...");

    // 5. РАСЧЕТ ПОПАДАНИЯ (Smart Targeting)
    let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : (isThrowingAction ? 'athletics' : 'melee');
    const skillVal = actor.system.skills[skillType]?.value || 0;
    const atkMod = Number(attack.mod) || 0;
    const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);
    
    let coverPenalty = 0, coverLabel = "", rangePenalty = 0, rangeLabel = "", interventionPenalty = 0, evasionMod = 0, targetName = "Нет цели";

    if (targetToken) {
        targetName = targetToken.name;
        const dist = canvas.grid.measureDistance(sourceToken, targetToken);
        const weaponReach = Number(item.system.range) || 1.5;

        if (skillType === 'melee' && dist > weaponReach) return ui.notifications.warn(`Слишком далеко!`);
        
        if (skillType === 'ranged') {
            const coverData = _calculateCover(sourceToken, targetToken);
            coverPenalty = coverData.penalty;
            coverLabel = coverData.label ? ` [${coverData.label} ${coverData.penalty}]` : "";
            if (coverPenalty <= -1000) return ui.notifications.error("Цель за преградой!");

            const rangeData = _calculateRangePenalty(item, dist);
            rangePenalty = rangeData.penalty;
            rangeLabel = rangeData.label ? ` [${rangeData.label} ${rangeData.penalty}]` : "";

            const obstacles = _checkInterveningTokens(sourceToken, targetToken);
            interventionPenalty = obstacles.length * -20;
        }

        if (!targetToken.actor?.hasStatusEffect("prone")) {
            evasionMod = -(targetToken.actor?.system.secondary?.evasion?.value || 0);
        }
    }

    // 6. БРОСОК
    const totalChance = Math.max(0, skillVal + atkMod + aimMod + evasionMod + coverPenalty + rangePenalty + interventionPenalty + modifier);
    const roll = await new Roll("1d100").evaluate();
    const resultType = _calcResult(roll.total, totalChance);
    const isHit = resultType.includes("success");
    
    if (targetToken) _drawTracer(sourceToken, targetToken, isHit);

    // 7. УРОН
    let dmgAmount = 0, dmgDisplay = "";
    const damageDataForGM = []; 

    if (isHit) {
        let formula = attack.dmg || "0";
        if (resultType === "crit-success") formula = `ceil((${formula}) * 1.5)`;
        
        let rDmg = await new Roll(formula, actor.getRollData()).evaluate();
        let finalDmg = rDmg.total;

        if (targetToken?.actor && typeof PerkLogic !== "undefined") {
            finalDmg = PerkLogic.onApplyDamage(actor, targetToken.actor, finalDmg, item);
        }
        
        dmgAmount = Math.max(1, Math.floor(finalDmg));
        dmgDisplay = `<div class="z-damage-box"><div class="dmg-label">УРОН</div><div class="dmg-val">${dmgAmount}</div></div>`;

        if (targetToken) {
            damageDataForGM.push({ uuid: targetToken.document.uuid, amount: dmgAmount, type: item.system.damageType||"blunt", limb: location });
        }
    }

    // 8. ЧАТ
    const cardHtml = _getSlotMachineHTML(targetName, totalChance, roll.total, resultType);
    let ammoInfo = (spentBullets > 0 && item.system.ammoType) ? `<div style="font-size:0.8em; color:#777;">Потрачено патронов: ${spentBullets}</div>` : "";
    
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `${cardHtml}${dmgDisplay}${ammoInfo}<div class="z-ap-spent">-${apCost} AP</div>`,
        flags: { zsystem: { noiseAdd: (Number(item.system.noise)||0), damageData: damageDataForGM } }
    }, { rollMode: rollMode });

    if (isThrowingAction) {
        const qty = Number(item.system.quantity) || 1;
        if (qty > 1) await item.update({"system.quantity": qty - 1}); else await item.delete();
    }
    
    console.log("ZSystem | [FINISH] Атака завершена успешно.");
}

/**
 * РАСЧЕТ УКРЫТИЯ (V13 COMPLIANT)
 * Учитывает окна (стены Sight: None)
 */
function _calculateCover(sourceToken, targetToken) {
    if (!sourceToken || !targetToken) return { penalty: 0, label: "" };
    const sourceCenter = sourceToken.center;
    const t = targetToken;
    const corners = [
        { x: t.x + 2, y: t.y + 2 },
        { x: t.x + t.w - 2, y: t.y + 2 },
        { x: t.x + t.w - 2, y: t.y + t.h - 2 },
        { x: t.x + 2, y: t.y + t.h - 2 }
    ];

    let blockedCount = 0;
    let windowCount = 0;

    for (let point of corners) {
        const ray = new Ray(sourceCenter, point);
        
        // В V13 используем полигональный бэкенд для проверки блокировки
        const blocksSight = CONFIG.Canvas.polygonBackends.sight.testCollision(ray.A, ray.B, {type: "sight", mode: "any"});
        const blocksMove = CONFIG.Canvas.polygonBackends.move.testCollision(ray.A, ray.B, {type: "move", mode: "any"});

        if (blocksSight) {
            blockedCount++; // Глухая стена
        } else if (blocksMove) {
            windowCount++; // Окно (движение закрыто, зрение — нет)
        }
    }

    if (blockedCount === 0) {
        return windowCount > 0 ? { penalty: -20, label: "Через окно" } : { penalty: 0, label: "" };
    }
    
    if (blockedCount <= 2) return { penalty: -15, label: "Легкое укр." };
    if (blockedCount === 3) return { penalty: -30, label: "Тяж. укр." };
    return { penalty: -1000, label: "Не видно" }; 
}

export async function rollPanicTable(actor) {
    const roll = await new Roll("1d6").evaluate(); 
    const result = roll.total;
    let behavior = "";
    if (!actor.hasStatusEffect("panic")) await actor.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.panic]);
    
    if (result <= 2) { 
        behavior = "Сжаться в страхе (Prone, 0 AP)"; 
        await actor.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.prone]); 
        await actor.update({"system.resources.ap.value": 0}); 
    } 
    else if (result <= 4) { behavior = "Бегство (Потратьте AP на отход)"; } 
    else { behavior = "Берсерк (Атакуйте ближайшего врага)"; }

    const content = `<div class="z-chat-card" style="border-color:orange;"><div class="z-card-header" style="color:orange;">ПАНИКА!</div><div style="font-size:2em; font-weight:bold;">${result}</div><div>${behavior}</div></div>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor}), content });
}

function _checkInterveningTokens(sourceToken, targetToken) {
    if (!sourceToken || !targetToken) return [];
    const ray = new Ray(sourceToken.center, targetToken.center);
    const obstacles = [];

    for (let t of canvas.tokens.placeables) {
        // Пропускаем себя, цель, скрытых и токены без акторов
        if (t.id === sourceToken.id || t.id === targetToken.id || !t.actor || t.document.hidden) continue;
        
        // --- ФИКС: Безопасная проверка HP ---
        const hp = t.actor.system.resources?.hp;
        if (!hp || hp.value <= 0) continue; // Пропускаем трупы и объекты без HP

        const dist = _distToSegment(t.center, sourceToken.center, targetToken.center);
        if (dist < (t.w / 2) * 0.8) obstacles.push(t);
    }
    return obstacles;
}

function _distToSegment(p, a, b) {
    const l2 = (a.x - b.x)**2 + (a.y - b.y)**2;
    if (l2 === 0) return Math.sqrt((p.x - a.x)**2 + (p.y - a.y)**2);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((p.x - (a.x + t * (b.x - a.x)))**2 + (p.y - (a.y + t * (b.y - a.y)))**2);
}

function _calculateRangePenalty(item, dist) {
    const range = Number(item.system.range) || 1;
    if (item.system.weaponType === 'melee') return { penalty: 0, label: "" };
    if (dist <= range) return { penalty: 0, label: "" };
    if (dist <= range * 2) return { penalty: -20, label: "Далеко" };
    return { penalty: -40, label: "Слишк. далеко" };
}

async function _drawTracer(source, target, isHit) {
    if (!source || !target) return;
    const s = source.center;
    const t = target.center;
    const xMin = Math.min(s.x, t.x), yMin = Math.min(s.y, t.y);
    const width = Math.abs(s.x - t.x), height = Math.abs(s.y - t.y);
    const drawingData = {
        t: "p", author: game.user.id, x: xMin, y: yMin, width, height,
        strokeWidth: 4, strokeColor: isHit ? "#69f0ae" : "#ff5252", strokeAlpha: 0.7,
        shape: { type: "p", points: [s.x - xMin, s.y - yMin, t.x - xMin, t.y - yMin] }
    };
    if (game.user.isGM) {
        const doc = (await canvas.scene.createEmbeddedDocuments("Drawing", [drawingData]))[0];
        setTimeout(() => { if (doc) doc.delete(); }, 1000);
    } else {
        ChatMessage.create({ 
            flags: { zsystem: { visuals: { type: "tracer", data: drawingData } } }, 
            whisper: ChatMessage.getWhisperRecipients("GM"), 
            blind: true 
        });
    }
}