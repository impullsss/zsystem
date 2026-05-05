import { AMMO_KIND_PRESETS } from "../src/module/ammo-effects.js";
import { getFirearmProfile, resolveProjectileImpact } from "../src/module/firearm-ballistics.js";
import { calculateArmorWear, getActorProtection, resolveDamageProtection } from "../src/module/protection.js";

const weapon = {
    name: "combat rifle",
    system: {
        weaponType: "ranged",
        ballisticPower: 34,
        armorPiercing: 2,
        lineWidth: 0.75,
        burstConeAngle: 18
    }
};

const attack = { name: "Single shot", dmg: "20", bullets: 1 };

const targets = [
    makeTarget("unarmored", "no armor", { naturalAC: 1, armorAC: 0, ballisticDR: 0 }),
    makeTarget("leather", "light jacket", { naturalAC: 2, armorAC: 3, ballisticDR: 5 }),
    makeTarget("vest", "ballistic vest", { naturalAC: 2, armorAC: 8, ballisticDR: 20 }),
    makeTarget("heavy", "heavy armor", { naturalAC: 3, armorAC: 14, ballisticDR: 30 })
];

console.log("ZSystem Protection Simulation");
console.log("=============================");
console.log(`Weapon: ${weapon.name} | damage ${attack.dmg} | power ${weapon.system.ballisticPower} | AP ${weapon.system.armorPiercing}`);
console.log("Live damage = normal attack damage after actor protection.");
console.log("Ballistic side-hit = projectile impact already spends armor AC, then actor DR may reduce it.");

for (const ammoKind of Object.keys(AMMO_KIND_PRESETS)) {
    printAmmo(ammoKind);
}

function printAmmo(ammoKind) {
    const ammo = { name: AMMO_KIND_PRESETS[ammoKind].label, system: { ammoKind, calibre: "test" } };
    const profile = getFirearmProfile(weapon, attack, ammo);

    console.log(`\nAmmo: ${profile.ammo.label}`);
    console.log(`Profile: dmg ${profile.baseDamage}, power ${profile.ballisticPower}, AP ${profile.armorPiercing}, trauma x${profile.traumaMultiplier}`);
    console.log("Target           AC  DR  impact final exit over live wear");

    for (const target of targets) {
        const protection = getActorProtection(target.actor, {
            location: "torso",
            damageType: "ballistic"
        });
        const impact = resolveProjectileImpact({
            target: { id: target.id, armor: protection.ac },
            incomingPower: profile.ballisticPower,
            armorPiercing: profile.armorPiercing,
            baseDamage: profile.baseDamage
        });
        const sideHit = resolveDamageProtection({
            amount: impact.damage,
            damageType: "ballistic",
            protection: { ac: 0, resist: protection.resist }
        });
        const liveHit = resolveDamageProtection({
            amount: profile.baseDamage,
            damageType: "ballistic",
            protection,
            armorPiercing: profile.armorPiercing
        });
        const armorWear = calculateArmorWear({
            protectionResult: liveHit,
            protection,
            damageType: "ballistic"
        });

        console.log([
            target.label.padEnd(15),
            String(protection.ac).padStart(2),
            `${String(protection.resist).padStart(2)}%`,
            String(impact.damage).padStart(6),
            String(sideHit.finalDamage).padStart(5),
            String(impact.exitPower).padStart(4),
            impact.penetrates ? " yes" : "  no",
            String(liveHit.finalDamage).padStart(4),
            armorWear.enabled ? String(armorWear.amount).padStart(4) : "   -"
        ].join(" "));
    }
}

function makeTarget(id, label, { naturalAC, armorAC, ballisticDR }) {
    return {
        id,
        label,
        actor: {
            system: {
                secondary: {
                    naturalAC: { value: naturalAC }
                }
            },
            items: armorAC > 0
                ? [{
                    id: `${id}-armor`,
                    name: label,
                    type: "armor",
                    system: {
                        equipped: true,
                        ac: armorAC,
                        coverage: { torso: true },
                        dr: { ballistic: ballisticDR }
                    }
                }]
                : []
        }
    };
}
