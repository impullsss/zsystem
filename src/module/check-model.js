export const DEFAULT_SKILL_CHECK_RULES = {
    rollMin: 1,
    rollMax: 100,
    critSuccessChance: 5,
    baseFumbleChance: 5,
    minFumbleChance: 1,
    skillPerFumbleReduction: 20
};

export function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function calcReducedFumbleChance({
    skill = 0,
    difficulty = 0,
    rules = DEFAULT_SKILL_CHECK_RULES
} = {}) {
    const overcap = Math.max(0, Number(skill) - Number(difficulty));
    const reduction = Math.floor(overcap / rules.skillPerFumbleReduction);
    return Math.max(rules.minFumbleChance, rules.baseFumbleChance - reduction);
}

export function calcSkillCheckBands({
    skill = 0,
    difficulty = 0,
    rules = DEFAULT_SKILL_CHECK_RULES
} = {}) {
    const normalizedSkill = Math.max(0, Number(skill) || 0);
    const normalizedDifficulty = Math.max(0, Number(difficulty) || 0);
    const critSuccessChance = clampNumber(
        Number(rules.critSuccessChance) || 0,
        0,
        rules.rollMax - rules.rollMin + 1
    );
    const fumbleChance = calcReducedFumbleChance({
        skill: normalizedSkill,
        difficulty: normalizedDifficulty,
        rules
    });
    const maxOrdinaryFail = Math.max(0, rules.rollMax - rules.rollMin + 1 - critSuccessChance - fumbleChance);
    const ordinaryFailChance = clampNumber(
        normalizedDifficulty - normalizedSkill,
        0,
        maxOrdinaryFail
    );
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
            critSuccess: critSuccessChance > 0
                ? { from: rules.rollMin, to: critSuccessEnd }
                : null,
            success: ordinarySuccessChance > 0
                ? { from: successStart, to: successEnd }
                : null,
            fail: ordinaryFailChance > 0
                ? { from: failStart, to: failEnd }
                : null,
            fumble: { from: fumbleStart, to: rules.rollMax }
        }
    };
}

export function calcSkillCheckResult(roll, {
    skill = 0,
    difficulty = 0,
    rules = DEFAULT_SKILL_CHECK_RULES
} = {}) {
    const bands = calcSkillCheckBands({ skill, difficulty, rules });
    const normalizedRoll = Number(roll) || 0;

    if (bands.bands.critSuccess && normalizedRoll <= bands.bands.critSuccess.to) return "crit-success";
    if (normalizedRoll >= bands.bands.fumble.from) return "crit-fail";
    if (bands.bands.success && normalizedRoll >= bands.bands.success.from && normalizedRoll <= bands.bands.success.to) return "success";
    return "fail";
}

export function buildDifficultyFromFactors({
    baseDifficulty = 60,
    factors = {}
} = {}) {
    const entries = Object.entries(factors).map(([key, value]) => ({
        key,
        value: Math.abs(Number(value) || 0)
    }));
    const total = entries.reduce((sum, entry) => sum + entry.value, Number(baseDifficulty) || 0);

    return {
        baseDifficulty,
        factors: entries,
        total
    };
}

export function buildCheckDifficulty({
    baseDifficulty = 60,
    modifier = 0,
    preset = null
} = {}) {
    const presetModifier = Number(preset?.modifier) || 0;
    const manualModifier = Number(modifier) || 0;
    const totalModifier = presetModifier + manualModifier;

    return {
        base: baseDifficulty,
        presetKey: preset?.key || null,
        presetLabel: preset?.label || "",
        presetModifier,
        manualModifier,
        modifier: totalModifier,
        total: Math.max(0, baseDifficulty - totalModifier)
    };
}
