import test from "node:test";
import assert from "node:assert/strict";

import {
    applyAmmoProfileToFirearmProfile,
    buildAmmoSummary,
    findCompatibleAmmoItems,
    getAmmoProfile,
    serializeAmmoForWeapon
} from "../src/module/ammo-effects.js";
import { getFirearmProfile, resolveProjectileImpact } from "../src/module/firearm-ballistics.js";

test("ammo presets can modify firearm profile", () => {
    const profile = getFirearmProfile(
        { system: { weaponType: "ranged", ballisticPower: 30, armorPiercing: 2, lineWidth: 0.75 } },
        { dmg: "20", bullets: 1 },
        { system: { ammoKind: "armor-piercing", calibre: "12g" } }
    );

    assert.equal(profile.ammo.id, "armor-piercing");
    assert.equal(profile.baseDamage, 19);
    assert.equal(profile.ballisticPower, 38);
    assert.equal(profile.armorPiercing, 8);
    assert.equal(profile.lineWidth, 0.7);
    assert.equal(profile.traumaMultiplier, 0.9);
});

test("custom ammo bonuses stack with preset bonuses", () => {
    const ammo = getAmmoProfile({
        name: "Hot AP",
        system: {
            ammoKind: "armor-piercing",
            damageBonus: 2,
            armorPiercingBonus: 1,
            noiseModifier: 2
        }
    });

    assert.equal(ammo.label, "Hot AP");
    assert.equal(ammo.damageBonus, 1);
    assert.equal(ammo.armorPiercingBonus, 7);
    assert.equal(ammo.noiseModifier, 3);
    assert.equal(ammo.traumaMultiplier, 0.9);
});

test("serialized ammo keeps only fields needed by a loaded weapon", () => {
    const serialized = serializeAmmoForWeapon({
        id: "ammo-id",
        uuid: "Actor.x.Item.y",
        name: "Expansive .38",
        type: "ammo",
        img: "icons/ammo.webp",
        system: {
            calibre: ".38",
            ammoKind: "expansive",
            damageBonus: 1,
            quantity: 50
        }
    });

    assert.equal(serialized.name, "Expansive .38");
    assert.equal(serialized.system.calibre, ".38");
    assert.equal(serialized.system.ammoKind, "expansive");
    assert.equal(serialized.system.damageBonus, 1);
    assert.equal(serialized.system.quantity, undefined);
});

test("armor-piercing ammo improves overpenetration math", () => {
    const base = { baseDamage: 20, ballisticPower: 28, armorPiercing: 0, lineWidth: 0.75, burstConeAngle: 18 };
    const normalImpact = resolveProjectileImpact({
        target: { id: "armored", armor: 12 },
        incomingPower: base.ballisticPower,
        armorPiercing: base.armorPiercing,
        baseDamage: base.baseDamage
    });
    const apProfile = applyAmmoProfileToFirearmProfile(base, { system: { ammoKind: "armor-piercing" } });
    const apImpact = resolveProjectileImpact({
        target: { id: "armored", armor: 12 },
        incomingPower: apProfile.ballisticPower,
        armorPiercing: apProfile.armorPiercing,
        baseDamage: apProfile.baseDamage
    });

    assert.equal(normalImpact.penetrates, false);
    assert.equal(apImpact.penetrates, true);
    assert.ok(apImpact.damage > normalImpact.damage);
});

test("compatible ammo list filters by calibre and available quantity", () => {
    const ammo = findCompatibleAmmoItems([
        { id: "empty", type: "ammo", name: "Empty", system: { calibre: "9mm", quantity: 0 } },
        { id: "wrong", type: "ammo", name: "Wrong", system: { calibre: "12g", quantity: 10 } },
        { id: "ap", type: "ammo", name: "AP", system: { calibre: "9mm", quantity: 5, ammoKind: "armor-piercing" } },
        { id: "med", type: "medicine", name: "Not Ammo", system: { calibre: "9mm", quantity: 5 } }
    ], "9mm");

    assert.deepEqual(ammo.map((item) => item.id), ["ap"]);
});

test("ammo summary explains important modifiers", () => {
    const summary = buildAmmoSummary({
        name: "Самокрут",
        system: {
            calibre: "12g",
            ammoKind: "homemade",
            damageBonus: 2,
            jamChanceBonus: 4
        }
    });

    assert.match(summary, /Самокрут/);
    assert.match(summary, /12g/);
    assert.match(summary, /урон \+3/);
    assert.match(summary, /клин \+7%/);
});

test("slug and shot ammo separate shotgun projectile behavior", () => {
    const base = { baseDamage: 20, ballisticPower: 30, armorPiercing: 0, lineWidth: 0.75, burstConeAngle: 18 };
    const slug = applyAmmoProfileToFirearmProfile(base, { system: { ammoKind: "slug" } });
    const shot = applyAmmoProfileToFirearmProfile(base, { system: { ammoKind: "shot" } });

    assert.equal(slug.ammo.label, "Пуля");
    assert.equal(slug.lineWidth, 0.65);
    assert.equal(slug.burstConeAngle, 16);
    assert.ok(slug.ballisticPower > base.ballisticPower);
    assert.ok(shot.lineWidth > slug.lineWidth);
    assert.ok(shot.burstConeAngle > slug.burstConeAngle);
    assert.ok(shot.ballisticPower < slug.ballisticPower);
});
