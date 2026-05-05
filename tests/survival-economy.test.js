import test from "node:test";
import assert from "node:assert/strict";

import {
    buildEconomyBalanceReport,
    buildSurvivalLoadoutPlan,
    estimateDailySurvivalNeeds,
    estimateRepairReserve,
    estimateScavengeHoursForResources,
    estimateScavengeYield,
    getEconomyItemBlueprints,
    priceAndWeighResources
} from "../src/module/survival-economy.js";

test("economy blueprints expose concrete item math", () => {
    const blueprints = getEconomyItemBlueprints();
    const food = blueprints.find((item) => item.id === "foodRation");
    const water = blueprints.find((item) => item.id === "cleanWater");

    assert.equal(food.units, 1);
    assert.equal(food.valueCaps, 8);
    assert.equal(water.weightKg, 1);
});

test("daily survival needs scale by party size days terrain and movement", () => {
    const oneDay = estimateDailySurvivalNeeds({ partySize: 1, days: 1, reserveRatio: 0 });
    const hardTrip = estimateDailySurvivalNeeds({
        partySize: 4,
        days: 3,
        terrain: "rough",
        movementMode: "forced",
        reserveRatio: 0
    });

    assert.equal(oneDay.foodUnits, 2);
    assert.equal(oneDay.waterUnits, 3);
    assert.ok(hardTrip.foodUnits > oneDay.foodUnits * 12);
    assert.ok(hardTrip.waterUnits > oneDay.waterUnits * 12);
});

test("loadout pricing makes water the weight driver and tools a real investment", () => {
    const loadout = buildSurvivalLoadoutPlan({
        partySize: 2,
        days: 2,
        reserveRatio: 0,
        includeTools: true
    });

    const waterRow = loadout.totals.rows.find((row) => row.resource === "water");
    const foodRow = loadout.totals.rows.find((row) => row.resource === "food");
    const toolRow = loadout.totals.rows.find((row) => row.resource === "tools");

    assert.ok(waterRow.weightKg > foodRow.weightKg);
    assert.equal(toolRow.valueCaps, 60);
    assert.ok(loadout.totals.weightKg > 10);
});

test("repair reserve converts vehicle weapon and trauma pressure into consumables", () => {
    const reserve = estimateRepairReserve({
        vehicleMissingHp: 15,
        expectedVehicleWearHp: 10,
        weaponRepairHp: 24,
        traumaCases: 2,
        reserveRatio: 0
    });

    assert.equal(reserve.partsUnits, 7);
    assert.equal(reserve.medicineUnits, 3);
});

test("resource pricing is linear and readable for Foundry item stacks", () => {
    const totals = priceAndWeighResources({
        food: 4,
        water: 6,
        parts: 2,
        medicine: 1,
        tools: 0
    });

    assert.equal(totals.weightKg, 8.9);
    assert.equal(totals.valueCaps, 94);
});

test("scavenging improves with skill and reports bottleneck hours", () => {
    const weak = estimateScavengeYield({ hours: 4, survivalSkill: 10, mechanicsSkill: 10 });
    const strong = estimateScavengeYield({ hours: 4, survivalSkill: 100, mechanicsSkill: 100 });
    const hours = estimateScavengeHoursForResources({
        resources: { food: 4, water: 6, parts: 2, medicine: 1 },
        survivalSkill: 50,
        mechanicsSkill: 50
    });

    assert.ok(strong.food > weak.food);
    assert.ok(strong.parts > weak.parts);
    assert.ok(hours.bottleneckHours > 0);
    assert.ok(hours.hours.medicine > hours.hours.water);
});

test("default economy report flags every scenario with balance metadata", () => {
    const report = buildEconomyBalanceReport();

    assert.ok(report.length >= 5);
    for (const row of report) {
        assert.ok(row.loadout.totals.valueCaps > 0);
        assert.ok(row.scavenge.bottleneckHours > 0);
        assert.ok(row.flags.length > 0);
    }
});
