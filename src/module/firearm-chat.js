import {
    buildAimingBallisticsPreview,
    tokenToBallisticPoint
} from "./firearm-preview.js";
import {
    resolveBurstBallistics,
    resolveJammedBurst,
    resolveSingleShotBallistics
} from "./firearm-ballistics.js";

export const FIREARM_BALLISTICS_CHAT_MODES = {
    off: "off",
    report: "report",
    manual: "manual",
    auto: "auto"
};

export function buildFirearmBallisticsChatContext({
    sourceToken,
    targetToken,
    item,
    attack,
    ammo = null,
    resultType = "success",
    location = "torso",
    damageType = "ballistic",
    mode = FIREARM_BALLISTICS_CHAT_MODES.manual,
    allowFailStray = mode !== FIREARM_BALLISTICS_CHAT_MODES.auto,
    burstOverride = null,
    random = Math.random
} = {}) {
    if (mode === FIREARM_BALLISTICS_CHAT_MODES.off) {
        return { enabled: false, mode, entries: [], burst: null };
    }

    const preview = buildAimingBallisticsPreview({
        sourceToken,
        targetToken,
        item,
        attack,
        ammo,
        location
    });
    if (!preview.enabled) return { enabled: false, mode, entries: [], burst: null };

    const profile = preview.profile;
    const burst = burstOverride || (profile.requestedShots > 1
        ? resolveJammedBurst({ requestedShots: profile.requestedShots, resultType, random })
        : null);
    const source = tokenToBallisticPoint(sourceToken, { location });
    const target = tokenToBallisticPoint(targetToken, { location });
    const bystanders = canvas.tokens.placeables
        .filter((token) => token !== sourceToken && token !== targetToken && token.visible !== false)
        .map((token) => tokenToBallisticPoint(token, { location }));
    const resolved = profile.requestedShots > 1
        ? resolveBurstBallistics({ source, target, bystanders, item, attack, ammo, resultType, burstOverride: burst, random })
        : resolveSingleShotBallistics({
            source,
            target,
            bystanders,
            item,
            attack,
            ammo,
            resultType,
            missMargin: resultType === "fail" && allowFailStray ? 8 : 999,
            random
        });
    const entries = resolved.impacts
        .filter((impact) => includeImpactInContext(impact, {
            resultType,
            allowFailStray,
            includePrimary: profile.requestedShots > 1
        }))
        .map((impact) => buildEntryFromImpact({
            impact,
            damageType,
            location,
            resultType: impact.kind === "primary" ? resultType : "success",
            traumaMultiplier: profile.traumaMultiplier
        }));

    return {
        enabled: true,
        mode,
        profile,
        ammo: profile.ammo || null,
        entries,
        burst: burst || resolved.burst || null
    };
}

export function buildFirearmBallisticsChatHtml(context) {
    if (!context?.enabled) return "";

    const showManualButtons = context.mode === FIREARM_BALLISTICS_CHAT_MODES.manual;
    const ammoLine = context.ammo
        ? `<div class="z-ballistics-chat-row"><b>Патрон:</b> ${escapeHtml(context.ammo.label)}${context.ammo.calibre ? ` · ${escapeHtml(context.ammo.calibre)}` : ""}</div>`
        : "";
    const burstLine = context.burst
        ? `<div class="z-ballistics-chat-row"><b>Очередь:</b> выпущено ${context.burst.firedShots}/${context.burst.requestedShots}${context.burst.interrupted ? " · клин оборвал очередь" : ""}</div>`
        : "";
    const entriesHtml = context.entries.length
        ? context.entries.map((entry) => `
            <div class="z-ballistics-chat-entry">
                <div><b>${entry.label}:</b> ${escapeHtml(entry.targetName)} · пуля ${entry.shot || 1} · урон ${entry.damage} · броня ${entry.armor}</div>
                ${showManualButtons && entry.kind !== "primary" ? buildManualDamageButton(entry) : ""}
            </div>
        `).join("")
        : `<div class="z-ballistics-chat-muted">Дополнительных целей по баллистике нет.</div>`;

    return `
        <div class="z-ballistics-chat">
            <div class="z-ballistics-chat-title">Баллистика</div>
            ${ammoLine}
            ${burstLine}
            ${entriesHtml}
            <div class="z-ballistics-chat-muted">${buildModeNote(context.mode)}</div>
        </div>
    `;
}

