export function getSlotMachineHTML(label, target, rollTotal, resultType) {
    let statusClass = resultType.includes("success") ? "success" : "failure";
    let statusLabel = (resultType === "crit-success")
        ? "КРИТ. УСПЕХ"
        : (resultType === "success"
            ? "УСПЕХ"
            : (resultType === "crit-fail" ? "КРИТ. ПРОВАЛ" : "ПРОВАЛ"));
    return `<div class="z-chat-card"><div class="z-card-header">${label}</div><div class="z-card-sub">Цель: ${target}%</div><div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${rollTotal}</div></div></div><div class="z-result-label ${statusClass}">${statusLabel}</div></div>`;
}

export function buildStatusChanceLog(chanceData) {
    let statusLog = "";
    for (const step of chanceData.details.statusSteps) {
        statusLog += `<div style="font-size:0.8em; color:#e74c3c;">${step.label}: ${step.before}% → ${step.after}%</div>`;
    }
    return statusLog;
}

export function buildAttackChatParts({ item, aimSteps, ammoContext, attackCost, damageContext, dizzyLog }) {
    const ammoInfo = (ammoContext.spentBullets > 0 && item.system.ammoType)
        ? `<div style="font-size:0.8em; color:#777;">Потрачено патронов: ${ammoContext.spentBullets}</div>`
        : "";
    const aimLog = aimSteps > 0
        ? `<div style="color:#69f0ae; font-size:0.8em;">Прицел: +${attackCost.aimBonusTotal}% (-${attackCost.extraApCost} AP)</div>`
        : "";

    return {
        content: `${damageContext.dmgDisplay}${ammoInfo}${aimLog}${damageContext.strBonusLog}${damageContext.stealthLog}${dizzyLog}<div class="z-ap-spent">-${attackCost.totalApCost} AP</div>`
    };
}
