import test from "node:test";
import assert from "node:assert/strict";

import {
    buildWeaponRepairPlan,
    resolveWeaponRepairAttempt
} from "../src/module/survival-maintenance.js";
import { TOOL_QUALITY } from "../src/module/survival-resources.js";

const weapon = {
    type: "weapon",
    name: "Test rifle",
    system: {
        hp: { value: 40, max: 100 },
        jammed: true
    }
};

test("weapon repair plan uses parts tools skill and weapon condition", () => {
    const noTools = buildWeaponRepairPlan({
        weapon,
        inventory: { parts: 4, bestToolQuality: TOOL_QUALITY.none },
        mechanicalSkill: 60,
        partsToSpend: 2
    });
    const workshop = buildWeaponRepairPlan({
        weapon,
        inventory: { parts: 4, bestToolQuality: TOOL_QUALITY.workshop },
        mechanicalSkill: 60,
        partsToSpend: 2
    });

    assert.equal(noTools.partsSpent, 2);
    assert.ok(noTools.dc > 50);
    assert.ok(workshop.successChance > noTools.successChance);
});

test("weapon repair outcomes repair clear jams or worsen weapons", () => {
    const base = {
        weapon,
        inventory: { parts: 4, bestToolQuality: TOOL_QUALITY.basic },
        mechanicalSkill: 80,
        partsToSpend: 2
    };
    const crit = resolveWeaponRepairAttempt({ ...base, roll: 1 });
    const success = resolveWeaponRepairAttempt({ ...base, roll: 30 });
    const fumble = resolveWeaponRepairAttempt({ ...base, mechanicalSkill: 0, roll: 100 });

    assert.equal(crit.resultType, "crit-success");
    assert.ok(crit.repairedHp > success.repairedHp);
    assert.equal(success.clearsJam, true);
    assert.equal(fumble.resultType, "crit-fail");
    assert.ok(fumble.hpAfter < weapon.system.hp.value);
});

test("weapon repair blocks when there is no damage or no parts", () => {
    const noDamage = resolveWeaponRepairAttempt({
        weapon: { type: "weapon", system: { hp: { value: 100, max: 100 } } },
        inventory: { parts: 4, bestToolQuality: TOOL_QUALITY.basic },
        mechanicalSkill: 80,
        partsToSpend: 1,
        roll: 20
    });
    const noParts = resolveWeaponRepairAttempt({
        weapon,
        inventory: { parts: 0, bestToolQuality: TOOL_QUALITY.basic },
        mechanicalSkill: 80,
        partsToSpend: 1,
        roll: 20
    });

    assert.equal(noDamage.resultType, "blocked");
    assert.equal(noParts.resultType, "blocked");
});
