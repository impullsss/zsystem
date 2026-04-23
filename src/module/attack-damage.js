export function buildDamageFormula(baseFormula, resultType) {
    if (resultType === "crit-success") {
        return `ceil((${baseFormula}) * 1.5)`;
    }
    return baseFormula;
}

export function applyDamageModifiers({
    rolledDamage = 0,
    weaponType = "ranged",
    hands = "1h",
    strength = 0,
    isStealth = false
}) {
    let finalDamage = rolledDamage;
    let strengthBonus = 0;
    let stealthMultiplier = 1;

    if (weaponType === "melee") {
        strengthBonus = hands === "2h" ? strength * 2 : strength;
        finalDamage += strengthBonus;
    }

    if (isStealth) {
        stealthMultiplier = 2;
        finalDamage *= stealthMultiplier;
    }

    return {
        finalDamage,
        strengthBonus,
        stealthMultiplier
    };
}

export function finalizeDamageAmount(value) {
    return Math.max(1, Math.floor(value));
}
