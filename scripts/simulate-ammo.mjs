import { AMMO_KIND_PRESETS, getAmmoProfile } from "../src/module/ammo-effects.js";
import {
    getFirearmProfile,
    resolveProjectileImpact
} from "../src/module/firearm-ballistics.js";
import { getCritFailProfile } from "../src/module/combat-fumble.js";

const weapon = {
    name: "baseline rifle",
    system: {
        weaponType: "ranged",
        ballisticPower: 32,
        armorPiercing: 2,
        lineWidth: 0.75,
        burstConeAngle: 18,
        noise: 12
    }
};
const attack = { dmg: "20", bullets: 1 };

const armorTargets = [
    { id: "unarmored", label: "no armor", armor: 0 },
    { id: "light", label: "light armor", armor: 4 },
    { id: "medium", label: "medium armor", armor: 8 },
    { id: "heavy", label: "heavy armor", armor: 14 }
];

console.log("ZSystem Ammo Balance Simulation");
console.log("===============================");
console.log(`Weapon: ${weapon.name} | base dmg ${attack.dmg} | power ${weapon.system.ballisticPower} | AP ${weapon.system.armorPiercing}`);

for (const ammoKind of Object.keys(AMMO_KIND_PRESETS)) {
    printAmmoKind(ammoKind);
}

function printAmmoKind(ammoKind) {
    const ammo = { name: AMMO_KIND_PRESETS[ammoKind].label, system: { ammoKind, calibre: "test" } };
    const profile = getFirearmProfile(weapon, attack, ammo);
    const ammoProfile = getAmmoProfile(ammo);
    const critFailProfile = getCritFailProfile(weapon, attack, ammo);
    const jamChance = critFailProfile.effects.find((effect) => effect.key === "jam")?.chance ?? 0;

    console.log(`\nAmmo: ${ammoProfile.label}`);
    console.log(`Profile: dmg ${profile.baseDamage}, power ${profile.ballisticPower}, AP ${profile.armorPiercing}, line ${profile.lineWidth}, cone ${profile.burstConeAngle}, noise ${signed((weapon.system.noise || 0) + (profile.noiseModifier || 0))}, jam on fumble ${(jamChance * 100).toFixed(0)}%`);

    for (const target of armorTargets) {
        const impact = resolveProjectileImpact({
            target,
            incomingPower: profile.ballisticPower,
            armorPiercing: profile.armorPiercing,
            baseDamage: profile.baseDamage
        });
        console.log(`- ${target.label.padEnd(12)} -> dmg ${String(impact.damage).padStart(2)}, eff armor ${String(impact.effectiveArmor).padStart(2)}, exit ${String(impact.exitPower).padStart(2)}, overpenetrates ${impact.penetrates ? "yes" : "no"}`);
    }
}

function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
}
