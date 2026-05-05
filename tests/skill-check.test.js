import test from "node:test";
import assert from "node:assert/strict";

import {
    Z_SKILL_CHECK_SCENARIOS,
    buildSkillCheckContext,
    buildSkillDifficulty,
    getSkillDifficultyPreset,
    getSkillLabel
} from "../src/module/skill-check.js";

test("generic skill difficulty converts positive modifiers into lower DC", () => {
    assert.equal(buildSkillDifficulty({ modifier: 20 }).total, 40);
    assert.equal(buildSkillDifficulty({ modifier: -15 }).total, 75);
});

test("generic skill difficulty presets map to clear DC values", () => {
    assert.equal(getSkillDifficultyPreset("easy").dc, 40);
    assert.equal(getSkillDifficultyPreset("normal").dc, 60);
    assert.equal(getSkillDifficultyPreset("hard").dc, 80);
    assert.equal(getSkillDifficultyPreset("dangerous").dc, 100);
    assert.equal(getSkillDifficultyPreset("missing").dc, 60);
});

test("generic skill difficulty combines preset and manual modifier", () => {
    const difficulty = buildSkillDifficulty({ preset: "hard", modifier: 5 });

    assert.equal(difficulty.presetLabel, "Сложная");
    assert.equal(difficulty.presetModifier, -20);
    assert.equal(difficulty.manualModifier, 5);
    assert.equal(difficulty.modifier, -15);
    assert.equal(difficulty.total, 75);
});

test("generic skill check uses skill-vs-difficulty success bands", () => {
    const context = buildSkillCheckContext({
        actor: {
            system: {
                skills: {
                    medical: { value: 40 }
                }
            }
        },
        skillId: "medical",
        modifier: 0
    });

    assert.equal(context.skillLabel, "Медицина");
    assert.equal(context.skillValue, 40);
    assert.equal(context.difficulty.total, 60);
    assert.equal(context.check.ordinaryFailChance, 20);
    assert.equal(context.check.successChance, 75);
    assert.equal(context.check.fumbleChance, 5);
    assert.equal(context.effectiveTarget, 75);
});

test("generic skill check makes experts reliable at easy tasks", () => {
    const context = buildSkillCheckContext({
        actor: {
            system: {
                skills: {
                    science: { value: 140 }
                }
            }
        },
        skillId: "science"
    });

    assert.equal(context.difficulty.total, 60);
    assert.equal(context.check.ordinaryFailChance, 0);
    assert.equal(context.check.successChance, 99);
    assert.equal(context.check.fumbleChance, 1);
});

test("generic skill check accepts difficulty presets", () => {
    const context = buildSkillCheckContext({
        actor: {
            system: {
                skills: {
                    survival: { value: 70 }
                }
            }
        },
        skillId: "survival",
        preset: "dangerous"
    });

    assert.equal(context.difficulty.total, 100);
    assert.equal(context.check.ordinaryFailChance, 30);
    assert.equal(context.check.successChance, 65);
});

test("skill labels fall back to the raw id", () => {
    assert.equal(getSkillLabel("custom"), "custom");
});

test("common skill check scenarios point to existing skills and presets", () => {
    assert.equal(Z_SKILL_CHECK_SCENARIOS.medicine.skillId, "medical");
    assert.equal(Z_SKILL_CHECK_SCENARIOS.mechanics.skillId, "mechanical");
    assert.equal(Z_SKILL_CHECK_SCENARIOS.survival.difficultyPreset, "hard");
});
