import test from "node:test";
import assert from "node:assert/strict";

import { buildDamageFormula, applyDamageModifiers, finalizeDamageAmount, getCritMultiplier } from "../src/module/attack-damage.js";

test("buildDamageFormula keeps normal damage formula unchanged", () => {
    assert.equal(buildDamageFormula("2d6+3", "success"), "2d6+3");
});

test("buildDamageFormula wraps crit-success with 1.5 multiplier", () => {
    assert.equal(buildDamageFormula("2d6+3", "crit-success"), "ceil((2d6+3) * 1.5)");
});

test("buildDamageFormula uses weapon crit multiplier override", () => {
    assert.equal(buildDamageFormula("2d6+3", "crit-success", { critMultiplier: 2 }), "ceil((2d6+3) * 2)");
});

test("getCritMultiplier reads weapon multiplier with fallback", () => {
    assert.equal(getCritMultiplier({ system: { critMult: 2.25 } }), 2.25);
    assert.equal(getCritMultiplier({ system: { critMult: 0 } }), 1.5);
    assert.equal(getCritMultiplier(null), 1.5);
});

test("applyDamageModifiers adds strength for one-handed melee", () => {
    const result = applyDamageModifiers({
        rolledDamage: 10,
        weaponType: "melee",
        hands: "1h",
        strength: 4,
        isStealth: false
    });

    assert.equal(result.strengthBonus, 4);
    assert.equal(result.stealthMultiplier, 1);
    assert.equal(result.finalDamage, 14);
});

test("applyDamageModifiers doubles strength bonus for two-handed melee", () => {
    const result = applyDamageModifiers({
        rolledDamage: 10,
        weaponType: "melee",
        hands: "2h",
        strength: 4,
        isStealth: false
    });

    assert.equal(result.strengthBonus, 8);
    assert.equal(result.finalDamage, 18);
});

test("applyDamageModifiers does not add strength for ranged attacks", () => {
    const result = applyDamageModifiers({
        rolledDamage: 10,
        weaponType: "ranged",
        hands: "2h",
        strength: 10,
        isStealth: false
    });

    assert.equal(result.strengthBonus, 0);
    assert.equal(result.finalDamage, 10);
});

test("applyDamageModifiers applies stealth multiplier after melee strength bonus", () => {
    const result = applyDamageModifiers({
        rolledDamage: 10,
        weaponType: "melee",
        hands: "1h",
        strength: 5,
        isStealth: true
    });

    assert.equal(result.strengthBonus, 5);
    assert.equal(result.stealthMultiplier, 2);
    assert.equal(result.finalDamage, 30);
});

test("finalizeDamageAmount floors damage and keeps minimum 1", () => {
    assert.equal(finalizeDamageAmount(12.9), 12);
    assert.equal(finalizeDamageAmount(0), 1);
    assert.equal(finalizeDamageAmount(-4), 1);
});
