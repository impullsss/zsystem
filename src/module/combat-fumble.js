import { getAmmoProfile } from "./ammo-effects.js";

export const CRIT_FAIL_PROFILES = {
    ranged: {
        key: "ranged",
        label: "Ranged",
        effects: [
            { key: "jam", label: "Jam", chance: 0.5, amount: 1 },
            { key: "durability-loss", label: "Durability loss", chance: 1, amount: 1 },
            { key: "extra-noise", label: "Extra noise", chance: 0.5, amount: 1 }
        ]
    },
    melee: {
        key: "melee",
        label: "Melee",
        effects: [
            { key: "off-balance", label: "Off balance", chance: 0.5, amount: 1 },
            { key: "durability-loss", label: "Durability loss", chance: 0.5, amount: 1 },
            { key: "weapon-drop", label: "Weapon drop", chance: 0.1, amount: 1 }
        ]
    },
    throwing: {
        key: "throwing",
        label: "Throwing",
        effects: [
            { key: "bad-scatter", label: "Bad scatter", chance: 0.75, amount: 1 },
            { key: "item-lost", label: "Item lost", chance: 0.5, amount: 1 },
            { key: "off-balance", label: "Off balance", chance: 0.25, amount: 1 }
        ]
    }
};

export function getCritFailProfile(item = null, attack = null, ammo = null) {
    const weaponType = item?.system?.weaponType || "";
    const isThrowing = attack?.mode === "throw" || item?.system?.isThrowing === true;

    const baseProfile = isThrowing
        ? CRIT_FAIL_PROFILES.throwing
        : weaponType === "melee"
            ? CRIT_FAIL_PROFILES.melee
            : CRIT_FAIL_PROFILES.ranged;

    return applyAmmoToCritFailProfile(baseProfile, ammo);
}

export function resolveCritFailEffects({
    item = null,
    attack = null,
    ammo = null,
    random = Math.random
} = {}) {
    const profile = getCritFailProfile(item, attack, ammo);
    const effects = profile.effects.map((effect) => {
        const roll = random();
        const triggered = roll <= effect.chance;
        return {
            ...effect,
            roll,
            triggered
        };
    });

    return {
        profile,
        effects,
        triggeredEffects: effects.filter((effect) => effect.triggered)
    };
}

export function projectCritFailPressure({
    fumbles = 0,
    totalAttacks = 0,
    item = null,
    attack = null,
    ammo = null
} = {}) {
    const profile = getCritFailProfile(item, attack, ammo);
    const fumbleRate = totalAttacks > 0 ? fumbles / totalAttacks : 0;

    return {
        profileKey: profile.key,
        profileLabel: profile.label,
        fumbleRate,
        effects: profile.effects.map((effect) => ({
            ...effect,
            expectedPer100Attacks: fumbleRate * 100 * effect.chance * effect.amount
        }))
    };
}

function applyAmmoToCritFailProfile(profile, ammo) {
    if (!ammo || profile.key !== "ranged") return cloneProfile(profile);

    const ammoProfile = getAmmoProfile(ammo);
    if (!ammoProfile.jamChanceBonus) return cloneProfile(profile);

    return {
        ...profile,
        effects: profile.effects.map((effect) => {
            if (effect.key !== "jam") return { ...effect };
            return {
                ...effect,
                chance: clampChance(effect.chance + (ammoProfile.jamChanceBonus / 100))
            };
        })
    };
}

function cloneProfile(profile) {
    return {
        ...profile,
        effects: profile.effects.map((effect) => ({ ...effect }))
    };
}

function clampChance(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

export function formatCritFailProjection(projection) {
    if (!projection?.effects?.length) return "none";
    return projection.effects
        .map((effect) => `${effect.label}/100 ${effect.expectedPer100Attacks.toFixed(2)}`)
        .join(", ");
}
