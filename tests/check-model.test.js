import test from "node:test";
import assert from "node:assert/strict";

import {
    buildCheckDifficulty,
    buildDifficultyFromFactors,
    calcReducedFumbleChance,
    calcSkillCheckBands,
    calcSkillCheckResult
} from "../src/module/check-model.js";

test("skill below difficulty keeps low rolls as success before ordinary fail", () => {
    const result = calcSkillCheckBands({ skill: 40, difficulty: 60 });

    assert.deepEqual(result.bands.critSuccess, { from: 1, to: 5 });
    assert.deepEqual(result.bands.success, { from: 6, to: 75 });
    assert.deepEqual(result.bands.fail, { from: 76, to: 95 });
    assert.deepEqual(result.bands.fumble, { from: 96, to: 100 });
    assert.equal(result.successChance, 75);
});

test("skill far above difficulty reduces fumble chance down to the minimum", () => {
    const result = calcSkillCheckBands({ skill: 140, difficulty: 60 });

    assert.deepEqual(result.bands.critSuccess, { from: 1, to: 5 });
    assert.equal(result.bands.fail, null);
    assert.deepEqual(result.bands.success, { from: 6, to: 99 });
    assert.deepEqual(result.bands.fumble, { from: 100, to: 100 });
    assert.equal(result.successChance, 99);
});

test("fumble chance drops by one per 20 skill above difficulty", () => {
    assert.equal(calcReducedFumbleChance({ skill: 60, difficulty: 60 }), 5);
    assert.equal(calcReducedFumbleChance({ skill: 80, difficulty: 60 }), 4);
    assert.equal(calcReducedFumbleChance({ skill: 100, difficulty: 60 }), 3);
    assert.equal(calcReducedFumbleChance({ skill: 140, difficulty: 60 }), 1);
});

test("roll result uses low crit-success, fail, success and reduced fumble bands", () => {
    assert.equal(calcSkillCheckResult(1, { skill: 40, difficulty: 60 }), "crit-success");
    assert.equal(calcSkillCheckResult(5, { skill: 40, difficulty: 60 }), "crit-success");
    assert.equal(calcSkillCheckResult(6, { skill: 40, difficulty: 60 }), "success");
    assert.equal(calcSkillCheckResult(75, { skill: 40, difficulty: 60 }), "success");
    assert.equal(calcSkillCheckResult(76, { skill: 40, difficulty: 60 }), "fail");
    assert.equal(calcSkillCheckResult(95, { skill: 40, difficulty: 60 }), "fail");
    assert.equal(calcSkillCheckResult(96, { skill: 40, difficulty: 60 }), "crit-fail");
    assert.equal(calcSkillCheckResult(99, { skill: 140, difficulty: 60 }), "success");
    assert.equal(calcSkillCheckResult(100, { skill: 140, difficulty: 60 }), "crit-fail");
});

test("difficulty can be assembled from positive or negative contextual factors", () => {
    const difficulty = buildDifficultyFromFactors({
        baseDifficulty: 60,
        factors: {
            cover: -10,
            range: -10,
            evasion: 10
        }
    });

    assert.equal(difficulty.total, 90);
    assert.deepEqual(difficulty.factors, [
        { key: "cover", value: 10 },
        { key: "range", value: 10 },
        { key: "evasion", value: 10 }
    ]);
});

test("check difficulty combines base, preset and manual modifier", () => {
    const difficulty = buildCheckDifficulty({
        baseDifficulty: 60,
        modifier: 5,
        preset: {
            key: "hard",
            label: "Сложная",
            modifier: -20
        }
    });

    assert.equal(difficulty.base, 60);
    assert.equal(difficulty.presetKey, "hard");
    assert.equal(difficulty.presetLabel, "Сложная");
    assert.equal(difficulty.presetModifier, -20);
    assert.equal(difficulty.manualModifier, 5);
    assert.equal(difficulty.modifier, -15);
    assert.equal(difficulty.total, 75);
});
