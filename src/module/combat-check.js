import { calcReducedFumbleChance, clampNumber } from "./check-model.js";

export const Z_COMBAT_CHECK_RULES = {
    rollMin: 1,
    rollMax: 100,
    baseDifficulty: 60,
    critSuccessChance: 5,
    baseFumbleChance: 5,
    minFumbleChance: 1,
    skillPerFumbleReduction: 20
};

export function calcCombatCheckBands({
    skill = 0,
    difficulty = Z_COMBAT_CHECK_RULES.baseDifficulty,
    rules = Z_COMBAT_CHECK_RULES
} = {}) {
    const normalizedSkill = Math.max(0, Number(skill) || 0);
    const normalizedDifficulty = Math.max(0, Number(difficulty) || 0);
    const critSuccessChance = clampNumber(Number(rules.critSuccessChance) || 0, 0, rules.rollMax - rules.rollMin + 1);
    const fumbleChance = calcReducedFumbleChance({
        skill: normalizedSkill,
        difficulty: normalizedDifficulty,
        rules
    });
    const maxOrdinaryFail = Math.max(0, rules.rollMax - rules.rollMin + 1 - critSuccessChance - fumbleChance);
    const ordinaryFailChance = clampNumber(normalizedDifficulty - normalizedSkill, 0, maxOrdinaryFail);
    const fumbleStart = rules.rollMax - fumbleChance + 1;
    const critSuccessEnd = rules.rollMin + critSuccessChance - 1;
    const ordinarySuccessChance = Math.max(0, maxOrdinaryFail - ordinaryFailChance);
    const successStart = critSuccessEnd + 1;
    const successEnd = successStart + ordinarySuccessChance - 1;
    const failStart = ordinarySuccessChance > 0 ? successEnd + 1 : successStart;
    const failEnd = fumbleStart - 1;
    const successChance = critSuccessChance + ordinarySuccessChance;

    return {
        skill: normalizedSkill,
        difficulty: normalizedDifficulty,
        margin: normalizedSkill - normalizedDifficulty,
        critSuccessChance,
        ordinaryFailChance,
        ordinarySuccessChance,
        fumbleChance,
        successChance,
        bands: {
            critSuccess: critSuccessChance > 0 ? { from: rules.rollMin, to: critSuccessEnd } : null,
            success: ordinarySuccessChance > 0 ? { from: successStart, to: successEnd } : null,
            fail: ordinaryFailChance > 0 ? { from: failStart, to: failEnd } : null,
            fumble: { from: fumbleStart, to: rules.rollMax }
        }
    };
}

export function calcCombatRollResult(roll, {
    skill = 0,
    difficulty = Z_COMBAT_CHECK_RULES.baseDifficulty,
    rules = Z_COMBAT_CHECK_RULES
} = {}) {
    const bands = calcCombatCheckBands({ skill, difficulty, rules });
    const normalizedRoll = Number(roll) || 0;

    if (bands.bands.critSuccess && normalizedRoll <= bands.bands.critSuccess.to) return "crit-success";
    if (normalizedRoll >= bands.bands.fumble.from) return "crit-fail";
    if (bands.bands.success && normalizedRoll >= bands.bands.success.from && normalizedRoll <= bands.bands.success.to) return "success";
    return "fail";
}

export function buildCombatDifficulty({ baseDifficulty = Z_COMBAT_CHECK_RULES.baseDifficulty, modifier = 0 } = {}) {
    return {
        base: baseDifficulty,
        modifier: Number(modifier) || 0,
        total: Math.max(0, Number(baseDifficulty) - (Number(modifier) || 0))
    };
}
