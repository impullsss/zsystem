import { Z_DIFFICULTY, clampChance, getCalledShotPenalty } from "./difficulty-tables.js";

function getAimBonusPerStep() {
    return game.settings.get("zsystem", "aimBonus") || 10;
}

export function getSkillType(item, attack) {
    if (item.system.weaponType === "ranged") return "ranged";
    if (attack?.mode === "throw" || item.system.isThrowing === true) return "athletics";
    return "melee";
}

export function calcRollResult(roll, target) {
    if (roll <= 5) return "crit-success";
    if (roll >= 96) return "crit-fail";
    if (roll <= target) return "success";
    return "fail";
}

export function calcChanceBreakdown({
    actor,
    item,
    attack,
    sourceToken,
    targetToken = null,
    modifier = 0,
    aimSteps = 0,
    location = "torso",
    calculateCover,
    calculateRangePenalty,
    checkInterveningTokens
}) {
    const skillType = getSkillType(item, attack);
    const skillVal = actor.system.skills[skillType]?.value || 0;
    const atkMod = Number(attack?.mod) || 0;
    const aimBonusTotal = aimSteps * getAimBonusPerStep();
    const calledShotPen = getCalledShotPenalty(location);

    let coverPen = 0;
    let rangePen = 0;
    let intervPen = 0;
    let evasionMod = 0;
    let distance = 0;
    let outOfReach = false;
    let blockedByCover = false;

    if (sourceToken && targetToken) {
        distance = canvas.grid.measureDistance(sourceToken, targetToken);
        const weaponReach = Number(item.system.range) || 1.5;
        const isMeleeHit = skillType === "melee" && distance <= weaponReach;

        if (skillType === "melee" && distance > weaponReach) {
            outOfReach = true;
        }

        if (!isMeleeHit && typeof calculateCover === "function") {
            const coverData = calculateCover(sourceToken, targetToken);
            coverPen = coverData.penalty || 0;
            blockedByCover = coverPen <= Z_DIFFICULTY.chance.blocked;
        }

        if (typeof calculateRangePenalty === "function") {
            const rangeData = calculateRangePenalty(item, distance);
            rangePen = rangeData.penalty || 0;
        }

        if (item.system.weaponType === "ranged" && typeof checkInterveningTokens === "function") {
            const obstacles = checkInterveningTokens(sourceToken, targetToken);
            intervPen = Math.max(
                obstacles.length * Z_DIFFICULTY.interference.perToken,
                Z_DIFFICULTY.interference.cap
            );
        }

        if (!targetToken.actor?.hasStatusEffect("prone")) {
            evasionMod = -(targetToken.actor?.system.secondary?.evasion?.value || 0);
        }
    }

    const baseChance = Math.max(
        0,
        skillVal + atkMod + modifier + aimBonusTotal + calledShotPen + coverPen + rangePen + intervPen + evasionMod
    );

    const isDizzy = actor.statuses.has("dizzy");
    const isBlind = actor.statuses.has("blind");

    let finalChance = baseChance;
    const statusSteps = [];

    if (isDizzy) {
        const before = finalChance;
        finalChance = Math.floor(finalChance * 0.5);
        statusSteps.push({
            id: "dizzy",
            label: "ГОЛОВОКРУЖЕНИЕ",
            before,
            after: finalChance
        });
    }

    if (isBlind) {
        const before = finalChance;
        finalChance = Math.floor(finalChance * 0.5);
        statusSteps.push({
            id: "blind",
            label: "СЛЕПОТА",
            before,
            after: finalChance
        });
    }

    finalChance = clampChance(finalChance);

    return {
        skillType,
        distance,
        chance: finalChance,
        baseChance,
        targetName: targetToken?.name || "Нет цели",
        state: {
            outOfReach,
            blockedByCover,
            isDizzy,
            isBlind
        },
        details: {
            skillVal,
            atkMod,
            modifier,
            aimBonusTotal,
            calledShotPen,
            coverPen,
            rangePen,
            intervPen,
            evasionMod,
            statusSteps
        }
    };
}
