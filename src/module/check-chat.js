function buildLine(label, value, { danger = false } = {}) {
    if (value === undefined || value === null || value === "") return "";
    const color = danger ? "#a30d0d" : "#2f2924";
    return `<span style="color:${color};">${label}: <strong>${value}</strong></span>`;
}

function formatBandRange(band) {
    if (!band) return "";
    return band.from === band.to ? `${band.from}` : `${band.from} - ${band.to}`;
}

export function getCheckBandParts(check) {
    const bands = check?.bands || {};
    return [
        { key: "crit-success", label: "крит", range: formatBandRange(bands.critSuccess) },
        { key: "success", label: "успех", range: formatBandRange(bands.success) },
        { key: "fail", label: "провал", range: formatBandRange(bands.fail) },
        { key: "crit-fail", label: "крит. провал", range: formatBandRange(bands.fumble) }
    ].filter((part) => part.range);
}

export function buildCheckBandsHtml(check) {
    const parts = getCheckBandParts(check);
    if (!parts.length) return "";

    const items = parts
        .map((part) => `<span class="z-check-band z-check-band--${part.key}"><strong>${part.range}</strong> ${part.label}</span>`)
        .join("");

    return `<div class="z-check-bands">${items}</div>`;
}

export function buildCheckDetailsHtml({
    summary = "",
    skillValue,
    difficulty,
    critSuccessChance,
    ordinaryFailChance,
    fumbleChance,
    check,
    extraHtml = ""
} = {}) {
    const lines = [
        buildLine("\u041d\u0430\u0432\u044b\u043a", skillValue),
        buildLine("DC", difficulty),
        buildLine("\u041a\u0440\u0438\u0442. \u0443\u0441\u043f\u0435\u0445", `${critSuccessChance}%`),
        buildLine("\u041f\u0440\u043e\u0432\u0430\u043b", `${ordinaryFailChance}%`),
        buildLine("\u041a\u0440\u0438\u0442. \u043f\u0440\u043e\u0432\u0430\u043b", `${fumbleChance}%`, { danger: true })
    ].filter(Boolean);

    const summaryHtml = summary
        ? `<div style="color:#5a3a1c; margin-bottom:3px; font-weight:700;">${summary}</div>`
        : "";

    return `
        <div style="font-size:0.85em; color:#2f2924; margin-top:6px; font-weight:600;">
            ${summaryHtml}
            <div style="display:flex; gap:8px; flex-wrap:wrap;">${lines.join("")}</div>
            ${buildCheckBandsHtml(check)}
            ${extraHtml}
        </div>`;
}
