/**
 * PlayerHUD — быстрый HUD действий игрока.
 * Перетаскиваемый, позиция сохраняется в localStorage.
 */

const STORAGE_KEY = "zsystem-player-hud-pos";
const DEFAULT_POS = { left: 60, bottom: 130 };

export class PlayerHUD {
    static currentToken = null;
    static _el = null;

    // ─── Инициализация ────────────────────────────────────────────────

    static init() {
        Hooks.on("controlToken", (token, controlled) => {
            if (controlled && token.actor?.type === "survivor" &&
                (game.user.isGM || token.isOwner)) {
                this.attach(token);
            } else if (!controlled && this.currentToken?.id === token.id) {
                this.detach();
            }
        });

        Hooks.on("updateActor",        (actor)  => { if (this.currentToken?.actor?.id === actor.id) this.render(); });
        Hooks.on("createActiveEffect", (effect) => { if (this.currentToken?.actor?.id === effect.parent?.id) this.render(); });
        Hooks.on("deleteActiveEffect", (effect) => { if (this.currentToken?.actor?.id === effect.parent?.id) this.render(); });
        Hooks.on("updateItem",         (item)   => { if (this.currentToken?.actor?.items.has(item.id)) this.render(); });
    }

    // ─── Показать / скрыть ────────────────────────────────────────────

    static attach(token) {
        this.currentToken = token;
        if (!this._el) this._build();
        this.render();
        this._el.style.display = "flex";
    }

    static detach() {
        this.currentToken = null;
        if (this._el) this._el.style.display = "none";
    }

    // ─── Построить DOM ────────────────────────────────────────────────

    static _build() {
        const el = document.createElement("div");
        el.id = "zsystem-player-hud";
        el.innerHTML = `
            <div class="phud-drag-handle" title="Перетащить">
                <span class="phud-name"></span>
                <span class="phud-stats"></span>
            </div>
            <div class="phud-actions"></div>
        `;
        document.body.appendChild(el);
        this._el = el;

        // Восстановить позицию
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        const pos = saved || DEFAULT_POS;
        el.style.left   = pos.left + "px";
        el.style.bottom = pos.bottom + "px";

        // Перетаскивание
        this._initDrag(el.querySelector(".phud-drag-handle"), el);
    }

    static _initDrag(handle, el) {
        let dragging = false;
        let startX, startY, startLeft, startBottom;

        handle.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft   = parseInt(el.style.left)   || DEFAULT_POS.left;
            startBottom = parseInt(el.style.bottom) || DEFAULT_POS.bottom;
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newLeft   = Math.max(0, startLeft + dx);
            const newBottom = Math.max(0, startBottom - dy);
            el.style.left   = newLeft + "px";
            el.style.bottom = newBottom + "px";
        });

        document.addEventListener("mouseup", (e) => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                left:   parseInt(el.style.left),
                bottom: parseInt(el.style.bottom)
            }));
        });
    }

    // ─── Отрисовать содержимое ────────────────────────────────────────

    static render() {
        if (!this._el || !this.currentToken) return;
        const actor = this.currentToken.actor;
        if (!actor) return;

        const hp = actor.system.resources.hp;
        const ap = actor.system.resources.ap;

        this._el.querySelector(".phud-name").textContent = actor.name;
        this._el.querySelector(".phud-stats").innerHTML =
            `<span class="phud-hp">❤ ${hp.value}/${hp.max}</span>` +
            `<span class="phud-ap">⚡ ${ap.value}/${ap.max}</span>`;

        const actions = this._el.querySelector(".phud-actions");
        actions.innerHTML = "";

        const isStealth = actor.hasStatusEffect("stealth");
        const isProne   = actor.hasStatusEffect("prone");
        const equipped  = actor.items.find(i => i.type === "weapon" && i.system.equipped);
        const inCombat  = game.combat?.active &&
                          game.combat.combatants.some(c => c.tokenId === this.currentToken.id);
        const isMyTurn  = inCombat && game.combat.current?.tokenId === this.currentToken.id;

        this._addBtn(actions,
            isStealth ? "🤫 Выйти из скрытности" : "🤫 Скрытность",
            () => actor.toggleStatusEffect("stealth"),
            isStealth ? "active" : ""
        );

        if (isProne) {
            this._addBtn(actions, "⬆ Встать (3 AP)",
                () => actor.standUp(),
                ap.value < 3 ? "disabled" : ""
            );
        }

        if (equipped?.system.ammoType) {
            const full    = equipped.system.mag.value >= equipped.system.mag.max;
            const hasAmmo = actor.items.some(i => i.type === "ammo" && i.system.calibre === equipped.system.ammoType);
            const reloadAP = Number(equipped.system.reloadAP) || 0;
            if (!full && hasAmmo) {
                this._addBtn(actions, `🔄 Перезарядить (${reloadAP} AP)`,
                    () => actor.reloadWeapon(equipped),
                    ap.value < reloadAP ? "disabled" : ""
                );
            }
        }

        if (isMyTurn) {
            this._addBtn(actions, "⏭ Конец хода", () => game.combat?.nextTurn());
        }
    }

    static _addBtn(container, label, onClick, cls = "") {
        const btn = document.createElement("button");
        btn.className = ("phud-btn " + cls).trim();
        btn.textContent = label;
        btn.disabled = cls === "disabled";
        if (!btn.disabled) {
            btn.addEventListener("mousedown", e => e.stopPropagation());
            btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
        }
        container.appendChild(btn);
    }

    // ─── Действия ────────────────────────────────────────────────────
    // (все через лямбды в _addBtn — логика минимальна)
}
