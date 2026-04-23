import { NoiseManager } from "./noise.js"; 
import { GLOBAL_STATUSES } from "./constants.js";
import { PerkLogic } from "./perk-logic.js";

let aimingHandler = null;

// --- КЛАСС МЕНЕДЖЕРА ПРИЦЕЛИВАНИЯ (КОНУС) ---
class AimingManager {
    constructor(actor, item, attack, modifier, dialogApp, aimSteps = 0, weaponHand = "rArm") {
        this.actor = actor;
        this.item = item;
        this.attack = attack;
        this.modifier = modifier;
        this.dialogApp = dialogApp;
        this.aimSteps = aimSteps;
        this.weaponHand = weaponHand;
        this.sourceToken = actor.getActiveTokens()[0];
        this.currentTarget = null;

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
        allWindows.css({ 'pointer-events': 'none', 'user-select': 'none' }).animate({ opacity: 0 }, 250);

        canvas.stage.on('mousemove', this._onMouseMove);
        canvas.stage.on('mousedown', this._onClick);
        canvas.stage.on('rightdown', this._onRightClick);

        const aimBonus = this.aimSteps * (game.settings.get("zsystem", "aimBonus") || 0);
        const aimText = aimBonus > 0 ? ` (Прицел +${aimBonus}%)` : "";
        ui.notifications.info(`ПРИЦЕЛИВАНИЕ${aimText}: ЛКМ — Огонь, ПКМ — Отмена.`);
        document.body.style.cursor = "crosshair";
    }

    deactivate() {
        document.body.classList.remove('zsystem-aiming-focus');

        const allWindows = $('.window-app');
        allWindows.css({ 'pointer-events': 'all', 'user-select': 'auto' }).animate({ opacity: 1 }, 200);

        canvas.stage.off('mousemove', this._onMouseMove);
        canvas.stage.off('mousedown', this._onClick);
        canvas.stage.off('rightdown', this._onRightClick);
        document.body.style.cursor = "default";

        if (this.hud) { this.hud.remove(); this.hud = null; }

        this.graphics.clear();
        canvas.interface.removeChild(this.graphics);

        if (game.user.targets.size > 0) {
            game.user.targets.forEach(t => t.setTarget(false, { releaseOthers: false }));
        }
    }

