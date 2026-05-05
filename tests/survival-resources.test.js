import test from "node:test";
import assert from "node:assert/strict";

import {
    buildSupplySpendPlan,
    classifySurvivalItem,
    countSurvivalResources,
    getSupplyFatiguePenalty,
    getToolQuality,
    planResourceSpend,
    TOOL_QUALITY
} from "../src/module/survival-resources.js";

test("survival items are classified by type category and name", () => {
    assert.equal(classifySurvivalItem({ type: "food", name: "Ration" }), "food");
    assert.equal(classifySurvivalItem({ type: "misc", name: "Clean water bottle", system: { category: "water" } }), "water");
    assert.equal(classifySurvivalItem({ type: "materials", name: "Repair parts" }), "parts");
    assert.equal(classifySurvivalItem({ type: "misc", name: "Field toolkit", system: { category: "tools" } }), "tools");
    assert.equal(classifySurvivalItem({ type: "medicine", name: "Bandage" }), "medicine");
});

test("resource counters use quantity resource value and best tool quality", () => {
    const totals = countSurvivalResources([
        { type: "food", name: "Ration", system: { quantity: 3, resourceValue: 1 } },
        { type: "misc", name: "Water", system: { category: "water", quantity: 2, resourceValue: 1.5 } },
        { type: "materials", name: "Scrap", system: { quantity: 4, resourceValue: 0.5 } },
        { type: "misc", name: "Workshop tools", system: { category: "workshop", quantity: 1 } }
    ]);

    assert.equal(totals.food, 3);
    assert.equal(totals.water, 3);
    assert.equal(totals.parts, 2);
    assert.equal(totals.bestToolQuality.id, TOOL_QUALITY.workshop.id);
});

test("resource spend plan reports covered and shortage states", () => {
    assert.deepEqual(planResourceSpend({ available: 3, required: 2.2 }), {
        required: 2.2,
        available: 3,
        spent: 3,
        shortage: 0,
        covered: true
    });

    const plan = buildSupplySpendPlan({
        pressure: { foodUnits: 2, waterUnits: 4 },
        inventory: { food: 1, water: 5 }
    });

    assert.equal(plan.food.shortage, 1);
    assert.equal(plan.water.covered, true);
    assert.equal(getSupplyFatiguePenalty(plan), 10);
});

test("tool quality detects improvised basic and workshop kits", () => {
    assert.equal(getToolQuality({ name: "Improvised wrench" }).id, "improvised");
    assert.equal(getToolQuality({ name: "Field toolkit", system: { category: "tools" } }).id, "basic");
    assert.equal(getToolQuality({ name: "Workshop bench", system: { category: "workshop" } }).id, "workshop");
});
