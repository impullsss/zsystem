import test from "node:test";
import assert from "node:assert/strict";

import {
    buildCampPlan,
    buildGatheringCheckPlan,
    resolveDirtyWaterRisk,
    resolveFoodSpoilage,
    resolveGatheringAttempt
} from "../src/module/survival-gathering.js";

test("gathering plan exposes DC risk and separate skill bands", () => {
    const plan = buildGatheringCheckPlan({
        survivalSkill: 50,
        mechanicalSkill: 30,
        hours: 4,
        terrain: "ruins",
        danger: "dangerous"
    });

    assert.ok(plan.dc > 50);
    assert.ok(plan.riskChance > 20);
    assert.ok(plan.survivalBands.successChance > plan.mechanicalBands.successChance);
});

test("gathering yields depend on terrain and result quality", () => {
    const crit = resolveGatheringAttempt({
        survivalSkill: 100,
        mechanicalSkill: 100,
        terrain: "urban",
        roll: 1,
        random: () => 1
    });
    const fail = resolveGatheringAttempt({
        survivalSkill: 10,
        mechanicalSkill: 10,
        terrain: "urban",
        roll: 80,
        random: () => 1
    });

    assert.equal(crit.resultType, "crit-success");
    assert.ok(crit.yield.parts > fail.yield.parts);
    assert.ok(crit.yield.food > fail.yield.food);
});

test("camp plan trades supplies for rest safety and expected gathering", () => {
    const camp = buildCampPlan({
        partySize: 4,
        hours: 8,
        terrain: "wilderness",
        activity: "hidden",
        survivalSkill: 60
    });

    assert.equal(camp.foodCost, 2.67);
    assert.equal(camp.waterCost, 4);
    assert.equal(camp.fatigueRecovery, 1);
    assert.ok(camp.dangerChance < 20);
});

test("food spoilage reports stacks that should decay", () => {
    const updates = resolveFoodSpoilage({
        hours: 24,
        temperature: "hot",
        items: [
            { type: "food", name: "Fresh meat", system: { quantity: 3, spoilage: 2 } },
            { type: "food", name: "Ration", system: { quantity: 3, spoilage: 0 } }
        ]
    });

    assert.equal(updates.length, 1);
    assert.equal(updates[0].spoiled, 3);
    assert.equal(updates[0].remaining, 0);
});

test("dirty water risk can be reduced by boiling and survival skill", () => {
    const raw = resolveDirtyWaterRisk({ waterUnits: 2, contamination: 45, survivalSkill: 0, boiled: false });
    const treated = resolveDirtyWaterRisk({ waterUnits: 2, contamination: 45, survivalSkill: 80, boiled: true });

    assert.ok(raw.chance > treated.chance);
    assert.equal(raw.label, "опасно");
    assert.equal(treated.label, "терпимо");
});
