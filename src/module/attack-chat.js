import { buildCheckBandsHtml } from "./check-chat.js";
import { buildCombatOutcomeHtml } from "./combat-outcome.js";
import { buildFirearmBallisticsChatHtml } from "./firearm-chat.js";
import { buildTraumaHtml } from "./trauma.js";

export function getSlotMachineHTML(label, target, rollTotal, resultType) {
    const statusClass = resultType.includes("success") ? "success" : "failure";
    const statusLabel = resultType === "crit-success"
        ? "\u041a\u0420\u0418\u0422. \u0423\u0421\u041f\u0415\u0425"
        : resultType === "success"
            ? "\u0423\u0421\u041f\u0415\u0425"
            : resultType === "crit-fail"
                ? "\u041a\u0420\u0418\u0422. \u041f\u0420\u041e\u0412\u0410\u041b"
                : "\u041f\u0420\u041e\u0412\u0410\u041b";

    return `
        <div class="z-chat-card">
            <div class="z-card-header">${escapeHtml(label)}</div>
            <div class="z-card-sub">\u0426\u0435\u043b\u044c: ${target}%</div>
            <div class="z-slot-machine">
                <div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${rollTotal}</div></div>
            </div>
            <div class="z-result-label ${statusClass}">${statusLabel}</div>
        </div>`;
}

export function buildStatusChanceLog(chanceData) {
    let statusLog = "";
    for (const step of chanceData.details.statusSteps) {
        if (Number.isFinite(step.modifier)) {
            statusLog += `<div class="z-attack-row z-attack-row--bad"><span>${escapeHtml(step.label)}</span><b>${step.modifier}% DC</b></div>`;
        } else {
            statusLog += `<div class="z-attack-row z-attack-row--bad"><span>${escapeHtml(step.label)}</span><b>${step.before}% -> ${step.after}%</b></div>`;
        }
    }
    return statusLog;
}

export function buildAttackChatParts({
    item,
    aimSteps,
    ammoContext,
    attackCost,
    damageContext,
    dizzyLog,
    chanceData,
    outcome,
    ballisticsContext = null
}) {
    const checkLog = chanceData ? buildAttackCheckSection(chanceData) : "";
    const resourceLog = buildAttackResourceSection({ item, ammoContext, attackCost, aimSteps });
    const modifierLog = buildAttackModifierSection({ damageContext, dizzyLog });

    return {
        content: [
            buildCombatOutcomeHtml(outcome),
            damageContext.dmgDisplay,
            buildAttackProtectionSection(damageContext.protectionPreview),
            buildTraumaHtml(damageContext.trauma, { mode: damageContext.traumaMode }),
            buildFirearmBallisticsChatHtml(ballisticsContext),
            checkLog,
            resourceLog,
            modifierLog
        ].filter(Boolean).join("")
    };
}

function buildAttackCheckSection(chanceData) {
    return `
        <div class="z-attack-section z-attack-section--check">
            <div class="z-attack-section-title">\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430</div>
            <div class="z-attack-grid">
                <div><span>\u041d\u0430\u0432\u044b\u043a</span><b>${chanceData.details.skillVal}</b></div>
                <div><span>DC</span><b>${chanceData.difficulty.total}</b></div>
                <div><span>\u041a\u0440\u0438\u0442. \u0443\u0441\u043f\u0435\u0445</span><b>${chanceData.check.critSuccessChance}%</b></div>
                <div><span>\u041f\u0440\u043e\u0432\u0430\u043b</span><b>${chanceData.check.ordinaryFailChance}%</b></div>
                <div><span>\u041a\u0440\u0438\u0442. \u043f\u0440\u043e\u0432\u0430\u043b</span><b>${chanceData.check.fumbleChance}%</b></div>
            </div>
            ${buildCheckBandsHtml(chanceData.check)}
        </div>`;
}

function buildAttackResourceSection({ item, ammoContext, attackCost, aimSteps }) {
    const rows = [];
    if (ammoContext.spentBullets > 0 && item.system.ammoType) {
        const refund = ammoContext.refundedBullets
            ? ` <em>(\u043a\u043b\u0438\u043d: \u043d\u0435 \u0432\u044b\u043f\u0443\u0449\u0435\u043d\u043e ${ammoContext.refundedBullets})</em>`
            : "";
        rows.push(`<div class="z-attack-row"><span>\u041f\u0430\u0442\u0440\u043e\u043d\u044b</span><b>${ammoContext.spentBullets}${refund}</b></div>`);
    }

    if (aimSteps > 0) {
        rows.push(`<div class="z-attack-row z-attack-row--good"><span>\u041f\u0440\u0438\u0446\u0435\u043b</span><b>+${attackCost.aimBonusTotal}% / -${attackCost.extraApCost} AP</b></div>`);
    }

    rows.push(`<div class="z-attack-row z-attack-row--cost"><span>AP</span><b>-${attackCost.totalApCost}</b></div>`);

    return `
        <div class="z-attack-section z-attack-section--resources">
            <div class="z-attack-section-title">\u0420\u0435\u0441\u0443\u0440\u0441\u044b</div>
            ${rows.join("")}
        </div>`;
}

function buildAttackModifierSection({ damageContext, dizzyLog }) {
    const content = [
        damageContext.ammoLog,
        damageContext.strBonusLog,
        damageContext.stealthLog,
        dizzyLog
    ].filter(Boolean).join("");

    if (!content) return "";

    return `
        <div class="z-attack-section z-attack-section--modifiers">
            <div class="z-attack-section-title">\u041c\u043e\u0434\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440\u044b</div>
            ${content}
        </div>`;
}

function buildAttackProtectionSection(protectionPreview) {
    if (!protectionPreview) return "";

    const rows = [
        `<div class="z-attack-row"><span>Сырой урон</span><b>${protectionPreview.raw}</b></div>`,
        `<div class="z-attack-row"><span>AC / DR</span><b>-${protectionPreview.ac} / -${protectionPreview.resist}%</b></div>`
    ];

    if (protectionPreview.armorPiercing > 0) {
        rows.push(`<div class="z-attack-row z-attack-row--good"><span>Бронепробитие</span><b>${protectionPreview.armorPiercing}</b></div>`);
    }
    if (protectionPreview.headshot) {
        rows.push(`<div class="z-attack-row z-attack-row--bad"><span>Голова</span><b>x2 после брони</b></div>`);
    }
    if (protectionPreview.armorWear > 0) {
        rows.push(`<div class="z-attack-row z-attack-row--cost"><span>Износ брони</span><b>-${protectionPreview.armorWear}</b></div>`);
    }
    rows.push(`<div class="z-attack-row z-attack-row--result"><span>После защиты</span><b>${protectionPreview.final}</b></div>`);

    return `
        <div class="z-attack-section z-attack-section--protection">
            <div class="z-attack-section-title">Защита цели</div>
            ${rows.join("")}
        </div>`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
