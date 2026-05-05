import { openSocialCheckDialog } from "./apps/social-check-dialog.js";
import { openCommunicationDialog } from "./apps/communication-dialog.js";
import { openSkillCheckDialog } from "./apps/skill-check-dialog.js";
import {
    Z_SOCIAL_ATTITUDES,
    Z_SOCIAL_PRESETS,
    getSocialAttitudeMeta,
    getSocialPresetLabel
} from "./social-check.js";

function getDirectoryActor(li) {
    const id = li.data("documentId") || li.data("entryId") || li.attr("data-document-id") || li.attr("data-entry-id");
    return game.actors.get(id);
}

let activeSocialProfilePalette = null;
let activeSocialPaletteCleanup = null;

function closeSocialProfilePalette() {
    activeSocialPaletteCleanup?.();
    activeSocialPaletteCleanup = null;
    activeSocialProfilePalette?.remove();
    activeSocialProfilePalette = null;
}

function resolveTokenPalettePosition(anchorEl) {
    const width = 200;
    const height = 170;
    const margin = 12;
    const rect = anchorEl.getBoundingClientRect();
    const canOpenRight = rect.right + 8 + width <= window.innerWidth - margin;
    const x = canOpenRight ? rect.right + 8 : rect.left - width - 8;
    const y = Math.max(margin, Math.min(rect.top - 8, window.innerHeight - height - margin));
    return { x, y };
}

