export const TRAUMA_SEVERITY = {
    none: "none",
    light: "light",
    serious: "serious",
    critical: "critical"
};

export const TRAUMA_MODE = {
    off: "off",
    report: "report",
    manual: "manual"
};

const BLEEDING_DAMAGE_TYPES = new Set(["slashing", "piercing", "ballistic"]);

const LIMB_LABELS = {
    head: "\u0433\u043e\u043b\u043e\u0432\u0430",
    torso: "\u0442\u043e\u0440\u0441",
    lArm: "\u043b\u0435\u0432\u0430\u044f \u0440\u0443\u043a\u0430",
    rArm: "\u043f\u0440\u0430\u0432\u0430\u044f \u0440\u0443\u043a\u0430",
    lLeg: "\u043b\u0435\u0432\u0430\u044f \u043d\u043e\u0433\u0430",
    rLeg: "\u043f\u0440\u0430\u0432\u0430\u044f \u043d\u043e\u0433\u0430"
};

const SEVERITY_LABELS = {
    [TRAUMA_SEVERITY.light]: "\u043b\u0451\u0433\u043a\u0430\u044f \u0442\u0440\u0430\u0432\u043c\u0430",
    [TRAUMA_SEVERITY.serious]: "\u0441\u0435\u0440\u044c\u0451\u0437\u043d\u0430\u044f \u0442\u0440\u0430\u0432\u043c\u0430",
    [TRAUMA_SEVERITY.critical]: "\u043a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0442\u0440\u0430\u0432\u043c\u0430"
};

export function resolveTraumaOutcome({
    damage = 0,
    maxHp = 1,
    limbMax = 1,
    location = "torso",
    damageType = "blunt",
    resultType = "success",
    targetUuid = "",
    targetName = "",
    severityMultiplier = 1
} = {}) {
    const finalDamage = Math.max(0, Number(damage) || 0);
    if (finalDamage <= 0) return emptyTrauma();

    const multiplier = clamp(Number(severityMultiplier) || 1, 0, 5);
    const hpPressure = finalDamage / Math.max(1, Number(maxHp) || 1);
    const limbPressure = finalDamage / Math.max(1, Number(limbMax) || 1);
    const critBonus = resultType === "crit-success" ? 0.2 : 0;
    const rawPressure = Math.max(hpPressure * 1.7, limbPressure) + critBonus;
    const pressure = rawPressure * multiplier;
    const severity = getSeverity(pressure);

    if (severity === TRAUMA_SEVERITY.none) {
        return emptyTrauma({
            pressure: Number(pressure.toFixed(2)),
            rawPressure: Number(rawPressure.toFixed(2)),
            severityMultiplier: multiplier
        });
    }

    const effects = buildTraumaEffects({
        severity,
        location,
        damageType
    });

    return {
        enabled: true,
        severity,
        severityLabel: SEVERITY_LABELS[severity],
        pressure: Number(pressure.toFixed(2)),
        rawPressure: Number(rawPressure.toFixed(2)),
        severityMultiplier: multiplier,
        damage: finalDamage,
        location,
        locationLabel: LIMB_LABELS[location] || location,
        damageType,
        targetUuid,
        targetName,
        effects
    };
}

