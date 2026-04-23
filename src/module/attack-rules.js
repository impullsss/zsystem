export function buildAttackCostContext({
    attackAp = 0,
    aimSteps = 0,
    aimCostPerStep = 0,
    aimBonusPerStep = 0,
    currentAp = 0,
    hasArmInjury = false,
    panicState = null
}) {
    const armInjuryAP = hasArmInjury ? 1 : 0;
    const panicAP = panicState === "panic-panicked" ? 2 : panicState === "panic-anxious" ? 1 : 0;
    const baseApCost = Number(attackAp || 0) + armInjuryAP + panicAP;
    const extraApCost = aimSteps * aimCostPerStep;
    const totalApCost = baseApCost + extraApCost;

    return {
        ok: currentAp >= totalApCost,
        curAP: currentAp,
        baseApCost,
        extraApCost,
        totalApCost,
        aimBonusTotal: aimSteps * aimBonusPerStep
    };
}

export function getAmmoConsumptionPlan(item, attack) {
    const isThrowingAction = attack.mode === "throw" || item.system.isThrowing === true;
    const spentBullets = parseInt(attack.bullets) || (item.system.ammoType ? 1 : 0);
    const currentMagazine = parseInt(item.system.mag?.value) || 0;
    const usesMagazine = !isThrowingAction && Boolean(item.system.ammoType);

    if (!usesMagazine) {
        return {
            ok: true,
            isThrowingAction,
            spentBullets,
            usesMagazine,
            nextMagazineValue: currentMagazine
        };
    }

    if (currentMagazine < spentBullets) {
        return {
            ok: false,
            isThrowingAction,
            spentBullets,
            usesMagazine,
            nextMagazineValue: currentMagazine
        };
    }

    return {
        ok: true,
        isThrowingAction,
        spentBullets,
        usesMagazine,
        nextMagazineValue: Math.max(0, currentMagazine - spentBullets)
    };
}

export function rollTriggeredEffects(attack, randomPercent = Math.random) {
    const triggeredEffects = [];
    let rawEffects = attack.effects || [];
    let effectsList = [];

    if (Array.isArray(rawEffects)) {
        effectsList = rawEffects;
    } else if (typeof rawEffects === "object") {
        effectsList = Object.values(rawEffects);
    }

    if (attack.effect && !effectsList.length) {
        effectsList.push({ id: attack.effect, chance: attack.chance || 100 });
    }

    for (const eff of effectsList) {
        if (!eff?.id) continue;
        const chance = eff.chance === undefined ? 100 : Number(eff.chance);
        const rollEffect = randomPercent() * 100;
        if (rollEffect <= chance) triggeredEffects.push(eff.id);
    }

    return triggeredEffects;
}
