import test from "node:test";
import assert from "node:assert/strict";

import {
    findFireLineCandidates,
    getFirearmProfile,
    parseBallisticNumber,
    resolveBurstBallistics,
    resolveJammedBurst,
    resolveProjectileImpact,
    resolveSingleShotBallistics
} from "../src/module/firearm-ballistics.js";

const source = { id: "shooter", x: 0, y: 0 };
const target = { id: "target", x: 10, y: 0, armor: 2, radius: 0.5 };

test("fire line detects bystanders standing on the shot lane", () => {
    const candidates = findFireLineCandidates({
        source,
        target,
        candidates: [
            { id: "safe", x: 5, y: 3, radius: 0.5 },
            { id: "line", x: 5, y: 0.4, radius: 0.5 },
            { id: "behind", x: 13, y: 0.2, radius: 0.5 }
        ],
        lineWidth: 0.5
    });

    assert.deepEqual(candidates.map((candidate) => candidate.id), ["line", "behind"]);
    assert.equal(candidates[0].onLine, true);
    assert.equal(candidates[1].behindTarget, true);
});

test("firearm profile accepts comma decimal line width", () => {
    const profile = getFirearmProfile(
        { system: { weaponType: "ranged", lineWidth: "0,5", burstConeAngle: "12,5" } },
        { dmg: "10", bullets: 1 },
        { system: { ammoKind: "standard", lineWidthModifier: "0,25" } }
    );

    assert.equal(profile.lineWidth, 0.75);
    assert.equal(profile.burstConeAngle, 13);
    assert.equal(parseBallisticNumber("1,25"), 1.25);
});

test("projectile impact can overpenetrate when power beats armor and body resistance", () => {
    const impact = resolveProjectileImpact({
        target: { id: "armored", armor: 5 },
        incomingPower: 42,
        armorPiercing: 3,
        baseDamage: 20
    });

    assert.equal(impact.effectiveArmor, 2);
    assert.equal(impact.penetrates, true);
    assert.ok(impact.exitPower > 8);
});

test("single success can hit the primary target and then an aligned target behind it", () => {
    const result = resolveSingleShotBallistics({
        source,
        target,
        bystanders: [{ id: "second", x: 13, y: 0.1, armor: 0, radius: 0.5 }],
        item: { system: { weaponType: "ranged", ballisticPower: 50, armorPiercing: 5 } },
        attack: { dmg: "20" },
        resultType: "success"
    });

    assert.deepEqual(result.impacts.map((impact) => impact.kind), ["primary", "overpenetration"]);
    assert.equal(result.impacts[1].targetId, "second");
});

test("ordinary miss can become a stray hit against a nearby line target", () => {
    const result = resolveSingleShotBallistics({
        source,
        target,
        bystanders: [{ id: "friend", x: 6, y: 0.1, armor: 0, radius: 0.5 }],
        item: { system: { weaponType: "ranged", ballisticPower: 30 } },
        attack: { dmg: "20" },
        resultType: "fail",
        missMargin: 4,
        random: () => 0
    });

    assert.equal(result.impacts.length, 1);
    assert.equal(result.impacts[0].kind, "stray");
    assert.equal(result.impacts[0].targetId, "friend");
});

test("crit fail can interrupt a burst before all requested shots are fired", () => {
    const burst = resolveJammedBurst({
        requestedShots: 5,
        resultType: "crit-fail",
        random: () => 0.2
    });

    assert.equal(burst.jammed, true);
    assert.equal(burst.interrupted, true);
    assert.equal(burst.firedShots, 1);
});

test("burst cone can distribute fired shots between several targets", () => {
    const rolls = [0.95, 0, 0, 0.95, 0, 0, 0.95, 0, 0];
    const result = resolveBurstBallistics({
        source,
        target,
        bystanders: [
            { id: "left", x: 9, y: 1, armor: 0, radius: 0.5 },
            { id: "far", x: 2, y: 6, armor: 0, radius: 0.5 }
        ],
        item: { system: { weaponType: "ranged", ballisticPower: 24, burstConeAngle: 20 } },
        attack: { dmg: "12", bullets: 3 },
        resultType: "success",
        random: () => rolls.shift() ?? 0
    });

    assert.equal(result.burst.firedShots, 3);
    assert.ok(result.coneCandidates.some((candidate) => candidate.id === "left"));
    assert.ok(result.impacts.length > 0);
});

test("burst attacks resolve each bullet separately instead of all-or-nothing", () => {
    const rolls = [0.1, 0.95, 0.1, 0.1, 0.1];
    const result = resolveBurstBallistics({
        source,
        target,
        bystanders: [
            { id: "left", x: 9, y: 1, armor: 0, radius: 0.5 }
        ],
        item: { system: { weaponType: "ranged", ballisticPower: 24, burstConeAngle: 24 } },
        attack: { dmg: "12", bullets: 3 },
        resultType: "success",
        random: () => rolls.shift() ?? 0.95
    });

    assert.equal(result.burst.firedShots, 3);
    assert.equal(result.impacts.filter((impact) => impact.kind === "primary").length, 2);
    assert.ok(result.impacts.some((impact) => impact.kind === "burst-cone"));
    assert.deepEqual(result.impacts.map((impact) => impact.shot), [1, 2, 3]);
});

test("failed burst can miss primary and only probabilistically hit line targets", () => {
    const noStray = resolveBurstBallistics({
        source,
        target,
        bystanders: [{ id: "friend", x: 5, y: 0.1, armor: 0, radius: 0.5 }],
        item: { system: { weaponType: "ranged", ballisticPower: 24, lineWidth: 0.75 } },
        attack: { dmg: "12", bullets: 3 },
        resultType: "fail",
        random: () => 0.99
    });
    const stray = resolveBurstBallistics({
        source,
        target,
        bystanders: [{ id: "friend", x: 5, y: 0.1, armor: 0, radius: 0.5 }],
        item: { system: { weaponType: "ranged", ballisticPower: 24, lineWidth: 0.75 } },
        attack: { dmg: "12", bullets: 3 },
        resultType: "fail",
        random: (() => {
            const rolls = [0.99, 0, 0.99, 0, 0.99, 0];
            return () => rolls.shift() ?? 0.99;
        })()
    });

    assert.equal(noStray.impacts.length, 0);
    assert.ok(stray.impacts.some((impact) => impact.kind === "stray"));
});

test("firearm profile derives shot count and average damage from attack data", () => {
    const profile = getFirearmProfile(
        { system: { weaponType: "ranged", armorPiercing: 2 } },
        { dmg: "2d6+3", bullets: 4 }
    );

    assert.equal(profile.requestedShots, 4);
    assert.equal(profile.baseDamage, 10);
    assert.equal(profile.armorPiercing, 2);
});
