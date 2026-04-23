/**
 * StealthDetectionManager — кольца обнаружения зомби и система шагов скрытности.
 * Только для ГМ.
 */

export class StealthDetectionManager {
    static _overlay = null;
    static _actorSteps = new Map();   // actorId → оставшиеся шаги
    static _inZone = new Map();       // `${zombieId}-${actorId}` → bool
    static _tokenPositions = new Map(); // tokenId → {x, y} — для подсчёта шагов при перетаскивании

    /** Инициализировать счётчик шагов для актора (при надевании скрытности) */
    static initActor(actor) {
        const stealthVal = actor.system.skills?.stealth?.value ?? 0;
        const steps = Math.max(1, Math.floor(stealthVal / 10));
        this._actorSteps.set(actor.id, steps);
    }

    /** Убрать счётчик (при снятии скрытности) */
    static clearActor(actor) {
        this._actorSteps.delete(actor.id);
        // Очистить зоны этого актора
        for (const key of this._inZone.keys()) {
            if (key.endsWith(`-${actor.id}`)) this._inZone.delete(key);
        }
        this.updateStepDisplay();
    }

    /** Перерисовать кольца (оранжевый = PER зомби) — только для ГМ
     *  @param {TokenDocument|null} movedTokenDoc — документ токена который только что переместился;
     *                                              передаём напрямую из хука, т.к. canvas-объект
     *                                              может ещё не синхронизировать позицию
     */
    static refresh(movedTokenDoc = null) {
        if (!game.user.isGM || !canvas?.ready) return;

        if (this._overlay) {
            this._overlay.destroy();
            this._overlay = null;
        }

        const stealthTokens = canvas.tokens.placeables.filter(
            t => t.actor?.type === "survivor" && t.actor.hasStatusEffect("stealth")
        );
        if (stealthTokens.length === 0) return;

        const zombieTokens = canvas.tokens.placeables.filter(
            t => t.actor?.type === "zombie"
        );
        if (zombieTokens.length === 0) return;

        this._overlay = new PIXI.Graphics();
        const gs = canvas.grid.size;

        for (const zombie of zombieTokens) {
            const per = zombie.actor.system.attributes?.per?.value ?? 3;
            const r = Math.max(0, per) * gs;
            if (r <= 0) continue;
            // Если это тот токен что только что переместился — берём позицию напрямую из tokenDoc
            // (canvas-объект может ещё не иметь актуальной позиции на момент хука)
            const srcX = (movedTokenDoc?.id === zombie.id) ? movedTokenDoc.x : zombie.document.x;
            const srcY = (movedTokenDoc?.id === zombie.id) ? movedTokenDoc.y : zombie.document.y;
            const cx = srcX + zombie.w / 2;
            const cy = srcY + zombie.h / 2;
            this._overlay.lineStyle(2, 0xff6600, 0.5);
            this._overlay.drawCircle(cx, cy, r);
        }

        canvas.controls.addChild(this._overlay);
    }

