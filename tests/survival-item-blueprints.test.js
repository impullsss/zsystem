import test from "node:test";
import assert from "node:assert/strict";

import { getSurvivalItemData } from "../src/module/survival-item-blueprints.js";

test("survival starter item data contains real Foundry item documents", () => {
    const items = getSurvivalItemData();
    const names = items.map((item) => item.name);

    assert.ok(items.length >= 10);
    assert.ok(names.includes("[ZT] Чистая вода"));
    assert.ok(names.includes("[ZT] Ремонтные детали"));
    for (const item of items) {
        assert.ok(item.type);
        assert.ok(item.img);
        assert.ok(item.system.quantity >= 1);
        assert.ok(item.flags.zsystem.survivalBlueprint);
    }
});

test("survival starter items include dirty water spoilage tools and medicine hooks", () => {
    const items = getSurvivalItemData();
    const dirtyWater = items.find((item) => item.name === "[ZT] Грязная вода");
    const freshMeat = items.find((item) => item.name === "[ZT] Свежее мясо");
    const workshop = items.find((item) => item.name === "[ZT] Мастерская");
    const medkit = items.find((item) => item.name === "[ZT] Аптечка");

    assert.equal(dirtyWater.system.category, "water");
    assert.ok(dirtyWater.system.contamination > 0);
    assert.ok(freshMeat.system.spoilage > 0);
    assert.equal(workshop.system.category, "workshop");
    assert.ok(medkit.system.healAmount > 0);
});
