import test from "node:test";
import assert from "node:assert/strict";

import {
    calculateArmorWear,
    getActorProtection,
    getBallisticArmor,
    resolveDamageProtection
} from "../src/module/protection.js";

function makeActor() {
    return {
        system: {
            secondary: {
                naturalAC: { value: 2 }
            }
        },
        items: [
            {
                id: "vest",
                name: "Vest",
                type: "armor",
                system: {
                    equipped: true,
                    ac: 6,
                    coverage: { torso: true, head: false },
                    dr: { ballistic: 20, blunt: 10 }
                }
            },
            {
                id: "helmet",
                name: "Helmet",
                type: "armor",
                system: {
                    equipped: true,
                    ac: 4,
                    coverage: { torso: false, head: true },
                    dr: { ballistic: 15 }
                }
            }
        ]
    };
}

test("actor protection combines natural AC with covered equipped armor", () => {
    const protection = getActorProtection(makeActor(), {
        location: "torso",
        damageType: "ballistic"
    });

    assert.equal(protection.naturalAC, 2);
    assert.equal(protection.armorAC, 6);
    assert.equal(protection.ac, 8);
    assert.equal(protection.resist, 20);
    assert.deepEqual(protection.sources.map((source) => source.id), ["vest"]);
});

test("ballistic armor uses the shared actor protection model", () => {
    assert.equal(getBallisticArmor(makeActor(), "head"), 6);
});

test("damage protection keeps current armor and resist order while supporting AP", () => {
    const result = resolveDamageProtection({
        amount: 20,
        damageType: "ballistic",
        protection: { ac: 8, resist: 20 },
        armorPiercing: 3
    });

    assert.equal(result.afterResist, 16);
    assert.equal(result.effectiveAC, 5);
    assert.equal(result.finalDamage, 11);
});

test("true damage ignores armor and resistance", () => {
    const result = resolveDamageProtection({
        amount: 12,
        damageType: "true",
        protection: { ac: 99, resist: 99 },
        armorPiercing: 99
    });

    assert.equal(result.finalDamage, 12);
    assert.equal(result.effectiveAC, 0);
    assert.equal(result.resist, 0);
});

test("armor wear estimates durability stress from mitigated damage", () => {
    const protection = getActorProtection(makeActor(), {
        location: "torso",
        damageType: "ballistic"
    });
    const result = resolveDamageProtection({
        amount: 20,
        damageType: "ballistic",
        protection,
        armorPiercing: 2
    });
    const wear = calculateArmorWear({
        protectionResult: result,
        protection,
        damageType: "ballistic"
    });

    assert.equal(wear.enabled, true);
    assert.ok(wear.amount >= 1);
    assert.equal(wear.sources[0].id, "vest");
});
