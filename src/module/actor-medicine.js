export async function useMedicine(actor, item) {
    const targets = Array.from(game.user.targets);
    if (targets.length === 0) return ui.notifications.warn("Выберите цель (Target)!");
    const targetToken = targets[0];
    const targetActor = targetToken.actor;

    const myToken = actor.getActiveTokens()[0];
    if (myToken && canvas.grid.measureDistance(myToken, targetToken) > 2) {
        return ui.notifications.warn("Слишком далеко для лечения!");
    }

    const limbs = {
        torso: "Торс (ОБЩ)",
        head: "Голова",
        lArm: "Л.Рука",
        rArm: "П.Рука",
        lLeg: "Л.Нога",
        rLeg: "П.Нога",
    };
    let options = "";
    for (let [k, v] of Object.entries(limbs)) {
        const lData = targetActor.system.limbs[k];
        options += `<option value="${k}">${v} (${lData.value}/${lData.max})</option>`;
    }

    new Dialog({
        title: `Лечение: ${item.name}`,
        content: `<form><div class="form-group"><label>Лечить зону:</label><select id="limb-select">${options}</select></div></form>`,
        buttons: {
            heal: {
                label: "Применить",
                icon: '<i class="fas fa-heartbeat"></i>',
                callback: async (html) => {
                    const limbKey = html.find("#limb-select").val();
                    const itemData = item.toObject();
                    await actor._consumeItem(item);
                    ChatMessage.create({
                        content: `<i>Применяет ${item.name} на ${targetActor.name}...</i>`,
                        flags: {
                            zsystem: {
                                type: "heal",
                                healerUuid: actor.uuid,
                                targetUuid: targetActor.uuid,
                                itemData: itemData,
                                limbKey: limbKey
                            }
                        }
                    });
                },
            },
        },
    }).render(true);
}

export async function applyMedicineLogic(actor, healer, itemData, limbKey) {
    const report = [];

    if (itemData.system.isAntibiotic) {
        const inf = actor.system.resources.infection;
        if (inf.active || inf.stage > 0) {
            const allowBelow1 = game.settings.get("zsystem", "allowInfectionBelowOne");
            const minStage = allowBelow1 ? 0 : 1;
            const newStage = Math.max(minStage, inf.stage - 1);
            await actor.update({
                "system.resources.infection.active": false,
                "system.resources.infection.stage": newStage,
            });
            if (newStage === 0) {
                report.push(`<span style="color:blue;">🦠 Инфекция устранена!</span>`);
            } else {
                report.push(`<span style="color:blue;">🦠 Инфекция снижена (Ст. ${inf.stage} → ${newStage})</span>`);
            }
            return reportHealing(actor, healer, report);
        }
    }

    const medSkill = healer ? (healer.system.skills.medical.value || 0) : 0;
    const skillBonus = Math.floor(medSkill / 5);
    const baseHeal = Number(itemData.system.healAmount) || 0;
    const totalHeal = baseHeal + skillBonus;

    let penaltyIncrease = Math.max(1, baseHeal - skillBonus);

    const res = actor.system.resources.hp;
    const currentHP = res.value;
    const baseMaxHP = (actor.system.attributes.vig.value - 1) * 10 + 70;
    const currentPenalty = res.penalty || 0;

    const currentMax = baseMaxHP - currentPenalty;
    const newHP = Math.min(currentMax, currentHP + totalHeal);

    const maxAllowedPenalty = baseMaxHP - newHP;
    let newPenalty = currentPenalty + penaltyIncrease;
    if (newPenalty > maxAllowedPenalty) {
        newPenalty = maxAllowedPenalty;
        report.push(`<i>(Штраф ограничен текущим здоровьем)</i>`);
    }

    const LIMB_PERCENTS = { torso: 0.45, head: 0.20, lArm: 0.15, rArm: 0.15, lLeg: 0.20, rLeg: 0.20 };

    const updates = {
        "system.resources.hp.value": newHP,
        "system.resources.hp.penalty": newPenalty
    };

    if (actor.system.limbs && actor.system.limbs[limbKey]) {
        const lData = actor.system.limbs[limbKey];
        updates[`system.limbs.${limbKey}.value`] = Math.min(lData.max, lData.value + totalHeal);
    }

    const penaltyDelta = newPenalty - currentPenalty;
    if (penaltyDelta > 0 && actor.system.limbs?.[limbKey] !== undefined && LIMB_PERCENTS[limbKey]) {
        const limbPenaltyDelta = Math.floor(penaltyDelta * (LIMB_PERCENTS[limbKey] + 0.05));
        if (limbPenaltyDelta > 0) {
            updates[`system.limbs.${limbKey}.penalty`] = (actor.system.limbs[limbKey].penalty || 0) + limbPenaltyDelta;
        }
    }

    await actor.update(updates);

    report.push(`<span style="color:green; font-weight:bold;">+${totalHeal} HP</span>`);
    if (penaltyDelta > 0) {
        const newMax = baseMaxHP - newPenalty;
        report.push(`<span style="color:#e74c3c;">⬇ Max HP: ${currentMax} → ${newMax} (-${penaltyDelta})</span>`);
    }

    reportHealing(actor, healer, report, limbKey, itemData.name);
}

export function reportHealing(actor, healer, messages, limb, itemName) {
    ChatMessage.create({
        content: `
          <div class="z-chat-card">
              <div class="z-card-header">МЕДИЦИНА</div>
              <div><b>${healer?.name || "???"}</b> использует ${itemName || "предмет"} на <b>${actor.name}</b>.</div>
              ${limb ? `<div style="font-size:0.8em; margin-bottom:5px;">Зона: ${limb}</div>` : ""}
              <hr>
              <div>${messages.join("<br>")}</div>
          </div>
        `
    });
}
