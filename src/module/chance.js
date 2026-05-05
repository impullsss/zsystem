import { Z_DIFFICULTY, getCalledShotPenalty, getInterferencePenalty } from "./difficulty-tables.js";
import { buildCombatDifficulty, calcCombatCheckBands, calcCombatRollResult } from "./combat-check.js";

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
            intervPen = getInterferencePenalty(obstacles.length);
        }

        if (!targetToken.actor?.hasStatusEffect("prone")) {
            evasionMod = -(targetToken.actor?.system.secondary?.evasion?.value || 0);
        }
    }

    const isDizzy = actor.statuses.has("dizzy");
    const isBlind = actor.statuses.has("blind");
    const statusMod = (isDizzy ? -50 : 0) + (isBlind ? -50 : 0);
    const statusSteps = [];

    if (isDizzy) {
        statusSteps.push({
            id: "dizzy",
            label: "\u0413\u041e\u041b\u041e\u0412\u041e\u041a\u0420\u0423\u0416\u0415\u041d\u0418\u0415",
            modifier: -50
        });
    }

    if (isBlind) {
        statusSteps.push({
            id: "blind",
            label: "\u0421\u041b\u0415\u041f\u041e\u0422\u0410",
            modifier: -50
        });
    }

    const totalModifier = atkMod + modifier + aimBonusTotal + calledShotPen + coverPen + rangePen + intervPen + evasionMod + statusMod;
    const difficulty = buildCombatDifficulty({ modifier: totalModifier });
    const check = calcCombatCheckBands({
        skill: skillVal,
        difficulty: difficulty.total
    });
    const finalChance = check.successChance;

    return {
        skillType,
        distance,
        chance: finalChance,
        baseChance: skillVal,
        difficulty,
        check,
        targetName: targetToken?.name || "\u041d\u0435\u0442 \u0446\u0435\u043b\u0438",
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
            statusMod,
            totalModifier,
            statusSteps
        }
    };
}

export { calcCombatRollResult };
