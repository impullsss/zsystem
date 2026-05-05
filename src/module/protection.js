export const DAMAGE_TYPES = {
    blunt: "blunt",
    slashing: "slashing",
    piercing: "piercing",
    ballistic: "ballistic",
    fire: "fire",
    true: "true"
};

export function getActorProtection(actor, {
    location = "torso",
    damageType = DAMAGE_TYPES.blunt,
    ignoreAC = false,
    includeNatural = true
} = {}) {
    if (!actor || damageType === DAMAGE_TYPES.true) {
        return emptyProtection();
    }

    const protection = emptyProtection();

    if (!ignoreAC && includeNatural) {
        protection.naturalAC = Math.max(0, Number(actor.system?.secondary?.naturalAC?.value) || 0);
        protection.ac += protection.naturalAC;
    }

    for (const armor of getEquippedCoveredArmors(actor, location)) {
        const ac = Math.max(0, Number(armor.system?.ac) || 0);
        const dr = Math.max(0, Number(armor.system?.dr?.[damageType]) || 0);

        if (!ignoreAC) {
            protection.armorAC += ac;
            protection.ac += ac;
        }
        protection.resist += dr;
        protection.sources.push({
            id: armor.id,
            uuid: armor.uuid,
            name: armor.name,
            item: armor,
            ac,
            resist: dr,
            hp: {
                value: Number(armor.system?.hp?.value) || 0,
                max: Number(armor.system?.hp?.max) || 0
            }
        });
    }

    protection.resist = clamp(protection.resist, 0, 100);
    return protection;
}

export function resolveDamageProtection({
    amount = 0,
    damageType = DAMAGE_TYPES.blunt,
    protection = null,
    armorPiercing = 0,
    headshot = false
} = {}) {
    const raw = Math.max(0, Number(amount) || 0);
    const safeProtection = protection || emptyProtection();
    const piercing = Math.max(0, Number(armorPiercing) || 0);
    const ac = damageType === DAMAGE_TYPES.true
        ? 0
        : Math.max(0, Number(safeProtection.ac) || 0);
    const effectiveAC = Math.max(0, ac - piercing);
    const resist = damageType === DAMAGE_TYPES.true
        ? 0
        : clamp(Number(safeProtection.resist) || 0, 0, 100);
    const afterResist = Math.floor(raw * (1 - resist / 100));
    const baseDamage = Math.max(0, afterResist - effectiveAC);
    const finalDamage = headshot ? baseDamage * 2 : baseDamage;

    return {
        raw,
        damageType,
        ac,
        armorPiercing: piercing,
        effectiveAC,
        resist,
        afterResist,
        baseDamage,
        finalDamage
    };
}

export function calculateArmorWear({
    protectionResult,
    protection,
    damageType = DAMAGE_TYPES.blunt
} = {}) {
    if (!protection?.sources?.length || !protectionResult) return emptyArmorWear();
    if (damageType === DAMAGE_TYPES.true) return emptyArmorWear();

    const mitigatedByAC = Math.max(0, protectionResult.afterResist - protectionResult.baseDamage);
    const resisted = Math.max(0, protectionResult.raw - protectionResult.afterResist);
    const stress = mitigatedByAC + Math.floor(resisted / 2);

    if (stress <= 0) return emptyArmorWear();

    const typeMultiplier = {
        ballistic: 1.2,
        piercing: 1,
        slashing: 0.8,
        blunt: 0.7,
        fire: 0.5
    }[damageType] ?? 1;
    const wear = Math.max(1, Math.min(6, Math.ceil((stress * typeMultiplier) / 10)));

    return {
        enabled: true,
        amount: wear,
        stress,
        sources: protection.sources
    };
}

export async function applyArmorWear(armorWear) {
    if (!armorWear?.enabled || armorWear.amount <= 0) return [];

    const updated = [];
    let remaining = armorWear.amount;
    const sources = armorWear.sources
        .filter((source) => source?.item?.system?.hp)
        .sort((a, b) => (b.ac + b.resist) - (a.ac + a.resist));

    for (const source of sources) {
        if (remaining <= 0) break;

        const current = Number(source.item.system.hp.value) || 0;
        if (current <= 0) continue;

        const loss = Math.min(current, remaining);
        const next = Math.max(0, current - loss);
        await source.item.update({ "system.hp.value": next });
        updated.push({
            id: source.id,
            name: source.name,
            before: current,
            after: next,
            loss
        });
        remaining -= loss;
    }

    return updated;
}

export function getBallisticArmor(actor, location = "torso") {
    return getActorProtection(actor, {
        location,
        damageType: DAMAGE_TYPES.ballistic,
        ignoreAC: false,
        includeNatural: true
    }).ac;
}

function getEquippedCoveredArmors(actor, location) {
    const items = actor?.items;
    const filter = (item) => item?.type === "armor"
        && item.system?.equipped
        && item.system?.coverage
        && item.system.coverage[location];

    if (typeof items?.filter === "function") return items.filter(filter) || [];
    if (Array.isArray(items)) return items.filter(filter);
    return [];
}

function emptyProtection() {
    return {
        ac: 0,
        naturalAC: 0,
        armorAC: 0,
        resist: 0,
        sources: []
    };
}

function emptyArmorWear() {
    return {
        enabled: false,
        amount: 0,
        stress: 0,
        sources: []
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
