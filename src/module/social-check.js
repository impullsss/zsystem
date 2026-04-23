import { calcRollResult } from "./chance.js";
import { getSlotMachineHTML } from "./attack-chat.js";

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
  friendly: { icon: "🙂", color: "#69f0ae" },
  neutral: { icon: "😐", color: "#f1c40f" },
  hostile: { icon: "😠", color: "#e74c3c" }
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
  const effectiveTarget = skillValue + difficulty.total;

  return {
    actor,
    targetActor,
    skillId,
    skillLabel,
    skillValue,
    difficulty,
    effectiveTarget,
    descriptor: getSocialDifficultyLabel(difficulty.total)
  };
}

export function buildSocialBreakdownHtml(context) {
  return context.difficulty.breakdown
    .filter((entry) => entry.value !== 0)
    .map((entry) => {
      const sign = entry.value > 0 ? "+" : "";
      return `<div style="font-size:0.8em; color:${entry.value > 0 ? "#69f0ae" : "#e74c3c"};">${entry.label}: ${sign}${entry.value}%</div>`;
    })
    .join("");
}

export function buildSocialCardHtml({
  context,
  rollTotal,
  revealFactors = false
}) {
  const resultType = calcRollResult(rollTotal, context.effectiveTarget);
  const targetName = context.targetActor?.name ? ` → ${context.targetActor.name}` : "";
  const header = `${context.skillLabel}${targetName}`;
  const slotCard = getSlotMachineHTML(header, context.effectiveTarget, rollTotal, resultType);
  const descriptorHtml = `<div style="font-size:0.85em; color:#bbb; margin-top:6px;">Ситуация: ${context.descriptor}</div>`;
  const breakdownHtml = revealFactors ? buildSocialBreakdownHtml(context) : "";

  return {
    resultType,
    content: `${slotCard}${descriptorHtml}${breakdownHtml}`
  };
}
