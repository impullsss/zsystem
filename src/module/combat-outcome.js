import { resolveCritFailEffects } from "./combat-fumble.js";

export const COMBAT_OUTCOME = {
    critSuccess: "crit-success",
    success: "success",
    fail: "fail",
    critFail: "crit-fail"
};

const OUTCOME_TEXT = {
    [COMBAT_OUTCOME.critSuccess]: {
        title: "\u041a\u0440\u0438\u0442. \u0443\u0441\u043f\u0435\u0445",
        description: "\u0423\u0440\u043e\u043d x1.5. \u042d\u0442\u043e \u0431\u0430\u0437\u0430 \u0434\u043b\u044f \u0441\u0438\u043b\u044c\u043d\u044b\u0445 \u0442\u0440\u0430\u0432\u043c, \u043f\u0440\u043e\u0431\u0438\u0442\u0438\u044f \u0438 \u0434\u043e\u043f. \u044d\u0444\u0444\u0435\u043a\u0442\u043e\u0432.",
        tone: "success"
    },
    [COMBAT_OUTCOME.success]: {
        title: "\u041f\u043e\u043f\u0430\u0434\u0430\u043d\u0438\u0435",
        description: "",
        tone: "success"
    },
    [COMBAT_OUTCOME.fail]: {
        title: "\u041f\u0440\u043e\u043c\u0430\u0445",
        description: "\u0410\u0442\u0430\u043a\u0430 \u043d\u0435 \u0434\u043e\u0441\u0442\u0438\u0433\u043b\u0430 \u0446\u0435\u043b\u0438.",
        tone: "fail"
    },
    [COMBAT_OUTCOME.critFail]: {
        title: "\u041a\u0440\u0438\u0442. \u043f\u0440\u043e\u0432\u0430\u043b",
        description: "\u0410\u0442\u0430\u043a\u0430 \u0441\u043e\u0440\u0432\u0430\u043b\u0430\u0441\u044c. AP \u0438 \u0440\u0435\u0441\u0443\u0440\u0441\u044b \u0430\u0442\u0430\u043a\u0438 \u0443\u0436\u0435 \u043f\u043e\u0442\u0440\u0430\u0447\u0435\u043d\u044b.",
        tone: "danger"
    }
};

const CRIT_FAIL_EFFECT_LABELS = {
    jam: "\u043a\u043b\u0438\u043d",
    "durability-loss": "\u0438\u0437\u043d\u043e\u0441",
    "extra-noise": "\u0448\u0443\u043c",
    "off-balance": "\u043f\u043e\u0442\u0435\u0440\u044f \u0440\u0430\u0432\u043d\u043e\u0432\u0435\u0441\u0438\u044f",
    "weapon-drop": "\u0432\u044b\u043f\u0430\u0434\u0435\u043d\u0438\u0435 \u043e\u0440\u0443\u0436\u0438\u044f",
    "bad-scatter": "\u043d\u0435\u0443\u0434\u0430\u0447\u043d\u044b\u0439 \u0440\u0430\u0437\u043b\u0451\u0442",
    "item-lost": "\u043f\u043e\u0442\u0435\u0440\u044f \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0430"
};

const CRIT_FAIL_PROFILE_LABELS = {
    ranged: "\u043e\u0433\u043d\u0435\u0441\u0442\u0440\u0435\u043b",
    melee: "\u0431\u043b\u0438\u0436\u043d\u0438\u0439 \u0431\u043e\u0439",
    throwing: "\u043c\u0435\u0442\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0435"
};

function buildCritFailHint(item, attack, ammo, random) {
    const resolution = resolveCritFailEffects({ item, attack, ammo, random });
    const profile = resolution.profile;

    return {
        key: profile.key,
        label: CRIT_FAIL_PROFILE_LABELS[profile.key] || profile.label,
        effects: profile.effects.map((effect) => {
            const rolled = resolution.effects.find((candidate) => candidate.key === effect.key);
            return {
                key: effect.key,
                label: CRIT_FAIL_EFFECT_LABELS[effect.key] || effect.label,
                chance: effect.chance,
                roll: rolled?.roll ?? 1,
                triggered: rolled?.triggered ?? false
            };
        }),
        triggeredEffects: resolution.triggeredEffects.map((effect) => effect.key)
    };
}

function hasCritFailEffect(hint, key) {
    return hint?.effects?.some((effect) => effect.key === key) || false;
}

function getExtraNoiseAmount(item, attack) {
    const itemNoise = Number(item?.system?.noise) || 0;
    const attackNoise = Number(attack?.noise) || 0;
    return Math.max(5, itemNoise + attackNoise);
}

