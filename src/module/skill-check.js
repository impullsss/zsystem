import { getSlotMachineHTML } from "./attack-chat.js";
import { buildCheckDetailsHtml } from "./check-chat.js";
import { buildCheckDifficulty, calcSkillCheckBands, calcSkillCheckResult } from "./check-model.js";

export const Z_SKILL_BASE_DIFFICULTY = 60;

export const Z_SKILL_DIFFICULTY_PRESETS = {
    easy: { label: "Лёгкая", modifier: 20, dc: 40 },
    normal: { label: "Обычная", modifier: 0, dc: 60 },
    hard: { label: "Сложная", modifier: -20, dc: 80 },
    dangerous: { label: "Опасная", modifier: -40, dc: 100 }
};

export const Z_SKILL_CHECK_SCENARIOS = {
    medicine: { label: "Лечение", skillId: "medical", difficultyPreset: "normal", modifier: 0 },
    mechanics: { label: "Механика", skillId: "mechanical", difficultyPreset: "normal", modifier: 0 },
    science: { label: "Наука", skillId: "science", difficultyPreset: "normal", modifier: 0 },
    survival: { label: "Выживание", skillId: "survival", difficultyPreset: "hard", modifier: 0 },
    stealth: { label: "Скрытность", skillId: "stealth", difficultyPreset: "normal", modifier: 0 }
};

export const Z_SKILL_LABELS = {
    melee: "Ближний бой",
    ranged: "Стрельба",
    science: "Наука",
    mechanical: "Механика",
    medical: "Медицина",
    diplomacy: "Дипломатия",
    leadership: "Лидерство",
    survival: "Выживание",
    athletics: "Атлетика",
    stealth: "Скрытность"
};

export function getSkillLabel(skillId) {
    return Z_SKILL_LABELS[skillId] || skillId;
}

export function getSkillDifficultyPreset(preset = "normal") {
    return Z_SKILL_DIFFICULTY_PRESETS[preset] || Z_SKILL_DIFFICULTY_PRESETS.normal;
}

export function buildSkillDifficulty({
    modifier = 0,
    preset = "normal",
    baseDifficulty = Z_SKILL_BASE_DIFFICULTY
} = {}) {
    const presetData = getSkillDifficultyPreset(preset);
    return buildCheckDifficulty({
        baseDifficulty,
        modifier,
        preset: { key: preset, ...presetData }
    });
}

export function buildSkillCheckContext({
    actor,
    skillId,
    modifier = 0,
    preset = "normal",
    baseDifficulty = Z_SKILL_BASE_DIFFICULTY
} = {}) {
    const skillValue = Number(actor?.system?.skills?.[skillId]?.value) || 0;
    const difficulty = buildSkillDifficulty({ modifier, preset, baseDifficulty });
    const check = calcSkillCheckBands({
        skill: skillValue,
        difficulty: difficulty.total
    });

    return {
        actor,
        skillId,
        skillLabel: getSkillLabel(skillId),
        skillValue,
        difficulty,
        check,
        effectiveTarget: check.successChance
    };
}

export function buildSkillCheckCardHtml({
    context,
    rollTotal
}) {
    const resultType = calcSkillCheckResult(rollTotal, {
        skill: context.skillValue,
        difficulty: context.difficulty.total
    });
    const modifierText = context.difficulty.modifier !== 0
        ? ` (${context.difficulty.modifier > 0 ? "+" : ""}${context.difficulty.modifier})`
        : "";
    const slotCard = getSlotMachineHTML(`${context.skillLabel}${modifierText}`, context.effectiveTarget, rollTotal, resultType);
    const detailsHtml = buildCheckDetailsHtml({
        summary: context.difficulty.presetLabel,
        skillValue: context.skillValue,
        difficulty: context.difficulty.total,
        critSuccessChance: context.check.critSuccessChance,
        ordinaryFailChance: context.check.ordinaryFailChance,
        fumbleChance: context.check.fumbleChance,
        check: context.check
    });

    return {
        resultType,
        content: `${slotCard}${detailsHtml}`
    };
}
