import test from "node:test";
import assert from "node:assert/strict";

import { buildAttackCostContext, getAmmoConsumptionPlan, rollTriggeredEffects } from "../src/module/attack-rules.js";

test("buildAttackCostContext calculates base, extra and total AP correctly", () => {
    const result = buildAttackCostContext({
        attackAp: 4,
        aimSteps: 2,
        aimCostPerStep: 1,
        aimBonusPerStep: 10,
        currentAp: 10,
        hasArmInjury: true,
        panicState: "panic-anxious"
    });

    assert.equal(result.baseApCost, 6);
    assert.equal(result.extraApCost, 2);
    assert.equal(result.totalApCost, 8);
    assert.equal(result.aimBonusTotal, 20);
    assert.equal(result.ok, true);
});

test("buildAttackCostContext fails when AP is insufficient", () => {
    const result = buildAttackCostContext({
        attackAp: 4,
        aimSteps: 3,
        aimCostPerStep: 1,
        aimBonusPerStep: 10,
        currentAp: 5,
        hasArmInjury: false,
        panicState: null
    });

    assert.equal(result.totalApCost, 7);
    assert.equal(result.ok, false);
});

test("getAmmoConsumptionPlan spends bullets from magazine attacks", () => {
    const item = {
        system: {
            ammoType: "12g",
            isThrowing: false,
            mag: { value: 6 }
        }
    };
    const attack = { mode: "single", bullets: 2 };

    const plan = getAmmoConsumptionPlan(item, attack);

    assert.equal(plan.ok, true);
    assert.equal(plan.usesMagazine, true);
    assert.equal(plan.spentBullets, 2);
    assert.equal(plan.nextMagazineValue, 4);
});

test("getAmmoConsumptionPlan fails when magazine does not have enough bullets", () => {
    const item = {
        system: {
            ammoType: "12g",
            isThrowing: false,
            mag: { value: 1 }
        }
    };
    const attack = { mode: "single", bullets: 2 };

    const plan = getAmmoConsumptionPlan(item, attack);

    assert.equal(plan.ok, false);
    assert.equal(plan.nextMagazineValue, 1);
});

test("getAmmoConsumptionPlan skips magazine logic for throwing attacks", () => {
    const item = {
        system: {
            ammoType: "",
            isThrowing: true,
            mag: { value: 0 }
        }
    };
    const attack = { mode: "throw", bullets: 0 };

    const plan = getAmmoConsumptionPlan(item, attack);

    assert.equal(plan.ok, true);
    assert.equal(plan.isThrowingAction, true);
    assert.equal(plan.usesMagazine, false);
});

test("rollTriggeredEffects supports array effect definitions", () => {
    const attack = {
        effects: [
            { id: "bleeding", chance: 100 },
            { id: "stun", chance: 0 }
        ]
    };

    const sequence = [0.0, 0.99];
    let index = 0;
    const result = rollTriggeredEffects(attack, () => sequence[index++]);

    assert.deepEqual(result, ["bleeding"]);
});

test("rollTriggeredEffects supports legacy single effect fields", () => {
    const attack = {
        effect: "burning",
        chance: 50
    };

    const success = rollTriggeredEffects(attack, () => 0.2);
    const fail = rollTriggeredEffects(attack, () => 0.8);

    assert.deepEqual(success, ["burning"]);
    assert.deepEqual(fail, []);
});