export async function applyFirearmBallisticsAuto(context, {
    applyDamage,
    postTrauma,
    notify = null
} = {}) {
    if (!context?.enabled || context.mode !== FIREARM_BALLISTICS_CHAT_MODES.auto) {
        return { applied: [], skipped: [] };
    }

    const applied = [];
    const skipped = [];

    for (const entry of context.entries || []) {
        if (entry.kind === "primary") continue;

        const target = await resolveEntryTarget(entry);
        const actor = target?.actor;

        if (!actor) {
            skipped.push({ entry, reason: "target-not-found" });
            continue;
        }

        const damage = Math.max(1, Number(entry.damage) || 1);
        const type = entry.damageType || "ballistic";
        const limb = entry.location || "torso";
        const armorPiercing = Math.max(0, Number(entry.armorPiercing) || 0);

        if (typeof applyDamage === "function") {
            await applyDamage({ actor, entry, damage, type, limb, armorPiercing });
        } else {
            await actor.applyDamage(damage, type, limb, false, true, { armorPiercing });
        }

        if (typeof postTrauma === "function") {
            await postTrauma({
                actor,
                damage,
                type,
                limb,
                resultType: entry.resultType || "success",
                severityMultiplier: entry.traumaMultiplier || 1
            });
        }

        applied.push({ entry, actor, damage, type, limb });
    }

    if (applied.length && typeof notify === "function") {
        notify(applied);
    }

    return { applied, skipped };
}

function includeImpactInContext(impact, { resultType, allowFailStray, includePrimary }) {
    if (!impact) return false;
    if (impact.kind === "primary") return includePrimary;
    if (impact.kind === "stray") return resultType !== "fail" || allowFailStray;
    return true;
}

function buildEntryFromImpact({ impact, damageType, location, resultType = "success", traumaMultiplier = 1 }) {
    const target = impact.target || {};
    const token = target.token;

    return {
        kind: impact.kind,
        label: getImpactLabel(impact.kind),
        targetName: target.name || target.id || impact.targetId,
        tokenUuid: token?.document?.uuid || "",
        shot: impact.shot || 1,
        damage: Math.max(1, Math.round(impact.damage || 1)),
        armor: impact.effectiveArmor ?? impact.armor ?? 0,
        armorPiercing: Math.max(0, Number(impact.armorPiercing) || 0),
        damageType,
        location,
        resultType,
        traumaMultiplier,
        risk: impact.risk
    };
}

function getImpactLabel(kind) {
    if (kind === "primary") return "Попадание";
    if (kind === "overpenetration") return "Прошивание";
    if (kind === "stray") return "Случайное попадание";
    if (kind === "burst-cone") return "Очередь задела";
    return "Попадание";
}

function buildManualDamageButton(entry) {
    return `
        <button type="button"
            class="z-apply-ballistic-damage"
            data-token-uuid="${escapeHtml(entry.tokenUuid)}"
            data-damage="${entry.damage}"
            data-type="${escapeHtml(entry.damageType)}"
            data-limb="${escapeHtml(entry.location)}"
            data-armor-piercing="${entry.armorPiercing}"
            data-trauma-multiplier="${entry.traumaMultiplier || 1}"
            data-result-type="${escapeHtml(entry.resultType)}">
            Применить к ${escapeHtml(entry.targetName)}
        </button>
    `;
}

function buildModeNote(mode) {
    if (mode === FIREARM_BALLISTICS_CHAT_MODES.manual) return "Побочные попадания применяются вручную ГМом.";
    if (mode === FIREARM_BALLISTICS_CHAT_MODES.auto) return "Авто-режим: побочные попадания применяются сразу.";
    return "Режим отчёта: урон не применяется.";
}

async function resolveEntryTarget(entry) {
    if (!entry?.tokenUuid || typeof fromUuid !== "function") return null;
    const doc = await fromUuid(entry.tokenUuid);
    const token = doc?.object || doc;
    return {
        token,
        actor: token?.actor || doc?.actor || doc
    };
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