export function buildCombatOutcomeContext({ resultType, item = null, attack = null, ammo = null, random = Math.random } = {}) {
    const text = OUTCOME_TEXT[resultType] || OUTCOME_TEXT[COMBAT_OUTCOME.fail];
    const weaponType = item?.system?.weaponType || "";
    const isRanged = weaponType !== "melee";
    const critMultiplier = Number(item?.system?.critMult) > 0
        ? Number(item.system.critMult)
        : 1.5;
    const critFailHint = resultType === COMBAT_OUTCOME.critFail
        ? buildCritFailHint(item, attack, ammo, random)
        : null;

    const description = resultType === COMBAT_OUTCOME.critSuccess
        ? `\u0423\u0440\u043e\u043d x${critMultiplier}. \u042d\u0442\u043e \u0431\u0430\u0437\u0430 \u0434\u043b\u044f \u0441\u0438\u043b\u044c\u043d\u044b\u0445 \u0442\u0440\u0430\u0432\u043c, \u043f\u0440\u043e\u0431\u0438\u0442\u0438\u044f \u0438 \u0434\u043e\u043f. \u044d\u0444\u0444\u0435\u043a\u0442\u043e\u0432.`
        : text.description;

    return {
        resultType,
        weaponType,
        isRanged,
        actorUuid: item?.parent?.uuid || "",
        itemUuid: item?.uuid || "",
        itemName: item?.name || "",
        critMultiplier,
        critFailHint,
        extraNoiseAmount: hasCritFailEffect(critFailHint, "extra-noise")
            ? getExtraNoiseAmount(item, attack)
            : 0,
        ...text,
        description,
        mechanicalEffects: resultType === COMBAT_OUTCOME.critSuccess
            ? [{ key: "damage-multiplier", value: critMultiplier }]
            : []
    };
}

export function buildCombatOutcomeHtml(outcome) {
    if (!outcome || outcome.resultType === COMBAT_OUTCOME.success) return "";

    const triggered = new Set(outcome.critFailHint?.triggeredEffects || []);
    const critFailHintHtml = outcome.critFailHint
        ? `<div class="z-combat-outcome-hint">
            <em>\u041f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u044f \u043a\u0440\u0438\u0442. \u043f\u0440\u043e\u0432\u0430\u043b\u0430 (${escapeHtml(outcome.critFailHint.label)}):</em>
            <span>${outcome.critFailHint.effects.map(formatCritFailEffect).join(", ")}</span>
            <small>\u041a\u043d\u043e\u043f\u043a\u0438 \u043d\u0438\u0436\u0435 \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u044e\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0441\u0440\u0430\u0431\u043e\u0442\u0430\u0432\u0448\u0438\u0435 \u043f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u044f.</small>
            ${buildCritFailButtons(outcome, triggered)}
        </div>`
        : "";

    return `
        <div class="z-combat-outcome z-combat-outcome--${outcome.tone}">
            <strong>${escapeHtml(outcome.title)}</strong>
            ${outcome.description ? `<span>${escapeHtml(outcome.description)}</span>` : ""}
            ${critFailHintHtml}
        </div>`;
}

function buildCritFailButtons(outcome, triggered) {
    return [
        outcome.itemUuid && triggered.has("jam")
            ? `<button type="button" class="z-apply-weapon-jam" data-item-uuid="${escapeHtml(outcome.itemUuid)}">\u0417\u0430\u043a\u043b\u0438\u043d\u0438\u0442\u044c \u043e\u0440\u0443\u0436\u0438\u0435</button>`
            : "",
        outcome.itemUuid && triggered.has("durability-loss")
            ? `<button type="button" class="z-apply-weapon-wear" data-item-uuid="${escapeHtml(outcome.itemUuid)}" data-amount="1">\u0418\u0437\u043d\u043e\u0441 \u043e\u0440\u0443\u0436\u0438\u044f -1</button>`
            : "",
        outcome.extraNoiseAmount > 0 && triggered.has("extra-noise")
            ? `<button type="button" class="z-apply-extra-noise" data-amount="${outcome.extraNoiseAmount}">\u041b\u0438\u0448\u043d\u0438\u0439 \u0448\u0443\u043c +${outcome.extraNoiseAmount}</button>`
            : "",
        outcome.actorUuid && triggered.has("off-balance")
            ? `<button type="button" class="z-apply-actor-status" data-actor-uuid="${escapeHtml(outcome.actorUuid)}" data-effect="prone">\u0421\u0431\u0438\u0442\u044c \u0430\u0442\u0430\u043a\u0443\u044e\u0449\u0435\u0433\u043e \u0441 \u043d\u043e\u0433</button>`
            : "",
        outcome.itemUuid && triggered.has("weapon-drop")
            ? `<button type="button" class="z-apply-weapon-drop" data-item-uuid="${escapeHtml(outcome.itemUuid)}">\u041e\u0440\u0443\u0436\u0438\u0435 \u0432\u044b\u043f\u0430\u043b\u043e \u0438\u0437 \u0440\u0443\u043a</button>`
            : "",
        outcome.itemUuid && triggered.has("item-lost")
            ? `<button type="button" class="z-apply-item-lost" data-item-uuid="${escapeHtml(outcome.itemUuid)}" data-amount="1">\u041f\u0440\u0435\u0434\u043c\u0435\u0442 \u043f\u043e\u0442\u0435\u0440\u044f\u043d</button>`
            : "",
        triggered.has("bad-scatter")
            ? `<button type="button" class="z-roll-bad-scatter" data-item-name="${escapeHtml(outcome.itemName)}">\u041f\u043b\u043e\u0445\u043e\u0439 \u0440\u0430\u0437\u043b\u0451\u0442</button>`
            : ""
    ].filter(Boolean).join("");
}

function formatCritFailEffect(effect) {
    const chance = Math.round(effect.chance * 100);
    const roll = Math.max(1, Math.ceil(effect.roll * 100));
    const state = effect.triggered ? "\u0441\u0440\u0430\u0431\u043e\u0442\u0430\u043b\u043e" : "\u043d\u0435\u0442";
    return `${state}: ${escapeHtml(effect.label)} (${roll}/${chance})`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
