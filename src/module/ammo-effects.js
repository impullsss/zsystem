export const AMMO_KIND_PRESETS = {
    standard: {
        id: "standard",
        label: "Обычные",
        damageBonus: 0,
        ballisticPowerBonus: 0,
        armorPiercingBonus: 0,
        lineWidthModifier: 0,
        burstConeAngleModifier: 0,
        noiseModifier: 0,
        jamChanceBonus: 0,
        traumaMultiplier: 1
    },
    "armor-piercing": {
        id: "armor-piercing",
        label: "Бронебойные",
        damageBonus: -1,
        ballisticPowerBonus: 8,
        armorPiercingBonus: 6,
        lineWidthModifier: -0.05,
        burstConeAngleModifier: -1,
        noiseModifier: 1,
        jamChanceBonus: 0,
        traumaMultiplier: 0.9
    },
    expansive: {
        id: "expansive",
        label: "Экспансивные",
        damageBonus: 4,
        ballisticPowerBonus: -8,
        armorPiercingBonus: -4,
        lineWidthModifier: 0.1,
        burstConeAngleModifier: 1,
        noiseModifier: 0,
        jamChanceBonus: 0,
        traumaMultiplier: 1.25
    },
    slug: {
        id: "slug",
        label: "Пуля",
        damageBonus: 3,
        ballisticPowerBonus: 6,
        armorPiercingBonus: 1,
        lineWidthModifier: -0.1,
        burstConeAngleModifier: -2,
        noiseModifier: 1,
        jamChanceBonus: 0,
        traumaMultiplier: 1.1
    },
    shot: {
        id: "shot",
        label: "Дробь",
        damageBonus: 2,
        ballisticPowerBonus: -12,
        armorPiercingBonus: -6,
        lineWidthModifier: 0.9,
        burstConeAngleModifier: 8,
        noiseModifier: 2,
        jamChanceBonus: 0,
        traumaMultiplier: 1.15
    },
    subsonic: {
        id: "subsonic",
        label: "Дозвуковые",
        damageBonus: -2,
        ballisticPowerBonus: -10,
        armorPiercingBonus: -2,
        lineWidthModifier: 0,
        burstConeAngleModifier: 0,
        noiseModifier: -4,
        jamChanceBonus: 0,
        traumaMultiplier: 0.95
    },
    homemade: {
        id: "homemade",
        label: "Самодельные",
        damageBonus: 1,
        ballisticPowerBonus: -4,
        armorPiercingBonus: -1,
        lineWidthModifier: 0.15,
        burstConeAngleModifier: 2,
        noiseModifier: 1,
        jamChanceBonus: 3,
        traumaMultiplier: 1.05
    }
};

const AMMO_SYSTEM_FIELDS = [
    "ammoKind",
    "calibre",
    "damageBonus",
    "ballisticPowerBonus",
    "armorPiercingBonus",
    "lineWidthModifier",
    "burstConeAngleModifier",
    "noiseModifier",
    "jamChanceBonus",
    "traumaMultiplier"
];

export function getAmmoProfile(ammo = null) {
    const system = ammo?.system || ammo || {};
    const kind = system.ammoKind || "standard";
    const preset = AMMO_KIND_PRESETS[kind] || AMMO_KIND_PRESETS.standard;

    return {
        ...preset,
        id: preset.id,
        name: ammo?.name || system.name || preset.label,
        label: ammo?.name || system.label || preset.label,
        calibre: system.calibre || "",
        damageBonus: preset.damageBonus + finiteNumber(system.damageBonus),
        ballisticPowerBonus: preset.ballisticPowerBonus + finiteNumber(system.ballisticPowerBonus),
        armorPiercingBonus: preset.armorPiercingBonus + finiteNumber(system.armorPiercingBonus),
        lineWidthModifier: preset.lineWidthModifier + finiteNumber(system.lineWidthModifier),
        burstConeAngleModifier: preset.burstConeAngleModifier + finiteNumber(system.burstConeAngleModifier),
        noiseModifier: preset.noiseModifier + finiteNumber(system.noiseModifier),
        jamChanceBonus: Math.max(0, preset.jamChanceBonus + finiteNumber(system.jamChanceBonus)),
        traumaMultiplier: Math.max(0.1, Number((preset.traumaMultiplier + finiteNumber(system.traumaMultiplier)).toFixed(2)))
    };
}