export function buildTraumaHtml(trauma, { mode = TRAUMA_MODE.manual } = {}) {
    if (!trauma?.enabled || mode === TRAUMA_MODE.off) return "";

    const canApplyEffects = mode === TRAUMA_MODE.manual && trauma.effects.length > 0;
    const effectsHtml = canApplyEffects
        ? trauma.effects.map((effect) => buildTraumaButton(trauma, effect)).join("")
        : buildTraumaDescription(trauma, mode);

    const modeNote = mode === TRAUMA_MODE.manual
        ? "\u0413\u041c \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u0435\u0442 \u043f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u044f \u0432\u0440\u0443\u0447\u043d\u0443\u044e."
        : "\u0420\u0435\u0436\u0438\u043c \u043e\u0442\u0447\u0451\u0442\u0430: \u043c\u0435\u0445\u0430\u043d\u0438\u043a\u0430 \u043d\u0435 \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f.";

    return `
        <div class="z-trauma-chat z-trauma-chat--${trauma.severity}">
            <div class="z-trauma-title">\u0422\u0440\u0430\u0432\u043c\u0430: ${escapeHtml(trauma.severityLabel)}</div>
            <div class="z-trauma-row">
                ${escapeHtml(trauma.targetName)} &middot; ${escapeHtml(trauma.locationLabel)} &middot; \u0443\u0440\u043e\u043d ${trauma.damage} &middot; \u0434\u0430\u0432\u043b\u0435\u043d\u0438\u0435 ${Math.round(trauma.pressure * 100)}%
            </div>
            ${effectsHtml}
            <div class="z-trauma-muted">${modeNote}</div>
        </div>
    `;
}

function buildTraumaDescription(trauma, mode) {
    if (trauma.effects.length > 0 && mode === TRAUMA_MODE.report) {
        const labels = trauma.effects.map((effect) => escapeHtml(effect.label)).join(", ");
        return `<div class="z-trauma-muted">\u0412\u043e\u0437\u043c\u043e\u0436\u043d\u044b\u0435 \u043f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u044f: ${labels}.</div>`;
    }

    return `<div class="z-trauma-muted">\u041f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u0435 \u043e\u043f\u0438\u0441\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0435: \u0431\u043e\u043b\u044c, \u0448\u043e\u043a, \u0441\u043b\u0435\u0434 \u043e\u0442 \u0443\u0434\u0430\u0440\u0430.</div>`;
}

function buildTraumaEffects({ severity, location, damageType }) {
    const effects = [];
    const isSerious = severity === TRAUMA_SEVERITY.serious || severity === TRAUMA_SEVERITY.critical;
    const isCritical = severity === TRAUMA_SEVERITY.critical;

    if (isSerious && BLEEDING_DAMAGE_TYPES.has(damageType)) {
        effects.push({
            key: "bleeding",
            label: `\u041a\u0440\u043e\u0432\u043e\u0442\u0435\u0447\u0435\u043d\u0438\u0435 (${LIMB_LABELS[location] || location})`,
            action: "bleeding"
        });
    }

    if (isSerious && location === "head") {
        effects.push({
            key: "dizzy",
            label: "\u0413\u043e\u043b\u043e\u0432\u043e\u043a\u0440\u0443\u0436\u0435\u043d\u0438\u0435",
            action: "status",
            status: "dizzy"
        });
    }

    if ((isCritical && location === "torso") || (isSerious && location.includes("Leg"))) {
        effects.push({
            key: "prone",
            label: "\u0421\u0431\u0438\u0442\u044c \u0441 \u043d\u043e\u0433",
            action: "status",
            status: "prone"
        });
    }

    if (isCritical) {
        effects.unshift({
            key: "injury",
            label: `\u0422\u0440\u0430\u0432\u043c\u0430: ${LIMB_LABELS[location] || location}`,
            action: "injury"
        });
    }

    return effects;
}

function buildTraumaButton(trauma, effect) {
    return `
        <button type="button"
            class="z-apply-trauma"
            data-actor-uuid="${escapeHtml(trauma.targetUuid)}"
            data-action="${escapeHtml(effect.action)}"
            data-status="${escapeHtml(effect.status || "")}"
            data-limb="${escapeHtml(trauma.location)}">
            ${escapeHtml(effect.label)}
        </button>
    `;
}

function getSeverity(pressure) {
    if (pressure >= 0.75) return TRAUMA_SEVERITY.critical;
    if (pressure >= 0.45) return TRAUMA_SEVERITY.serious;
    if (pressure >= 0.25) return TRAUMA_SEVERITY.light;
    return TRAUMA_SEVERITY.none;
}

function emptyTrauma(extra = {}) {
    return {
        enabled: false,
        severity: TRAUMA_SEVERITY.none,
        effects: [],
        ...extra
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
