import { getSlotMachineHTML } from "./attack-chat.js";
import { buildCheckDetailsHtml } from "./check-chat.js";
import { buildCheckDifficulty, calcSkillCheckBands, calcSkillCheckResult } from "./check-model.js";

export const Z_SOCIAL_BASE_DIFFICULTY = 60;

export const Z_SOCIAL_SKILLS = {
  diplomacy: "Дипломатия",
  leadership: "Лидерство"
};

export const Z_SOCIAL_ATTITUDES = {
  friendly: "Дружелюбный",
  neutral: "Нейтральный",
  hostile: "Враждебный"
};

export const Z_SOCIAL_PRESETS = {
  easy: "Лёгкий",
  normal: "Обычный",
  hard: "Тяжёлый"
};

export const Z_SOCIAL_ATTITUDE_META = {
  friendly: { icon: "🙂", color: "#085730" },
  neutral: { icon: "😐", color: "#7a5a00" },
  hostile: { icon: "😠", color: "#8f1f16" }
};

export function getSocialProfile(targetActor) {
  return {
    attitude: targetActor?.system?.social?.attitude || "neutral",
    preset: targetActor?.system?.social?.preset || "normal",
    notes: targetActor?.system?.social?.notes || ""
  };
}

export function getSocialAttitudeMeta(attitude = "neutral") {
  return {
    label: Z_SOCIAL_ATTITUDES[attitude] || Z_SOCIAL_ATTITUDES.neutral,
    ...(Z_SOCIAL_ATTITUDE_META[attitude] || Z_SOCIAL_ATTITUDE_META.neutral)
  };
}

export function getSocialPresetLabel(preset = "normal") {
  return Z_SOCIAL_PRESETS[preset] || Z_SOCIAL_PRESETS.normal;
}

export function getSocialDifficultyModifier({
  targetActor = null,
  customModifier = 0,
  tables
} = {}) {
  const socialTables = tables ?? {};
  const profile = getSocialProfile(targetActor);
  const attitudeMod = socialTables.attitude?.[profile.attitude] ?? 0;
  const presetMod = socialTables.preset?.[profile.preset] ?? 0;
  const manualMod = Number(customModifier) || 0;

  return {
    total: attitudeMod + presetMod + manualMod,
    profile,
    breakdown: [
      { key: "attitude", label: "Отношение", value: attitudeMod },
      { key: "preset", label: "Пресет NPC", value: presetMod },
      { key: "manual", label: "Ручной модификатор", value: manualMod }
    ]
  };
}

export function buildSocialDifficulty({
  modifierTotal = 0,
  baseDifficulty = Z_SOCIAL_BASE_DIFFICULTY
} = {}) {
  return buildCheckDifficulty({
    baseDifficulty,
    modifier: modifierTotal
  });
}

export function getSocialDifficultyLabel(totalModifier) {
  if (totalModifier >= 20) return "легко";
  if (totalModifier >= 0) return "обычно";
  if (totalModifier >= -20) return "сложно";
  return "опасно";
}

export function buildSocialCheckContext({
  actor,
  skillId,
  targetActor = null,
  customModifier = 0,
  tables
}) {
  const skillValue = Number(actor?.system?.skills?.[skillId]?.value) || 0;
  const skillLabel = Z_SOCIAL_SKILLS[skillId] || skillId;
  const difficulty = getSocialDifficultyModifier({
    targetActor,
    customModifier,
    tables
  });
  const modelDifficulty = buildSocialDifficulty({ modifierTotal: difficulty.total });
  const check = calcSkillCheckBands({
    skill: skillValue,
    difficulty: modelDifficulty.total
  });
  const effectiveTarget = check.successChance;

  return {
    actor,
    targetActor,
    skillId,
    skillLabel,
    skillValue,
    difficulty,
    modelDifficulty,
    check,
    effectiveTarget,
    descriptor: getSocialDifficultyLabel(difficulty.total)
  };
}

export function buildSocialBreakdownHtml(context) {
  return context.difficulty.breakdown
    .filter((entry) => entry.value !== 0)
    .map((entry) => {
      const sign = entry.value > 0 ? "+" : "";
      return `<div style="font-size:0.8em; font-weight:700; color:${entry.value > 0 ? "#085730" : "#9f1d14"};">${entry.label}: ${sign}${entry.value}%</div>`;
    })
    .join("");
}

export function buildSocialCardHtml({
  context,
  rollTotal,
  revealFactors = false
}) {
  const resultType = calcSkillCheckResult(rollTotal, {
    skill: context.skillValue,
    difficulty: context.modelDifficulty.total
  });
  const targetName = context.targetActor?.name ? ` \u2192 ${context.targetActor.name}` : "";
  const header = `${context.skillLabel}${targetName}`;
  const slotCard = getSlotMachineHTML(header, context.effectiveTarget, rollTotal, resultType);
  const breakdownHtml = revealFactors ? buildSocialBreakdownHtml(context) : "";
  const descriptorHtml = buildCheckDetailsHtml({
    summary: `\u0421\u0438\u0442\u0443\u0430\u0446\u0438\u044f: ${context.descriptor}`,
    skillValue: context.skillValue,
    difficulty: context.modelDifficulty.total,
    critSuccessChance: context.check.critSuccessChance,
    ordinaryFailChance: context.check.ordinaryFailChance,
    fumbleChance: context.check.fumbleChance,
    check: context.check,
    extraHtml: breakdownHtml
  });

  return {
    resultType,
    content: `${slotCard}${descriptorHtml}`
  };
}
