import test from "node:test";
import assert from "node:assert/strict";

import {
    buildTraumaHtml,
    resolveTraumaOutcome,
    TRAUMA_MODE,
    TRAUMA_SEVERITY
} from "../src/module/trauma.js";

test("small damage does not create trauma", () => {
    const trauma = resolveTraumaOutcome({
        damage: 2,
        maxHp: 100,
        limbMax: 30,
        location: "torso",
        damageType: "blunt"
    });

    assert.equal(trauma.enabled, false);
    assert.equal(trauma.severity, TRAUMA_SEVERITY.none);
});

test("serious ballistic wound can suggest bleeding for torso", () => {
    const trauma = resolveTraumaOutcome({
        damage: 15,
        maxHp: 100,
        limbMax: 30,
        location: "torso",
        damageType: "ballistic",
        targetUuid: "Actor.target",
        targetName: "Target"
    });

    assert.equal(trauma.enabled, true);
    assert.equal(trauma.severity, TRAUMA_SEVERITY.serious);
    assert.deepEqual(trauma.effects.map((effect) => effect.key), ["bleeding"]);
    assert.match(buildTraumaHtml(trauma), /z-apply-trauma/);
    assert.match(buildTraumaHtml(trauma), /data-action="bleeding"/);
});

test("critical head hit suggests injury, bleeding and dizzy", () => {
    const trauma = resolveTraumaOutcome({
        damage: 9,
        maxHp: 80,
        limbMax: 10,
        location: "head",
        damageType: "piercing",
        resultType: "crit-success"
    });

    assert.equal(trauma.severity, TRAUMA_SEVERITY.critical);
    assert.deepEqual(trauma.effects.map((effect) => effect.key), ["injury", "bleeding", "dizzy"]);
});

test("light trauma is descriptive and has no mechanical buttons", () => {
    const trauma = resolveTraumaOutcome({
        damage: 8,
        maxHp: 100,
        limbMax: 30,
        location: "rArm",
        damageType: "blunt"
    });

    assert.equal(trauma.severity, TRAUMA_SEVERITY.light);
    assert.equal(trauma.effects.length, 0);
    assert.match(buildTraumaHtml(trauma), /описательное/);
});

test("report mode describes trauma without GM buttons", () => {
    const trauma = resolveTraumaOutcome({
        damage: 15,
        maxHp: 100,
        limbMax: 30,
        location: "torso",
        damageType: "ballistic"
    });

    const html = buildTraumaHtml(trauma, { mode: TRAUMA_MODE.report });

    assert.doesNotMatch(html, /z-apply-trauma/);
    assert.match(html, /Возможные последствия/);
});

test("off mode hides trauma html", () => {
    const trauma = resolveTraumaOutcome({
        damage: 15,
        maxHp: 100,
        limbMax: 30,
        location: "torso",
        damageType: "ballistic"
    });

    assert.equal(buildTraumaHtml(trauma, { mode: TRAUMA_MODE.off }), "");
});

test("severity multiplier can soften or harden trauma thresholds", () => {
    const soft = resolveTraumaOutcome({
        damage: 8,
        maxHp: 100,
        limbMax: 30,
        location: "torso",
        damageType: "blunt",
        severityMultiplier: 0.5
    });
    const hard = resolveTraumaOutcome({
        damage: 8,
        maxHp: 100,
        limbMax: 30,
        location: "torso",
        damageType: "blunt",
        severityMultiplier: 2
    });

    assert.equal(soft.severity, TRAUMA_SEVERITY.none);
    assert.equal(hard.severity, TRAUMA_SEVERITY.serious);
});