    _getTokensInCone(sx, sy, coneAngle, halfAngle, radius) {
        return canvas.tokens.placeables.filter(t => {
            if (!t.visible || t.id === this.sourceToken.id) return false;
            const dx = t.center.x - sx;
            const dy = t.center.y - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) return false;
            let diff = Math.atan2(dy, dx) - coneAngle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            return Math.abs(diff) <= halfAngle;
        });
    }

    _getHitColor(hitChance) {
        if (hitChance >= 80) return { hex: 0x69f0ae, css: "#69f0ae" };
        if (hitChance >= 50) return { hex: 0xffab91, css: "#ffab91" };
        return { hex: 0xff5252, css: "#ff5252" };
    }

    _calcDisplayChance(target) {
        const chanceData = _calculateHitChance(this.actor, this.item, this.attack, this.sourceToken, target, this.modifier, this.aimSteps);
        let hitChance = chanceData.total;
        if (this.actor.statuses.has("dizzy")) hitChance = Math.floor(hitChance * 0.5);
        if (this.actor.statuses.has("blind")) hitChance = Math.floor(hitChance * 0.5);
        return { hitChance, chanceData };
    }

    _onMouseMove(event) {
        const pos = event.data.getLocalPosition(canvas.tokens);
        const clientX = event.data.originalEvent.clientX;
        const clientY = event.data.originalEvent.clientY;

        if (this.hud) this.hud.css({ top: clientY + 15, left: clientX + 15 });

        const sx = this.sourceToken.center.x;
        const sy = this.sourceToken.center.y;
        const dx = pos.x - sx;
        const dy = pos.y - sy;
        const coneAngle = Math.atan2(dy, dx);
        const halfAngle = Math.PI / 6; // 60° total cone
        const weaponRange = Number(this.item.system.range) || 1.5;
        const radius = weaponRange * canvas.grid.size;

        // Token directly under cursor takes priority, then first token in cone
        const directHover = canvas.tokens.placeables.find(t =>
            t.visible && t.id !== this.sourceToken.id &&
            t.hitArea.contains(pos.x - t.x, pos.y - t.y)
        );
        const tokensInCone = this._getTokensInCone(sx, sy, coneAngle, halfAngle, radius);
        this.currentTarget = directHover || (tokensInCone.length > 0 ? tokensInCone[0] : null);

        this.graphics.clear();

        // Determine cone color from hovered target
        let coneColor = 0xffffff;
        let coneAlpha = 0.10;
        if (this.currentTarget) {
            const { hitChance } = this._calcDisplayChance(this.currentTarget);
            const col = this._getHitColor(hitChance);
            coneColor = col.hex;
            coneAlpha = 0.18;
        }

        // Draw cone sector
        this.graphics.lineStyle(2, coneColor, 0.7);
        this.graphics.beginFill(coneColor, coneAlpha);
        this.graphics.moveTo(sx, sy);
        this.graphics.arc(sx, sy, radius, coneAngle - halfAngle, coneAngle + halfAngle);
        this.graphics.lineTo(sx, sy);
        this.graphics.closePath();
        this.graphics.endFill();

        // Highlight tokens in cone
        for (const t of tokensInCone) {
            const isActive = this.currentTarget && t.id === this.currentTarget.id;
            const { hitChance } = this._calcDisplayChance(t);
            const col = this._getHitColor(hitChance);

            this.graphics.lineStyle(isActive ? 3 : 1, col.hex, isActive ? 0.95 : 0.5);
            this.graphics.beginFill(col.hex, isActive ? 0.22 : 0.08);
            this.graphics.drawCircle(t.center.x, t.center.y, t.w / 2 + (isActive ? 4 : 0));
            this.graphics.endFill();

            // Show % label on each token in cone
            // (текст рисуется через PIXI.Text только если изменился — избегаем утечки)
        }

        if (this.currentTarget) {
            this._updateHudContent(this.currentTarget);
            this.hud.show();
        } else {
            this.hud.hide();
        }
    }

    async _onClick(event) {
        if (event.data.button !== 0) return;
        if (!this.currentTarget) return;

        const target = this.currentTarget;

        const aimCostPerStep = game.settings.get("zsystem", "aimCost");
        const extraAp = this.aimSteps * aimCostPerStep;
        const baseCost = Number(this.attack.ap) || 0;
        const totalCost = baseCost + extraAp;
        const curAP = this.actor.system.resources.ap.value;

        if (curAP < totalCost) {
            ui.notifications.warn(`Недостаточно AP! Нужно ${totalCost} (Атака ${baseCost} + Прицел ${extraAp})`);
            this.deactivate();
            aimingHandler = null;
            if (this.dialogApp) this.dialogApp.close();
            return;
        }

        const isThrowingAction = (this.attack.mode === 'throw' || this.item.system.isThrowing === true);
        if (!isThrowingAction && this.item.system.ammoType) {
            const spentBullets = parseInt(this.attack.bullets) || 1;
            const curMag = parseInt(this.item.system.mag.value) || 0;
            if (curMag < spentBullets) {
                ui.notifications.warn(`Патроны закончились! В магазине: ${curMag}`);
                this.deactivate();
                aimingHandler = null;
                if (this.dialogApp) this.dialogApp.close();
                return;
            }
        }

        target.setTarget(true, { releaseOthers: true, groupSelection: false });

        const location = $('#aim-location').val() || "torso";
        await _executeAttack(this.actor, this.item, this.attack, location, this.modifier, "roll", this.aimSteps, this.weaponHand);

        // Конус остаётся активным — следующий выстрел без закрытия диалога
        // Если AP теперь не хватает — HUD обновится при следующем mousemove
    }

    _onRightClick() {
        this.deactivate();
        aimingHandler = null;
        ui.notifications.info("Действие отменено.");
    }

    _updateHudContent(target) {
        if (!this.hud) return;

        const { hitChance, chanceData } = this._calcDisplayChance(target);
        const isDizzy = this.actor.statuses.has("dizzy");
        const isBlindAim = this.actor.statuses.has("blind");
        const col = this._getHitColor(hitChance);

        let detailsHtml = "";
        if (this.aimSteps > 0) {
            const aimBonus = this.aimSteps * game.settings.get("zsystem", "aimBonus");
            detailsHtml += `<div class="aim-detail" style="color:#69f0ae;"><span>Прицел:</span> <span>+${aimBonus}%</span></div>`;
        }
        if (isDizzy) detailsHtml += `<div class="aim-detail" style="color:#e74c3c;"><span>Головокружение:</span> <span>-50%</span></div>`;
        if (isBlindAim) detailsHtml += `<div class="aim-detail" style="color:#e74c3c;"><span>Слепота:</span> <span>-50%</span></div>`;
        if (chanceData.details.coverPen < 0) detailsHtml += `<div class="aim-detail"><span>Укрытие:</span> <span>${chanceData.details.coverPen}%</span></div>`;
        if (chanceData.details.rangePen < 0) detailsHtml += `<div class="aim-detail"><span>Дальность:</span> <span>${chanceData.details.rangePen}%</span></div>`;
        if (chanceData.details.intervPen < 0) detailsHtml += `<div class="aim-detail"><span>Помеха:</span> <span>${chanceData.details.intervPen}%</span></div>`;
        if (chanceData.details.evasionMod < 0) detailsHtml += `<div class="aim-detail"><span>Уклонение:</span> <span>${chanceData.details.evasionMod}%</span></div>`;

        let warnHtml = "";
        if (chanceData.details.coverPen <= -1000) warnHtml = `<div class="aim-warn">ЦЕЛЬ ЗА ПРЕГРАДОЙ</div>`;

        const totalApDisplay = this.attack.ap + (this.aimSteps * game.settings.get("zsystem", "aimCost"));
        const html = `
            <div class="chance-header" style="color:${col.css}">ШАНС: ${hitChance}%</div>
            <div style="font-size:0.9em; font-weight:bold; margin-bottom:5px;">${target.name}</div>
            ${detailsHtml}
            ${warnHtml}
            <div style="margin-top:5px; border-top:1px solid #555; padding-top:2px; font-size:0.8em; color:#888;">
                AP: ${totalApDisplay} | ЛКМ: Огонь
            </div>
        `;

        this.hud.html(html);
        this.hud.css("border-left-color", col.css);
    }
}

