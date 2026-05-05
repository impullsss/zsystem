import {
    findBurstConeCandidates,
    findFireLineCandidates,
    getFirearmProfile
} from "./firearm-ballistics.js";
import { getBallisticArmor } from "./protection.js";

export function tokenToBallisticPoint(token, { location = "torso" } = {}) {
    if (!token) return null;

    return {
        id: token.id,
        name: token.name || token.actor?.name || token.id,
        x: token.center?.x ?? token.x ?? 0,
        y: token.center?.y ?? token.y ?? 0,
        radius: Math.max(token.w || 0, token.h || 0, canvas?.grid?.size || 100) / 2,
        armor: getTokenBallisticArmor(token, location),
        token
    };
}

export function getTokenBallisticArmor(token, location = "torso") {
    const actor = token?.actor;
    if (!actor) return 0;
    return getBallisticArmor(actor, location);
}

export function buildAimingBallisticsPreview({
    sourceToken,
    targetToken,
    item,
    attack,
    ammo = null,
    location = "torso",
    tokens = null
} = {}) {
    const profile = getFirearmProfile(item, attack, ammo);

    if (profile.weaponType !== "ranged" || attack?.mode === "throw" || item?.system?.isThrowing === true) {
        return {
            enabled: false,
            profile,
            lineRisks: [],
            coneRisks: []
        };
    }

    const source = tokenToBallisticPoint(sourceToken, { location });
    const target = tokenToBallisticPoint(targetToken, { location });
    const gridSize = canvas?.grid?.size || 100;
    const candidates = (tokens || canvas?.tokens?.placeables || [])
        .filter((token) => token?.visible !== false)
        .filter((token) => token?.id !== sourceToken?.id && token?.id !== targetToken?.id)
        .map((token) => tokenToBallisticPoint(token, { location }))
        .filter(Boolean);

    if (!source || !target) {
        return {
            enabled: false,
            profile,
            lineRisks: [],
            coneRisks: []
        };
    }

    const lineRisks = findFireLineCandidates({
        source,
        target,
        candidates,
        lineWidth: profile.lineWidth * gridSize
    });
    const coneRisks = profile.requestedShots > 1
        ? findBurstConeCandidates({
            source,
            target,
            candidates: [target, ...candidates],
            coneAngle: profile.burstConeAngle,
            maxDistance: distance(source, target) + (3 * gridSize)
        })
        : [];

    return {
        enabled: true,
        profile,
        lineRisks,
        coneRisks
    };
}

export function buildAimingBallisticsPreviewHtml(preview) {
    if (!preview?.enabled) return "";

    const lines = [];
    const lineRiskNames = preview.lineRisks
        .filter((risk) => risk.onLine)
        .slice(0, 3)
        .map((risk) => escapeHtml(risk.token.name || risk.id));
    const behindNames = preview.lineRisks
        .filter((risk) => risk.behindTarget)
        .slice(0, 3)
        .map((risk) => escapeHtml(risk.token.name || risk.id));
    const coneNames = preview.coneRisks
        .filter((risk) => risk.id !== preview.coneRisks[0]?.id)
        .slice(0, 4)
        .map((risk) => escapeHtml(risk.token.name || risk.id));

    if (lineRiskNames.length) {
        lines.push(`<div class="z-ballistics-row z-ballistics-row--warn"><span>На линии:</span><span>${lineRiskNames.join(", ")}</span></div>`);
    }
    if (behindNames.length) {
        lines.push(`<div class="z-ballistics-row"><span>За целью:</span><span>${behindNames.join(", ")}</span></div>`);
    }
    if (preview.profile.requestedShots > 1) {
        lines.push(`<div class="z-ballistics-row"><span>Очередь:</span><span>${preview.profile.requestedShots} пт., ${preview.profile.burstConeAngle}°</span></div>`);
        if (coneNames.length) {
            lines.push(`<div class="z-ballistics-row z-ballistics-row--warn"><span>В конусе:</span><span>${coneNames.join(", ")}</span></div>`);
        }
        lines.push(`<div class="z-ballistics-note">клин может оборвать очередь</div>`);
    }
    if (!lines.length) return "";

    return `
        <div class="z-ballistics-preview">
            <div class="z-ballistics-title">Баллистика</div>
            ${lines.join("")}
        </div>
    `;
}

function distance(a, b) {
    return Math.hypot((Number(b?.x) || 0) - (Number(a?.x) || 0), (Number(b?.y) || 0) - (Number(a?.y) || 0));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
