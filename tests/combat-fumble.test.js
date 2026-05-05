import test from "node:test";
import assert from "node:assert/strict";

import {
    getCritFailProfile,
    resolveCritFailEffects,
    projectCritFailPressure,
    formatCritFailProjection
} from "../src/module/combat-fumble.js";

test("crit fail profile defaults to ranged weapons", () => {
    const profile = getCritFailProfile({ system: { weaponType: "ranged" } });

    assert.equal(profile.key, "ranged");
    assert.equal(profile.effects.find((effect) => effect.key === "jam").chance, 0.5);
});

test("crit fail profile detects melee weapons", () => {
    const profile = getCritFailProfile({ system: { weaponType: "melee" } });

    assert.equal(profile.key, "melee");
    assert.ok(profile.effects.some((effect) => effect.key === "off-balance"));
});

test("crit fail profile detects throwing attacks", () => {
    const profile = getCritFailProfile(
        { system: { weaponType: "ranged", isThrowing: false } },
        { mode: "throw" }
    );

    assert.equal(profile.key, "throwing");
});

test("crit fail projection estimates expected effects per 100 attacks", () => {
    const projection = projectCritFailPressure({
        fumbles: 5,
        totalAttacks: 100,
        item: { system: { weaponType: "ranged" } }
    });

    assert.equal(projection.fumbleRate, 0.05);
    assert.equal(
        projection.effects.find((effect) => effect.key === "jam").expectedPer100Attacks,
        2.5
    );
    assert.match(formatCritFailProjection(projection), /Jam\/100 2\.50/);
});

test("ammo can raise ranged jam chance", () => {
    const profile = getCritFailProfile(
        { system: { weaponType: "ranged" } },
        null,
        { system: { ammoKind: "homemade", jamChanceBonus: 7 } }
    );

    assert.equal(profile.effects.find((effect) => effect.key === "jam").chance, 0.6);
});

test("crit fail effects roll concrete triggered consequences", () => {
    const rolls = [0.49, 0.99, 0.51];
    const result = resolveCritFailEffects({
        item: { system: { weaponType: "ranged" } },
        random: () => rolls.shift()
    });

    assert.deepEqual(result.triggeredEffects.map((effect) => effect.key), ["jam", "durability-loss"]);
    assert.equal(result.effects.find((effect) => effect.key === "extra-noise").triggered, false);
});