    /** Обработка шага: трата шагов и проверка входа в кольцо */
    static async onStep(token, stepCount = 1) {
        if (!game.user.isGM) return;
        const actor = token.actor;
        if (!actor || actor.type !== "survivor") return;
        if (!actor.hasStatusEffect("stealth")) return;

        const stealthVal = actor.system.skills?.stealth?.value ?? 0;

        // 1. Тратим шаги (сколько клеток прошёл за одно движение)
        const prevRemaining = this._actorSteps.get(actor.id) ?? 0;
        const remaining = prevRemaining - stepCount;
        this._actorSteps.set(actor.id, Math.max(0, remaining));
        const stepsExhausted = prevRemaining > 0 && remaining <= 0;

        // 2. Проверяем все зомби — факт входа в кольцо или окончание шагов внутри
        const maxSteps = Math.max(1, Math.floor(stealthVal / 10));
        const zombies = canvas.tokens.placeables.filter(t => t.actor?.type === "zombie");

        // Если шаги закончились вне всех колец — тихо сбрасываем до максимума
        if (stepsExhausted) {
            const inAnyZone = zombies.some(zt => {
                const per = zt.actor.system.attributes?.per?.value ?? 3;
                return canvas.grid.measureDistance(token, zt, { gridSpaces: true }) <= per;
            });
            if (!inAnyZone) {
                this._actorSteps.set(actor.id, maxSteps);
            }
        }

        for (const zombieToken of zombies) {
            const per = zombieToken.actor.system.attributes?.per?.value ?? 3;
            const dist = canvas.grid.measureDistance(token, zombieToken, { gridSpaces: true });
            const key = `${zombieToken.id}-${actor.id}`;

            const wasInside = this._inZone.get(key) ?? false;
            const isInside = dist <= per;
            this._inZone.set(key, isInside);

            // Бросок при ВХОДЕ (был снаружи → стал внутри)
            // ИЛИ при ИСЧЕРПАНИИ шагов пока внутри кольца
            const isEntry = isInside && !wasInside;
            const isExhaustedInside = stepsExhausted && isInside;
            if (!isEntry && !isExhaustedInside) continue;

            // Если шаги закончились — пополняем обратно до максимума
            if (isExhaustedInside) {
                this._actorSteps.set(actor.id, maxSteps);
            }

            const roll = new Roll("1d100");
            await roll.evaluate();
            const success = roll.total <= stealthVal;

            const reason = isExhaustedInside ? "шаги исчерпаны в зоне" : "вход в зону";

            if (success) {
                ChatMessage.create({
                    content: `<div style="background:rgba(0,180,0,0.08); border-left:3px solid #69f0ae; padding:4px 8px; border-radius:3px;">
                        <div style="color:#69f0ae; font-weight:bold;">✅ СКРЫТНОСТЬ: УСПЕХ</div>
                        <div style="margin-top:3px;"><b>${actor.name}</b> остаётся незамеченным — бросок ${roll.total} ≤ ${stealthVal}</div>
                        <div style="font-size:0.82em; color:#aaa; margin-top:2px;">Рядом: ${zombieToken.name} (${dist} кл.) · причина: ${reason}</div>
                    </div>`,
                    whisper: ChatMessage.getWhisperRecipients("GM")
                });
            } else {
                ChatMessage.create({
                    content: `<div style="background:rgba(200,0,0,0.1); border-left:3px solid #e74c3c; padding:4px 8px; border-radius:3px;">
                        <div style="color:#e74c3c; font-weight:bold;">❌ СКРЫТНОСТЬ: ПРОВАЛ — ОБНАРУЖЕН!</div>
                        <div style="margin-top:3px;"><b>${zombieToken.name}</b> замечает <b>${actor.name}</b> — бросок ${roll.total} > ${stealthVal}</div>
                        <div style="font-size:0.82em; color:#aaa; margin-top:2px;">Дистанция: ${dist} кл. · PER зомби: ${per} · причина: ${reason}</div>
                    </div>`,
                    whisper: ChatMessage.getWhisperRecipients("GM")
                });

                // Снимаем статус скрытности
                const stealthEffect = actor.effects.find(e => e.statuses.has("stealth"));
                if (stealthEffect) {
                    await actor.deleteEmbeddedDocuments("ActiveEffect", [stealthEffect.id]);
                }

                // Визуальная метка на сцене — красная точка где спалился
                const markerData = {
                    t: "circle",
                    user: game.user.id,
                    distance: 0.4,
                    direction: 0,
                    x: token.center.x,
                    y: token.center.y,
                    fillColor: "#e74c3c",
                    borderColor: "#ff0000",
                    flags: { zsystem: { detectionMarker: true } }
                };
                canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [markerData]);

                // Надпись над токеном
                canvas.interface.createScrollingText(token.center, "👁️ ОБНАРУЖЕН!", {
                    fill: "#e74c3c",
                    stroke: 0x000000,
                    fontSize: 36,
                    fontWeight: "bold",
                    duration: 6000
                });

                // Пауза
                if (!game.paused) game.togglePause(true);
            }
        }
    }

    /** Счётчик оставшихся шагов — текст прикреплён прямо к токену (движется вместе с ним) */
    static updateStepDisplay() {
        if (!game.user.isGM || !canvas?.ready) return;

        // Сначала убираем старые метки со всех токенов
        for (const t of canvas.tokens.placeables) {
            if (t._stealthLabel) {
                t.removeChild(t._stealthLabel);
                t._stealthLabel.destroy();
                t._stealthLabel = null;
            }
        }

        const stealthTokens = canvas.tokens.placeables.filter(
            t => t.actor?.type === "survivor" && t.actor.hasStatusEffect("stealth")
        );

        for (const st of stealthTokens) {
            const actor = st.actor;
            const stealthVal = actor.system.skills?.stealth?.value ?? 0;
            const maxSteps = Math.max(1, Math.floor(stealthVal / 10));
            const left = this._actorSteps.get(actor.id) ?? maxSteps;

            const isUrgent = left <= 1;
            const isWarn   = left <= Math.ceil(maxSteps / 2);
            const fill = isUrgent ? "#ff5555" : isWarn ? "#ffaa00" : "#dddddd";

            const text = new PIXI.Text(`Скрытность: ${left}`, {
                fontSize: 10,
                fill,
                fontWeight: "bold",
                stroke: "#000000",
                strokeThickness: 3,
            });
            // Позиция относительно самого токена — центр по X, над ним по Y
            text.anchor.set(0.5, 1);
            text.x = st.w / 2;
            text.y = -4;

            st.addChild(text);
            st._stealthLabel = text;
        }
    }

    /** Сбросить шаги при смене хода */
    static resetSteps() {
        this._actorSteps.clear();
        this._inZone.clear();
        // Переинициализировать для всех текущих скрытных акторов
        canvas?.tokens?.placeables
            ?.filter(t => t.actor?.type === "survivor" && t.actor.hasStatusEffect("stealth"))
            ?.forEach(t => this.initActor(t.actor));
        this.updateStepDisplay();
    }

    /** Регистрация хуков — вызывается один раз при инициализации системы */
    static initHooks() {
        // На случай если canvasReady уже отстрелял до ready
        if (canvas?.ready) {
            canvas.tokens.placeables
                .filter(t => t.actor?.type === "survivor" && t.actor.hasStatusEffect("stealth"))
                .forEach(t => StealthDetectionManager._tokenPositions.set(t.id, { x: t.document.x, y: t.document.y }));
            StealthDetectionManager.refresh();
            StealthDetectionManager.updateStepDisplay();
        }

        // Перерисовка при загрузке сцены
        Hooks.on("canvasReady", () => {
            StealthDetectionManager._tokenPositions.clear();
            // Инициализируем позиции для всех скрытных токенов
            canvas.tokens.placeables
                .filter(t => t.actor?.type === "survivor" && t.actor.hasStatusEffect("stealth"))
                .forEach(t => StealthDetectionManager._tokenPositions.set(t.id, { x: t.document.x, y: t.document.y }));
            StealthDetectionManager.refresh();
            StealthDetectionManager.updateStepDisplay();
        });

        // Перерисовка и проверка при движении токена
        Hooks.on("updateToken", async (tokenDoc, changes) => {
            if (!changes.x && !changes.y) return;

            // Передаём tokenDoc напрямую — canvas-объект может не иметь актуальной позиции
            StealthDetectionManager.refresh(tokenDoc);

            const token = tokenDoc.object;
            if (!token) return;
            // Шаг скрытности обрабатываем только для survivor
            if (token.actor?.type === "survivor") {
                const newPos = { x: tokenDoc.x, y: tokenDoc.y };
                const oldPos = StealthDetectionManager._tokenPositions.get(tokenDoc.id);
                StealthDetectionManager._tokenPositions.set(tokenDoc.id, newPos);

                let stepCount = 1;
                if (oldPos) {
                    const dx = Math.abs(newPos.x - oldPos.x) / canvas.grid.size;
                    const dy = Math.abs(newPos.y - oldPos.y) / canvas.grid.size;
                    stepCount = Math.max(1, Math.round(Math.max(dx, dy)));
                }

                await StealthDetectionManager.onStep(token, stepCount);
                StealthDetectionManager.updateStepDisplay();
            }
        });

        // Сброс шагов при смене хода
        Hooks.on("combatTurn", () => StealthDetectionManager.resetSteps());

        // После визуального обновления токена Foundry может пересоздать дочерние PIXI-объекты,
        // уничтожив наш _stealthLabel. Восстанавливаем его.
        Hooks.on("refreshToken", (token) => {
            if (!game.user.isGM || !canvas?.ready) return;
            if (token.actor?.type !== "survivor") return;
            if (!token.actor.hasStatusEffect("stealth")) return;
            if (token._stealthLabel && !token._stealthLabel.parent) {
                token.addChild(token._stealthLabel);
            }
        });

        // Обновление при добавлении/снятии статуса скрытности
        Hooks.on("createActiveEffect", (effect) => {
            if (effect.statuses?.has("stealth")) {
                const actor = effect.parent;
                if (actor) {
                    StealthDetectionManager.initActor(actor);
                    // Сохраняем начальную позицию — без этого первый ход считается как 1 шаг
                    for (const t of actor.getActiveTokens()) {
                        StealthDetectionManager._tokenPositions.set(t.id, { x: t.document.x, y: t.document.y });
                    }
                }
                StealthDetectionManager.refresh();
                StealthDetectionManager.updateStepDisplay();
            }
        });
        Hooks.on("deleteActiveEffect", (effect) => {
            if (effect.statuses?.has("stealth")) {
                const actor = effect.parent;
                if (actor) StealthDetectionManager.clearActor(actor);
                StealthDetectionManager.refresh();
            }
        });
    }
}
