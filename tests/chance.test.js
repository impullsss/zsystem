import test from "node:test";
import assert from "node:assert/strict";

import { calcChanceBreakdown, calcRollResult } from "../src/module/chance.js";
import { Z_DIFFICULTY, getCalledShotPenalty, clampChance } from "../src/module/difficulty-tables.js";

globalThis.game = {
    settings: {
        get(namespace, key) {
            if (namespace !== "zsystem") return undefined;
            if (key === "aimBonus") return 10;
            return undefined;
        }
    }
};

globalThis.canvas = {
    grid: {
        measureDistance(sourceToken, targetToken) {
            return targetToken._distance ?? 0;
        }
    }
};

function makeActor({
    skill = 50,
    evasion = 0,
    statuses = [],
    prone = false
} = {}) {
    return {
        system: {
            skills: {
                ranged: { value: skill },
                melee: { value: skill },
                athletics: { value: skill }
            },
            secondary: {
                evasion: { value: evasion }
            }
        },
        statuses: new Set(statuses),
        hasStatusEffect(status) {
            if (status === "prone") return prone;
            return this.statuses.has(status);
        }
    };
}

function makeItem({ weaponType = "ranged", range = 10, isThrowing = false } = {}) {
    return {
        system: {
            weaponType,
            range,
            isThrowing
        }
    };
}

function makeAttack({ mod = 0, mode = "single" } = {}) {
    return { mod, mode };
}

function makeToken({ distance = 0, actor = null } = {}) {
    return {
        actor,
        _distance: distance
    };
}

function fixedCover(penalty = 0) {
    return () => ({ penalty });
}

function fixedRange(penalty = 0) {
    return () => ({ penalty });
}

function obstacleCount(count = 0) {
    return () => Array.from({ length: count }, (_, index) => ({ id: index }));
}

test("called shot penalties come from the shared tables", () => {
    assert.equal(getCalledShotPenalty("torso"), 0);
    assert.equal(getCalledShotPenalty("head"), -20);
    assert.equal(getCalledShotPenalty("lArm"), -20);
    assert.equal(getCalledShotPenalty("unknown"), 0);
});

test("clampChance respects the configured cap", () => {
    assert.equal(clampChance(150), Z_DIFFICULTY.chance.max);
    assert.equal(clampChance(-5), Z_DIFFICULTY.chance.min);
    assert.equal(clampChance(82), 82);
});

test("calcChanceBreakdown uses called shot, cover, range, interference and evasion", () => {
    const actor = makeActor({ skill: 100 });
    const targetActor = makeActor({ evasion: 10 });
    const item = makeItem({ weaponType: "ranged", range: 10 });
    const attack = makeAttack();
    const sourceToken = makeToken();
    const targetToken = makeToken({ distance: 12, actor: targetActor });

    const result = calcChanceBreakdown({
        actor,
        item,
        attack,
        sourceToken,
        targetToken,
        location: "head",
        calculateCover: fixedCover(-15),
        calculateRangePenalty: fixedRange(-10),
        checkInterveningTokens: obstacleCount(1)
    });

    assert.equal(result.details.calledShotPen, -20);
    assert.equal(result.details.coverPen, -15);
    assert.equal(result.details.rangePen, -10);
    assert.equal(result.details.intervPen, -20);
    assert.equal(result.details.evasionMod, -10);
    assert.equal(result.chance, 25);
});

test("interference penalty is capped", () => {
    const actor = makeActor({ skill: 100 });
    const targetActor = makeActor();
    const item = makeItem({ weaponType: "ranged", range: 10 });
    const attack = makeAttack();
    const sourceToken = makeToken();
    const targetToken = makeToken({ distance: 5, actor: targetActor });

    const result = calcChanceBreakdown({
        actor,
        item,
        attack,
        sourceToken,
        targetToken,
        calculateCover: fixedCover(0),
        calculateRangePenalty: fixedRange(0),
        checkInterveningTokens: obstacleCount(5)
    });

    assert.equal(result.details.intervPen, Z_DIFFICULTY.interference.cap);
    assert.equal(result.chance, 60);
});

test("dizzy and blind status penalties stack before final clamp", () => {
    const actor = makeActor({ skill: 200, statuses: ["dizzy", "blind"] });
    const targetActor = makeActor();
    const item = makeItem({ weaponType: "ranged", range: 10 });
    const attack = makeAttack();
    const sourceToken = makeToken();
    const targetToken = makeToken({ distance: 5, actor: targetActor });

    const result = calcChanceBreakdown({
        actor,
        item,
        attack,
        sourceToken,
        targetToken,
        calculateCover: fixedCover(0),
        calculateRangePenalty: fixedRange(0),
        checkInterveningTokens: obstacleCount(0)
    });

    assert.equal(result.baseChance, 200);
    assert.equal(result.details.statusSteps.length, 2);
    assert.equal(result.details.statusSteps[0].after, 100);
    assert.equal(result.details.statusSteps[1].after, 50);
    assert.equal(result.chance, 50);
});

test("chance is capped at 95 even with very high skill", () => {
    const actor = makeActor({ skill: 250 });
    const targetActor = makeActor();
    const item = makeItem({ weaponType: "ranged", range: 10 });
    const attack = makeAttack();
    const sourceToken = makeToken();
    const targetToken = makeToken({ distance: 1, actor: targetActor });

    const result = calcChanceBreakdown({
        actor,
        item,
        attack,
        sourceToken,
        targetToken,
        calculateCover: fixedCover(0),
        calculateRangePenalty: fixedRange(0),
        checkInterveningTokens: obstacleCount(0)
    });

    assert.equal(result.baseChance, 250);
    assert.equal(result.chance, 95);
});

test("melee attacks out of reach are marked as blocked by distance", () => {
    const actor = makeActor({ skill: 60 });
    const targetActor = makeActor();
    const item = makeItem({ weaponType: "melee", range: 1.5 });
    const attack = makeAttack();
    const sourceToken = makeToken();
    const targetToken = makeToken({ distance: 3, actor: targetActor });

    const result = calcChanceBreakdown({
        actor,
        item,
        attack,
        sourceToken,
        targetToken,
        calculateCover: fixedCover(0),
        calculateRangePenalty: fixedRange(0),
        checkInterveningTokens: obstacleCount(0)
    });

    assert.equal(result.state.outOfReach, true);
});

test("calcRollResult keeps crit-success, success, fail and crit-fail behavior", () => {
    assert.equal(calcRollResult(5, 80), "crit-success");
    assert.equal(calcRollResult(44, 80), "success");
    assert.equal(calcRollResult(81, 80), "fail");
    assert.equal(calcRollResult(99, 80), "crit-fail");
});