export function openSocialProfileDialog(actor, { tokenDocument = null, onChange = null } = {}) {
    if (!actor) return null;

    const attitude = actor.system.social?.attitude || "neutral";
    const preset = actor.system.social?.preset || "normal";

    const content = `
        <div class="z-social-dialog-form">
            <div class="form-group">
                <label>Отношение</label>
                <select name="social-attitude">
                    ${Object.entries(Z_SOCIAL_ATTITUDES).map(([key, label]) => `<option value="${key}" ${key === attitude ? "selected" : ""}>${label}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label>Пресет сложности</label>
                <select name="social-preset">
                    ${Object.entries(Z_SOCIAL_PRESETS).map(([key, label]) => `<option value="${key}" ${key === preset ? "selected" : ""}>${label}</option>`).join("")}
                </select>
            </div>
        </div>
    `;

    return new Dialog({
        title: `Отношение: ${actor.name}`,
        content,
        render: (html) => {
            const applyChanges = async () => {
                const attitudeValue = html.find('[name="social-attitude"]').val();
                const presetValue = html.find('[name="social-preset"]').val();
                await actor.update({
                    "system.social.attitude": attitudeValue,
                    "system.social.preset": presetValue
                });
                if (typeof onChange === "function") onChange({ attitude: attitudeValue, preset: presetValue });
            };

            html.find('[name="social-attitude"]').on("change", applyChanges);
            html.find('[name="social-preset"]').on("change", applyChanges);
        },
        buttons: {
            communication: {
                label: "Общение",
                callback: () => openCommunicationDialog(canvas.tokens.controlled[0]?.actor || actor, {
                    targetUuid: tokenDocument?.uuid || ""
                })
            },
            cancel: {
                label: "Закрыть"
            }
        },
        default: "close"
    }, {
        width: 420,
        classes: ["z-social-profile-dialog"]
    }).render(true);
}

export function openSocialProfilePalette(actor, { tokenDocument = null, anchorEl = null, onChange = null } = {}) {
    if (!actor || !(anchorEl instanceof HTMLElement)) return null;

    closeSocialProfilePalette();

    const palette = document.createElement("div");
    palette.className = "z-social-profile-palette";

    const renderPalette = () => {
        const attitude = actor.system.social?.attitude || "neutral";
        const preset = actor.system.social?.preset || "normal";

        palette.innerHTML = `
            <div class="z-social-profile-section">
                <div class="z-social-profile-section-label">Отношение</div>
                <div class="z-social-profile-grid z-social-profile-grid--compact">
                    ${Object.entries(Z_SOCIAL_ATTITUDES).map(([key, label]) => {
                        const meta = getSocialAttitudeMeta(key);
                        const active = key === attitude ? " is-active" : "";
                        return `<button type="button" class="z-social-profile-btn z-social-profile-btn--icon${active}" data-action="attitude" data-value="${key}" title="${label}" style="--social-accent:${meta.color};">${meta.icon}</button>`;
                    }).join("")}
                </div>
            </div>
            <div class="z-social-profile-section">
                <div class="z-social-profile-section-label">Пресет сложности</div>
                <div class="z-social-profile-grid z-social-profile-grid--compact">
                    ${Object.entries(Z_SOCIAL_PRESETS).map(([key, label]) => {
                        const short = key === "easy" ? "🙂" : key === "normal" ? "😐" : "😣";
                        const active = key === preset ? " is-active" : "";
                        return `<button type="button" class="z-social-profile-btn z-social-profile-btn--icon${active}" data-action="preset" data-value="${key}" title="${label}">${short}</button>`;
                    }).join("")}
                </div>
            </div>
        `;

        palette.querySelectorAll("[data-action='attitude']").forEach((button) => {
            button.addEventListener("click", async (event) => {
                const value = event.currentTarget.dataset.value;
                await actor.update({ "system.social.attitude": value });
                renderPalette();
                if (typeof onChange === "function") onChange({ attitude: value, preset: actor.system.social?.preset || "normal" });
            });
        });

        palette.querySelectorAll("[data-action='preset']").forEach((button) => {
            button.addEventListener("click", async (event) => {
                const value = event.currentTarget.dataset.value;
                await actor.update({ "system.social.preset": value });
                renderPalette();
                if (typeof onChange === "function") onChange({ attitude: actor.system.social?.attitude || "neutral", preset: value });
            });
        });
    };

    renderPalette();
    document.body.appendChild(palette);

    const { x, y } = resolveTokenPalettePosition(anchorEl);
    palette.style.left = `${x}px`;
    palette.style.top = `${y}px`;

    const handleOutsideClick = (event) => {
        if (!palette.contains(event.target) && !anchorEl.contains(event.target)) closeSocialProfilePalette();
    };

    const cleanup = () => document.removeEventListener("mousedown", handleOutsideClick, true);
    activeSocialProfilePalette = palette;
    activeSocialPaletteCleanup = cleanup;
    setTimeout(() => document.addEventListener("mousedown", handleOutsideClick, true), 0);

    return palette;
}

export class ZSystemActions {
    static async interact() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken) return ui.notifications.warn("Сначала выделите своего персонажа!");

        const targets = canvas.tokens.placeables.filter((token) => {
            if (token.id === myToken.id || !token.actor) return false;
            return canvas.grid.measureDistance(myToken, token) <= 3.5;
        });

        if (targets.length === 0) return ui.notifications.warn("Рядом нет ничего интересного.");

        targets.sort((a, b) => canvas.grid.measureDistance(myToken, a) - canvas.grid.measureDistance(myToken, b));
        const target = targets[0];
        target.actor.sheet.render(true);
        ui.notifications.info(`Взаимодействие с ${target.name}`);
    }

    static async manualSearch() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken) return ui.notifications.warn("Сначала выделите своего персонажа!");

        const actor = myToken.actor;
        const per = actor.system.attributes.per.value;
        const roll = new Roll("1d10 + @per", { per });
        await roll.evaluate();

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `<b>${actor.name}</b> внимательно осматривает местность...`
        });

        const searchResult = roll.total;
        let foundCount = 0;
        const hiddenTokens = canvas.tokens.placeables.filter((token) => token.document.hidden);

        for (const token of hiddenTokens) {
            const targetActor = token.actor;
            if (!targetActor) continue;
            const sys = targetActor.system.attributes;
            const spotDC = sys?.spotDC?.value || 15;
            const spotRadius = sys?.spotRadius?.value || 5;
            const dist = canvas.grid.measureDistance(myToken, token);
            if (dist <= spotRadius && searchResult >= spotDC) {
                await token.document.update({ hidden: false });
                canvas.interface.createScrollingText(token.center, "Найдено!", {
                    fill: "#ffeb3b",
                    stroke: 0x000000,
                    fontSize: 32,
                    fontWeight: "bold"
                });
                foundCount++;
            }
        }

        if (foundCount > 0) ui.notifications.info(`Вы обнаружили что-то интересное! (${foundCount} шт.)`);
        else this._visualizeSearchRadius(myToken, 5);
    }

    static async socialCheck() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken?.actor) return ui.notifications.warn("Сначала выделите своего персонажа!");
        openSocialCheckDialog(myToken.actor);
    }

    static async communicate() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken?.actor) return ui.notifications.warn("Сначала выделите своего персонажа!");
        openCommunicationDialog(myToken.actor);
    }

    static async _visualizeSearchRadius(token, radius) {
        const templateData = {
            t: "circle",
            user: game.user.id,
            distance: radius,
            direction: 0,
            x: token.center.x,
            y: token.center.y,
            fillColor: "#512da8",
            alpha: 0.1,
            borderColor: "#9575cd"
        };
        const doc = (await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]))[0];
        setTimeout(() => { if (doc) doc.delete(); }, 1500);
    }

    static initHooks() {
        Hooks.on("hotbarDrop", (bar, data, slot) => {
            if (data.type !== "Item") return true;
            ZSystemActions._createItemMacro(data, slot);
            return false;
        });

        game.zsystem = game.zsystem || {};
        game.zsystem.openSocialCheck = (actorRef = null, options = {}) => {
            if (!actorRef) return openSocialCheckDialog(canvas.tokens.controlled[0]?.actor, options);
            if (typeof actorRef === "string") {
                const actor = game.actors.get(actorRef) || canvas.tokens.get(actorRef)?.actor;
                return openSocialCheckDialog(actor, options);
            }
            return openSocialCheckDialog(actorRef, options);
        };
        game.zsystem.openCommunication = (actorRef = null, options = {}) => {
            if (!actorRef) return openCommunicationDialog(canvas.tokens.controlled[0]?.actor, options);
            if (typeof actorRef === "string") {
                const actor = game.actors.get(actorRef) || canvas.tokens.get(actorRef)?.actor;
                return openCommunicationDialog(actor, options);
            }
            return openCommunicationDialog(actorRef, options);
        };
        game.zsystem.openSkillCheck = (actorRef = null, options = {}) => {
            if (!actorRef) return openSkillCheckDialog(canvas.tokens.controlled[0]?.actor, options);
            if (typeof actorRef === "string") {
                const actor = game.actors.get(actorRef) || canvas.tokens.get(actorRef)?.actor;
                return openSkillCheckDialog(actor, options);
            }
            return openSkillCheckDialog(actorRef, options);
        };
        game.zsystem.openSocialPalette = (actorRef = null, options = {}) => {
            if (!actorRef) return openSocialProfilePalette(canvas.tokens.controlled[0]?.actor, options);
            if (typeof actorRef === "string") {
                const actor = game.actors.get(actorRef) || canvas.tokens.get(actorRef)?.actor;
                return openSocialProfilePalette(actor, options);
            }
            return openSocialProfilePalette(actorRef, options);
        };
        game.zsystem.openSocialProfileDialog = (actorRef = null, options = {}) => {
            if (!actorRef) return openSocialProfileDialog(canvas.tokens.controlled[0]?.actor, options);
            if (typeof actorRef === "string") {
                const actor = game.actors.get(actorRef) || canvas.tokens.get(actorRef)?.actor;
                return openSocialProfileDialog(actor, options);
            }
            return openSocialProfileDialog(actorRef, options);
        };
        game.zsystem.rollItemMacro = (itemName) => {
            const speaker = ChatMessage.getSpeaker();
            let actor;
            if (speaker.token) actor = canvas.tokens.get(speaker.token).actor;
            if (!actor) actor = game.actors.get(speaker.actor);
            if (!actor) return ui.notifications.warn("Сначала выберите токен персонажа!");
            const item = actor.items.find((entry) => entry.name === itemName);
            if (!item) return ui.notifications.warn(`У персонажа ${actor.name} нет предмета "${itemName}"`);
            return actor.performAttack(item.id);
        };
    }

    static async _createItemMacro(data, slot) {
        const item = await fromUuid(data.uuid);
        if (!item || item.type !== "weapon") {
            return ui.notifications.warn("На панель можно выносить только оружие.");
        }
        const command = `game.zsystem.rollItemMacro("${item.name}");`;
        let macro = game.macros.find((entry) => entry.name === item.name && entry.command === command);
        if (!macro) {
            macro = await Macro.create({
                name: item.name,
                type: "script",
                img: item.img,
                command,
                flags: { "zsystem.itemMacro": true }
            });
        }
        game.user.assignHotbarMacro(macro, slot);
    }
}

Hooks.on("getSceneControlButtons", (controls) => {
    const zControl = {
        name: "zsystem-actions",
        title: "Действия выживания",
        layer: "tokens",
        icon: "fas fa-biohazard",
        visible: true,
        tools: [
            { name: "z-interact", title: "Взаимодействовать", icon: "fas fa-hand-paper", button: true, onClick: () => ZSystemActions.interact() },
            { name: "z-communication", title: "Общение", icon: "fas fa-user-friends", button: true, onClick: () => ZSystemActions.communicate() },
            { name: "z-social", title: "Социальная проверка", icon: "fas fa-comments", button: true, onClick: () => ZSystemActions.socialCheck() },
            { name: "z-search", title: "Поиск (Восприятие)", icon: "fas fa-search", button: true, onClick: () => ZSystemActions.manualSearch() }
        ]
    };
    if (Array.isArray(controls)) controls.push(zControl);
    else controls["zsystem-actions"] = zControl;
});

Hooks.on("renderTokenHUD", (hud, html, data) => {
    if (!game.user.isGM) return;

    const token = canvas.tokens.get(data._id);
    const actor = token?.actor;
    if (!actor || !["npc", "survivor"].includes(actor.type)) return;

    const root = html instanceof HTMLElement ? html : html?.[0] || html?.element?.[0] || null;
    const right = root?.querySelector(".right");
    if (!right || root.querySelector(".control-icon.z-social-attitude")) return;

    const attitude = actor.system.social?.attitude || "neutral";
    const meta = getSocialAttitudeMeta(attitude);

    const attitudeBtn = document.createElement("div");
    attitudeBtn.className = "control-icon z-social-attitude";
    attitudeBtn.title = "Отношение";
    attitudeBtn.style.borderColor = meta.color;
    attitudeBtn.style.padding = "0";
    attitudeBtn.style.fontSize = "0";
    attitudeBtn.style.lineHeight = "0";
    attitudeBtn.style.overflow = "hidden";
    attitudeBtn.style.display = "flex";
    attitudeBtn.style.alignItems = "center";
    attitudeBtn.style.justifyContent = "center";
    attitudeBtn.style.boxSizing = "border-box";
    attitudeBtn.innerHTML = `<span class="z-social-attitude-icon" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:22px;line-height:1;font-style:normal;">${meta.icon}</span>`;

    attitudeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSocialProfilePalette(actor, {
            tokenDocument: token.document,
            anchorEl: attitudeBtn,
            onChange: () => hud.render()
        });
    });

    right.append(attitudeBtn);
});

Hooks.on("getActorDirectoryEntryContext", (_html, options) => {
    options.push({
        name: "Отношение",
        icon: '<i class="fas fa-face-smile"></i>',
        condition: (li) => {
            const actor = getDirectoryActor(li);
            return game.user.isGM && actor && ["npc", "survivor"].includes(actor.type);
        },
        callback: async (li) => {
            const actor = getDirectoryActor(li);
            if (actor) openSocialProfileDialog(actor);
        }
    });
    options.push({
        name: "Открыть общение",
        icon: '<i class="fas fa-comments"></i>',
        condition: (li) => {
            const actor = getDirectoryActor(li);
            return actor && ["survivor", "npc"].includes(actor.type);
        },
        callback: async (li) => {
            const actor = getDirectoryActor(li);
            const speaker = canvas.tokens.controlled[0]?.actor || actor;
            if (speaker) openCommunicationDialog(speaker, {});
        }
    });
});
