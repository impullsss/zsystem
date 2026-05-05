import { openCommunicationDialog } from "./apps/communication-dialog.js";
import { openSkillCheckDialog } from "./apps/skill-check-dialog.js";
import { getSocialAttitudeMeta, getSocialPresetLabel, getSocialProfile } from "./social-check.js";
import { openSocialProfileDialog } from "./actions.js";

const STORAGE_KEY = "zsystem-player-hud-pos";
const DEFAULT_POS = { left: 60, bottom: 130 };

export class PlayerHUD {
    static currentToken = null;
    static _el = null;

    static _supportsActor(actor) {
        return !!actor && ["survivor", "npc"].includes(actor.type);
    }

    static _canUseToken(token) {
        return !!token?.actor && this._supportsActor(token.actor) && (game.user.isGM || token.isOwner);
    }

    static init() {
        Hooks.on("controlToken", (token, controlled) => {
            if (controlled && this._canUseToken(token)) this.attach(token);
            else if (!controlled && this.currentToken?.id === token.id) this.detach();
        });

        Hooks.on("updateActor", (actor) => {
            if (this.currentToken?.actor?.id === actor.id) this.render();
        });
        Hooks.on("createActiveEffect", (effect) => {
            if (this.currentToken?.actor?.id === effect.parent?.id) this.render();
        });
        Hooks.on("deleteActiveEffect", (effect) => {
            if (this.currentToken?.actor?.id === effect.parent?.id) this.render();
        });
        Hooks.on("updateItem", (item) => {
            if (this.currentToken?.actor?.items.has(item.id)) this.render();
        });
    }

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

    static _build() {
        const el = document.createElement("div");
        el.id = "zsystem-player-hud";
        el.innerHTML = `
            <div class="phud-drag-handle" title="Перетащить">
                <span class="phud-name"></span>
                <span class="phud-stats"></span>
                <span class="phud-social"></span>
            </div>
            <div class="phud-actions"></div>
        `;
        document.body.appendChild(el);
        this._el = el;

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        const pos = saved || DEFAULT_POS;
        el.style.left = pos.left + "px";
        el.style.bottom = pos.bottom + "px";

        this._initDrag(el.querySelector(".phud-drag-handle"), el);
    }