// === ВЫНЕСЕННАЯ ФУНКЦИЯ РАСЧЕТА ===
function _calculateHitChance(actor, item, attack, sourceToken, targetToken, modifier, aimSteps = 0) {
    let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : ((item.system.isThrowing && item.system.weaponType !== 'melee') ? 'athletics' : 'melee');
    const skillVal = actor.system.skills[skillType]?.value || 0;
    const atkMod = Number(attack.mod) || 0;
    
    // БОНУС ОТ ПРИЦЕЛИВАНИЯ
    const aimBonusPerStep = game.settings.get("zsystem", "aimBonus") || 10;
    const aimBonusTotal = aimSteps * aimBonusPerStep;

    const location = $('#aim-location').val() || "torso";
    const aimMod = (location === "head") ? -40 : (location !== "torso" ? -20 : 0);

    const dist = canvas.grid.measureDistance(sourceToken, targetToken);
    const weaponReach = Number(item.system.range) || 1.5;

    // Укрытие
    let coverPen = 0;
    const isMeleeHit = (skillType === 'melee' && dist <= weaponReach);
    
    if (!isMeleeHit) {
        const coverData = _calculateCover(sourceToken, targetToken);
        coverPen = coverData.penalty;
    }
    
    const rangeData = _calculateRangePenalty(item, dist);
    const rangePen = rangeData.penalty;
    
    // Помехи (Живой щит)
    let intervPen = 0;
    if (item.system.weaponType === 'ranged') {
        const obs = _checkInterveningTokens(sourceToken, targetToken);
        intervPen = obs.length * -20;
    }
    
    let evasionMod = 0;
    if (!targetToken.actor?.hasStatusEffect("prone")) {
        evasionMod = -((targetToken.actor?.system.secondary?.evasion?.value || 0));
    }

    // Добавили aimBonusTotal в сумму
    const total = Math.max(0, skillVal + atkMod + aimMod + coverPen + rangePen + intervPen + evasionMod + modifier + aimBonusTotal);
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

    const hasLArmInjury = actor.hasStatusEffect("injury-arm-lArm");
    const hasRArmInjury = actor.hasStatusEffect("injury-arm-rArm");

    // Сохранённая рука — null если ещё не выбирали (первый раз бесплатно)
    const storedHand = item.getFlag("zsystem", "weaponHand") ?? null;
    const displayHand = storedHand ?? "rArm";
    const curAP = Number(actor.system.resources.ap.value) || 0;

    const handLabel = (hand) => {
        const name = hand === "rArm" ? "Правая" : "Левая";
        const broken = hand === "rArm" ? hasRArmInjury : hasLArmInjury;
        return `${name}${broken ? " ⚠ сломана (+1 AP)" : ""}`;
    };

    let buttonsHTML = "";
    for (let [key, atk] of Object.entries(attackOptions)) {
        const totalNoise = (Number(item.system.noise)||0) + (Number(atk.noise)||0);
        const isSelected = (key === lastKey) ? "selected" : "";
        buttonsHTML += `<button class="z-attack-btn ${isSelected}" data-key="${key}">
                        <div class="atk-name">${atk.name}</div>
                        <div class="atk-info" data-base-ap="${atk.ap}">AP: ${atk.ap} | Noise: ${totalNoise}</div>
                    </button>`;
    }

    const weaponHandHTML = `
        <div class="form-group" style="border:1px solid #555; border-radius:4px; padding:5px; margin-bottom:5px;">
            <label><i class="fas fa-hand-paper"></i> Рука с оружием
                <span id="hand-switch-cost" style="color:#f39c12; font-size:0.85em; margin-left:6px; display:none;">(-1 AP при смене)</span>
            </label>
            <select id="weapon-hand">
                <option value="rArm" ${displayHand === "rArm" ? "selected" : ""}>${handLabel("rArm")}</option>
                <option value="lArm" ${displayHand === "lArm" ? "selected" : ""}>${handLabel("lArm")}</option>
            </select>
        </div>`;

    const aimCost = game.settings.get("zsystem", "aimCost");
    const aimBonus = game.settings.get("zsystem", "aimBonus");
    const aimMax = game.settings.get("zsystem", "aimMax");
    const isBlind = actor.statuses.has("blind");

    const content = `
    <form class="z-attack-dialog">
        <div class="grid grid-2col" style="margin-bottom:10px;">
            <div class="form-group"><label>Модификатор</label><input type="number" id="atk-modifier" value="0"/></div>
            <div class="form-group"><label>Режим</label><select id="atk-rollMode"><option value="roll">Публичный</option><option value="gmroll">ГМ</option></select></div>
        </div>

        ${weaponHandHTML}

        <div class="form-group">
    <label>Цель (Локация):</label>
    <select id="aim-location">
        <option value="torso">Торс (0)</option>
        <option value="head">Голова (-40)</option>
        <option value="lArm">Левая Рука (-20)</option>
        <option value="rArm">Правая Рука (-20)</option>
        <option value="lLeg">Левая Нога (-20)</option>
        <option value="rLeg">Правая Нога (-20)</option>
    </select>
</div>

        <!-- НОВОЕ: Блок Прицеливания -->
        <div class="aim-section" style="background:rgba(0,0,0,0.1); padding:5px; border:1px solid #777; border-radius:4px; margin:5px 0;">
            <label style="font-weight:bold; display:block; border-bottom:1px dotted #555; margin-bottom:5px;">
                <i class="fas fa-crosshairs"></i> Прицеливание (+${aimBonus}% / ${aimCost} AP)
            </label>
            ${isBlind ? '<div style="color:#e74c3c; font-weight:bold; text-align:center; padding:3px;"><i class="fas fa-eye-slash"></i> СЛЕПОТА — прицеливание недоступно</div>' : ''}
            <div class="flexrow" style="align-items:center; gap:10px;">
                <input type="range" id="aim-slider" min="0" max="${aimMax}" value="0" step="1" ${isBlind ? 'disabled' : ''} oninput="document.getElementById('aim-val').innerText = this.value">
                <span style="font-weight:bold; width:20px; text-align:center;" id="aim-val">0</span>
            </div>
            <div style="font-size:0.8em; color:#555; text-align:center;">Максимум: ${aimMax} AP</div>
        </div>

        <!-- Конусное прицеливание на канвасе -->
        <div class="form-group" style="background:#263238; padding:5px; border-radius:3px; margin-top:5px;">
            <label style="color:#eceff1;"><i class="fas fa-crosshairs"></i> Конусное прицеливание (Canvas)</label>
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
            const updateButtonAP = () => {
                const selectedHand = html.find('#weapon-hand').val();
                // Смена стоит AP только если рука уже была сохранена (не первый выбор)
                const isSwitch = storedHand !== null && selectedHand !== storedHand;
                const brokenHands = { lArm: hasLArmInjury, rArm: hasRArmInjury };
                const injuryPenalty = brokenHands[selectedHand] ? 1 : 0;
                const switchCost = isSwitch ? 1 : 0;

                html.find('#hand-switch-cost').toggle(isSwitch);
                html.find('#weapon-hand').css('border-color', isSwitch ? '#f39c12' : '');

                html.find('.atk-info[data-base-ap]').each(function() {
                    const base = Number($(this).data('base-ap'));
                    const noise = $(this).text().match(/Noise: (\d+)/)?.[1] || 0;
                    const total = base + injuryPenalty + switchCost;
                    let extra = "";
                    if (injuryPenalty) extra += ` <span style="color:#e74c3c;">(+1 травма)</span>`;
                    if (switchCost) extra += ` <span style="color:#f39c12;">(+1 смена)</span>`;
                    $(this).html(`AP: ${total}${extra} | Noise: ${noise}`);
                });
            };
            html.find('#weapon-hand').on('change', updateButtonAP);
            updateButtonAP();

            html.find('.z-attack-btn').click(async (ev) => {
                ev.preventDefault();
                const key = ev.currentTarget.dataset.key;
                const atk = attackOptions[key];
                await item.setFlag("zsystem", "lastAttackKey", key);

                const loc = html.find('#aim-location').val();
                const mod = Number(html.find('#atk-modifier').val()) || 0;
                const aimSteps = Number(html.find('#aim-slider').val()) || 0;
                const weaponHand = html.find('#weapon-hand').val();
                const manualAim = html.find('#manual-aim').is(':checked');

                // Смена руки — списываем 1 AP (только если рука была уже сохранена)
                if (storedHand !== null && weaponHand !== storedHand) {
                    await actor.update({ "system.resources.ap.value": Math.max(0, curAP - 1) });
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor }),
                        content: `<div style="color:#f39c12; font-size:0.9em;">🤚 Смена руки: ${weaponHand === "rArm" ? "Правая" : "Левая"} (-1 AP)</div>`
                    });
                }
                // Сохраняем выбранную руку всегда (первый выбор или смена)
                if (weaponHand !== storedHand) {
                    await item.setFlag("zsystem", "weaponHand", weaponHand);
                }

                if (manualAim) {
                    if (aimingHandler) aimingHandler.deactivate();
                    aimingHandler = new AimingManager(actor, item, atk, mod, d, aimSteps, weaponHand);
                } else {
                    await _executeAttack(actor, item, atk, loc, mod, "roll", aimSteps, weaponHand);
                }

                if (!manualAim) d.close();
            });
        }
    });
    d.render(true);
}

// === ИСПОЛНЕНИЕ АТАКИ ===
async function _executeAttack(actor, item, attack, location = "torso", modifier = 0, rollMode = "roll", aimSteps = 0, weaponHand = "rArm") {
    console.log("ZSystem | [CHECKPOINT 1] Вход в атаку:", item.name);

    // Читаем настройки
    const aimCostPerStep = game.settings.get("zsystem", "aimCost");
    const aimBonusPerStep = game.settings.get("zsystem", "aimBonus");

    // 1. ОПРЕДЕЛЯЕМ ТОКЕНЫ
    const sourceToken = actor.getActiveTokens()[0]; 
    const targets = Array.from(game.user.targets);
    const targetToken = targets.length > 0 ? targets[0] : null;

    if (!sourceToken) return ui.notifications.error("Токен атакующего не найден!");

    // 2. ПРОВЕРКА РЕСУРСОВ
    const armInjuryAP = actor.hasStatusEffect(`injury-arm-${weaponHand}`) ? 1 : 0;
    const panicAP = actor.hasStatusEffect("panic-anxious") ? 1 : actor.hasStatusEffect("panic-panicked") ? 2 : 0;
    const baseApCost = (Number(attack.ap) || 0) + armInjuryAP + panicAP;
    const extraApCost = aimSteps * aimCostPerStep;
    const totalApCost = baseApCost + extraApCost;
    
    const curAP = Number(actor.system.resources.ap.value) || 0;
    
    if (curAP < totalApCost) {
        return ui.notifications.warn(`Недостаточно AP! Нужно ${totalApCost} (Атака ${baseApCost} + Прицел ${extraApCost}).`);
    }

    // Добавляем бонус к модификатору
    const aimBonusTotal = aimSteps * aimBonusPerStep;
    modifier += aimBonusTotal;

    console.log("ZSystem | [CHECKPOINT 2] AP проверено. Списание патронов...");

    // 3. РАСХОД ПАТРОНОВ
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

    // Списываем AP (Общее)
    await actor.update({"system.resources.ap.value": Math.max(0, curAP - totalApCost)});
    
    console.log("ZSystem | [CHECKPOINT 3] Ресурсы списаны. Запуск анимации...");

    // 4. ЗАПУСК АНИМАЦИИ
    try {
        const aaModule = game.modules.get("automated-animations");
        const aaApi = aaModule?.api || window.AutoAnimations?.api || window.AutomatedAnimations;
        
        if (aaApi && typeof aaApi.playAnimation === "function") {
            aaApi.playAnimation(sourceToken, item, { targets: targets });
        } else {
            Hooks.callAll("AutomatedAnimations-Workflow", sourceToken, item, { targets: targets });
        }
    } catch (err) {
        console.error("ZSystem | Ошибка в блоке анимации:", err);
    }

    console.log("ZSystem | [CHECKPOINT 4] Расчет попадания...");

    // 5. РАСЧЕТ ПОПАДАНИЯ
    let skillType = (item.system.weaponType === 'ranged') ? 'ranged' : (isThrowingAction ? 'athletics' : 'melee');
    const skillVal = actor.system.skills[skillType]?.value || 0;
    const atkMod = Number(attack.mod) || 0;
    const aimMod = (location === "head") ? -20 : (location !== "torso" ? -10 : 0);
    
    let coverPenalty = 0, rangePenalty = 0, interventionPenalty = 0, evasionMod = 0, targetName = "Нет цели";

    if (targetToken) {
        targetName = targetToken.name;
        const dist = canvas.grid.measureDistance(sourceToken, targetToken);
        const weaponReach = Number(item.system.range) || 1.5;

        if (skillType === 'melee' && dist > weaponReach) return ui.notifications.warn(`Слишком далеко!`);
        
        if (skillType === 'ranged') {
            const coverData = _calculateCover(sourceToken, targetToken);
            coverPenalty = coverData.penalty;
            if (coverPenalty <= -1000) return ui.notifications.error("Цель за преградой!");

            const rangeData = _calculateRangePenalty(item, dist);
            rangePenalty = rangeData.penalty;

            const obstacles = _checkInterveningTokens(sourceToken, targetToken);
            interventionPenalty = obstacles.length * -20;
        }

        if (!targetToken.actor?.hasStatusEffect("prone")) {
            evasionMod = -(targetToken.actor?.system.secondary?.evasion?.value || 0);
        }
    }

    // 6. БРОСОК
    let totalChance = Math.max(0, skillVal + atkMod + aimMod + evasionMod + coverPenalty + rangePenalty + interventionPenalty + modifier);

    // TASK-004: Штраф головокружения и слепоты (-50% каждый, стакаются)
    let dizzyLog = "";
    if (actor.statuses.has("dizzy")) {
        const origChance = totalChance;
        totalChance = Math.floor(totalChance * 0.5);
        dizzyLog = `<div style="font-size:0.8em; color:#e74c3c;">ГОЛОВОКРУЖЕНИЕ: ${origChance}% → ${totalChance}%</div>`;
    }
    if (actor.statuses.has("blind")) {
        const origChance = totalChance;
        totalChance = Math.floor(totalChance * 0.5);
        dizzyLog += `<div style="font-size:0.8em; color:#e74c3c;">СЛЕПОТА: ${origChance}% → ${totalChance}%</div>`;
    }

    const roll = await new Roll("1d100").evaluate();
    const resultType = _calcResult(roll.total, totalChance);
    const isHit = resultType.includes("success");
    
    if (targetToken) _drawTracer(sourceToken, targetToken, isHit);

    // 7. УРОН И ЭФФЕКТЫ
    let dmgAmount = 0, dmgDisplay = "";
    const damageDataForGM = [];
    const triggeredEffects = [];
    let strBonusLog = "";
    let stealthLog = "";

    if (isHit) {
        let formula = attack.dmg || "0";
        if (resultType === "crit-success") formula = `ceil((${formula}) * 1.5)`;

        let rDmg = await new Roll(formula, actor.getRollData()).evaluate();
        let finalDmg = rDmg.total;

        // TASK-001: Авто-сила в ближнем бою
        if (item.system.weaponType === "melee") {
            const strVal = actor.system.attributes.str.value || 0;
            const strBonus = (item.system.hands === "2h") ? strVal * 2 : strVal;
            finalDmg += strBonus;
            strBonusLog = `<div style="font-size:0.8em; color:#aed6f1;">СИЛ: +${strBonus}${item.system.hands === "2h" ? " (двуруч.)" : ""}</div>`;
        }

        // TASK-003: Скрытная атака
        if (actor.statuses.has("stealth")) {
            finalDmg *= 2;
            stealthLog = `<div style="font-size:0.8em; color:#a29bfe; font-weight:bold;">СКРЫТНАЯ АТАКА ×2</div>`;
        }

        if (targetToken?.actor && typeof PerkLogic !== "undefined") {
            finalDmg = PerkLogic.onApplyDamage(actor, targetToken.actor, finalDmg, item);
        }

        dmgAmount = Math.max(1, Math.floor(finalDmg));
        dmgDisplay = `<div class="z-damage-box"><div class="dmg-label">УРОН</div><div class="dmg-val">${dmgAmount}</div></div>`;

        // Обработка эффектов
        let rawEffects = attack.effects || [];
        let effectsList = [];
        if (Array.isArray(rawEffects)) {
            effectsList = rawEffects;
        } else if (typeof rawEffects === 'object') {
            effectsList = Object.values(rawEffects);
        }

        if (attack.effect && !effectsList.length) {
            effectsList.push({ id: attack.effect, chance: attack.chance || 100 });
        }

        for (let eff of effectsList) {
            if (!eff.id) continue;
            const chance = Number(eff.chance) || 100;
            const rollEffect = Math.random() * 100;
            if (rollEffect <= chance) triggeredEffects.push(eff.id);
        }
        
        if (targetToken) {
            damageDataForGM.push({
                uuid: targetToken.document.uuid,
                amount: dmgAmount,
                type: item.system.damageType || "blunt",
                limb: location,
                effects: triggeredEffects,
                headshot: location === "head"
            });
        }
    }

    // 8. ЧАТ
    const cardHtml = _getSlotMachineHTML(targetName, totalChance, roll.total, resultType);
    let ammoInfo = (spentBullets > 0 && item.system.ammoType) ? `<div style="font-size:0.8em; color:#777;">Потрачено патронов: ${spentBullets}</div>` : "";
    
    // Добавляем инфо о прицеливании в лог
    let aimLog = aimSteps > 0 ? `<div style="color:#69f0ae; font-size:0.8em;">Прицел: +${aimBonusTotal}% (-${extraApCost} AP)</div>` : "";

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `${cardHtml}${dmgDisplay}${ammoInfo}${aimLog}${strBonusLog}${stealthLog}${dizzyLog}<div class="z-ap-spent">-${totalApCost} AP</div>`,
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