export function findCompatibleAmmoItems(items = [], calibre = "") {
    const wanted = String(calibre || "").trim();
    if (!wanted) return [];

    return Array.from(items || [])
        .filter((item) => item?.type === "ammo")
        .filter((item) => String(item.system?.calibre || "").trim() === wanted)
        .filter((item) => (Number(item.system?.quantity) || 0) > 0)
        .sort((a, b) => buildAmmoSummary(a).localeCompare(buildAmmoSummary(b), "ru"));
}

export function buildAmmoSummary(ammo = null) {
    if (!ammo) return "Патрон не выбран";
    const profile = getAmmoProfile(ammo);
    const parts = [];

    if (profile.damageBonus) parts.push(`урон ${signed(profile.damageBonus)}`);
    if (profile.ballisticPowerBonus) parts.push(`мощь ${signed(profile.ballisticPowerBonus)}`);
    if (profile.armorPiercingBonus) parts.push(`бронебой ${signed(profile.armorPiercingBonus)}`);
    if (profile.lineWidthModifier) parts.push(`линия ${signed(profile.lineWidthModifier)}`);
    if (profile.burstConeAngleModifier) parts.push(`конус ${signed(profile.burstConeAngleModifier)}`);
    if (profile.noiseModifier) parts.push(`шум ${signed(profile.noiseModifier)}`);
    if (profile.jamChanceBonus) parts.push(`клин +${profile.jamChanceBonus}%`);
    if (profile.traumaMultiplier !== 1) parts.push(`травма x${profile.traumaMultiplier}`);

    const calibre = profile.calibre ? ` · ${profile.calibre}` : "";
    return `${profile.label}${calibre}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

export function applyAmmoProfileToFirearmProfile(profile, ammo = null) {
    if (!profile) return profile;
    const ammoProfile = getAmmoProfile(ammo);

    return {
        ...profile,
        ammo: ammoProfile,
        baseDamage: Math.max(1, Math.round((Number(profile.baseDamage) || 0) + ammoProfile.damageBonus)),
        ballisticPower: Math.max(1, Math.round((Number(profile.ballisticPower) || 0) + ammoProfile.ballisticPowerBonus)),
        armorPiercing: Math.round((Number(profile.armorPiercing) || 0) + ammoProfile.armorPiercingBonus),
        lineWidth: Math.max(0.1, Number(((Number(profile.lineWidth) || 0) + ammoProfile.lineWidthModifier).toFixed(2))),
        burstConeAngle: Math.max(1, Math.round((Number(profile.burstConeAngle) || 0) + ammoProfile.burstConeAngleModifier)),
        noiseModifier: ammoProfile.noiseModifier,
        jamChanceBonus: ammoProfile.jamChanceBonus,
        traumaMultiplier: ammoProfile.traumaMultiplier
    };
}

export function getAmmoTraumaMultiplier(ammo = null) {
    if (!ammo) return 1;
    return getAmmoProfile(ammo).traumaMultiplier;
}

export function serializeAmmoForWeapon(ammoItem) {
    if (!ammoItem) return null;
    const system = {};
    for (const field of AMMO_SYSTEM_FIELDS) {
        if (ammoItem.system?.[field] !== undefined) system[field] = ammoItem.system[field];
    }

    return {
        id: ammoItem.id,
        uuid: ammoItem.uuid,
        name: ammoItem.name,
        type: ammoItem.type,
        img: ammoItem.img,
        system
    };
}

export function getLoadedAmmoData(weaponItem) {
    return weaponItem?.getFlag?.("zsystem", "loadedAmmoData")
        || weaponItem?.flags?.zsystem?.loadedAmmoData
        || null;
}

function finiteNumber(value) {
    const number = Number(String(value ?? "").trim().replace(",", "."));
    return Number.isFinite(number) ? number : 0;
}

function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
}