    static _initDrag(handle, el) {
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startBottom = 0;

        handle.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = parseInt(el.style.left) || DEFAULT_POS.left;
            startBottom = parseInt(el.style.bottom) || DEFAULT_POS.bottom;
            event.preventDefault();
        });

        document.addEventListener("mousemove", (event) => {
            if (!dragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            el.style.left = Math.max(0, startLeft + dx) + "px";
            el.style.bottom = Math.max(0, startBottom - dy) + "px";
        });

        document.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                left: parseInt(el.style.left),
                bottom: parseInt(el.style.bottom)
            }));
        });
    }

    static render() {
        if (!this._el || !this.currentToken) return;

        const actor = this.currentToken.actor;
        if (!actor || !this._supportsActor(actor)) return;

        const hp = actor.system.resources.hp;
        const ap = actor.system.resources.ap;
        const social = getSocialProfile(actor);
        const attitudeMeta = getSocialAttitudeMeta(social.attitude);
        const presetLabel = getSocialPresetLabel(social.preset);

        this._el.querySelector(".phud-name").textContent = actor.name;
        this._el.querySelector(".phud-stats").innerHTML =
            `<span class="phud-hp">❤ ${hp.value}/${hp.max}</span>` +
            `<span class="phud-ap">⚡ ${ap.value}/${ap.max}</span>`;
        this._el.querySelector(".phud-social").textContent = `${attitudeMeta.icon} ${attitudeMeta.label} • ${presetLabel}`;
        this._el.querySelector(".phud-social").style.color = attitudeMeta.color;

        const actions = this._el.querySelector(".phud-actions");
        actions.innerHTML = "";

        const isStealth = actor.hasStatusEffect("stealth");
        const isProne = actor.hasStatusEffect("prone");
        const equipped = actor.items.find((item) => item.type === "weapon" && item.system.equipped);
        const inCombat = game.combat?.active && game.combat.combatants.some((combatant) => combatant.tokenId === this.currentToken.id);
        const isMyTurn = inCombat && game.combat.current?.tokenId === this.currentToken.id;

        this._addBtn(
            actions,
            isStealth ? `<span class="phud-icon"><i class="fas fa-user-secret"></i></span> Выйти из скрытности` : `<span class="phud-icon"><i class="fas fa-user-secret"></i></span> Скрытность`,
            () => actor.toggleStatusEffect("stealth"),
            isStealth ? "active" : "",
            true
        );

        this._addBtn(actions, `<span class="phud-icon">💬</span> Общение`, () => openCommunicationDialog(actor), "", true);

        this._addBtn(actions, `<span class="phud-icon"><i class="fas fa-dice-d20"></i></span> Проверка`, () => openSkillCheckDialog(actor), "", true);

        if (game.user.isGM) {
            this._addBtn(actions, `<span class="phud-icon">🙂</span> Отношение`, () => openSocialProfileDialog(actor, {
                tokenDocument: this.currentToken.document,
                onChange: () => this.render()
            }), "", true);
            this._addDebugRollPanel(actions);
        }

        if (isProne) {
            this._addBtn(actions, `<span class="phud-icon">⬆</span> Встать (3 AP)`, () => actor.standUp(), ap.value < 3 ? "disabled" : "", true);
        }

        if (equipped?.system.ammoType) {
            const full = equipped.system.mag.value >= equipped.system.mag.max;
            const hasAmmo = actor.items.some((item) => item.type === "ammo" && item.system.calibre === equipped.system.ammoType);
            const reloadAP = Number(equipped.system.reloadAP) || 0;
            if (!full && hasAmmo) {
                this._addBtn(actions, `<span class="phud-icon">🔄</span> Перезарядить (${reloadAP} AP)`, () => actor.reloadWeapon(equipped), ap.value < reloadAP ? "disabled" : "", true);
            }
        }

        if (isMyTurn) {
            this._addBtn(actions, `<span class="phud-icon">⏭</span> Конец хода`, () => game.combat?.nextTurn(), "", true);
        }

        this._addBtn(actions, `<span class="phud-icon">📄</span> Открыть лист`, () => actor.sheet.render(true), "", true);
    }

    static _addBtn(container, label, onClick, cls = "", allowHtml = false) {
        const btn = document.createElement("button");
        btn.className = (`phud-btn ${cls}`).trim();
        if (allowHtml) btn.innerHTML = label;
        else btn.textContent = label;
        btn.disabled = cls === "disabled";
        if (!btn.disabled) {
            btn.addEventListener("mousedown", (event) => event.stopPropagation());
            btn.addEventListener("click", (event) => {
                event.stopPropagation();
                onClick();
            });
        }
        container.appendChild(btn);
    }
    static _addDebugRollPanel(container) {
        const value = Number(game.settings.get("zsystem", "forceD100Roll")) || 0;
        const panel = document.createElement("div");
        panel.className = "phud-debug-roll";
        panel.innerHTML = `
            <div class="phud-debug-roll__head">
                <span>Debug d100</span>
                <strong>${value > 0 ? value : "random"}</strong>
            </div>
            <div class="phud-debug-roll__main">
                <input type="number" min="0" max="100" step="1" value="${value}" title="0 = random, 1-100 = fixed d100" />
                <button type="button" data-value="0">0</button>
                <button type="button" data-value="1">1</button>
                <button type="button" data-value="5">5</button>
                <button type="button" data-value="6">6</button>
                <button type="button" data-value="95">95</button>
                <button type="button" data-value="96">96</button>
                <button type="button" data-value="100">100</button>
            </div>
        `;

        const input = panel.querySelector("input");
        const status = panel.querySelector("strong");
        const setForcedRoll = async (rawValue) => {
            const next = Math.max(0, Math.min(100, Math.floor(Number(rawValue) || 0)));
            await game.settings.set("zsystem", "forceD100Roll", next);
            input.value = String(next);
            status.textContent = next > 0 ? String(next) : "random";
            ui.notifications.info(next > 0 ? `Debug d100: ${next}` : "Debug d100: random");
        };

        panel.addEventListener("mousedown", (event) => event.stopPropagation());
        input.addEventListener("change", () => setForcedRoll(input.value));
        input.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
                event.preventDefault();
                setForcedRoll(input.value);
            }
        });
        panel.querySelectorAll("button[data-value]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                setForcedRoll(button.dataset.value);
            });
        });

        container.appendChild(panel);
    }
}
