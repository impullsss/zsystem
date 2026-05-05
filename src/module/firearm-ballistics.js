import { applyAmmoProfileToFirearmProfile } from "./ammo-effects.js";

export const FIREARM_BALLISTICS_DEFAULTS = {
    lineWidth: 0.75,
    burstConeAngle: 18,
    bodyResistance: 18,
    minExitEnergy: 8,
    armorPiercing: 0,
    ballisticPower: 20,
    strayBaseChance: 0.5,
    strayGraceMargin: 25,
    burstPrimaryHitChance: 0.72,
    burstCritPrimaryHitChance: 0.9,
    burstFailPrimaryHitChance: 0.08,
    burstConeHitChance: 0.55,
    burstCritConeHitChance: 0.72,
    burstFailConeHitChance: 0.18,
    burstCritFailConeHitChance: 0.08
};

export function averageDamageFormula(formula) {
    const text = String(formula ?? "0").trim().toLowerCase();
    const diceMatch = text.match(/^(\d+)d(\d+)([+-]\d+)?$/);

    if (diceMatch) {
        const diceCount = Number(diceMatch[1]);
        const diceSize = Number(diceMatch[2]);
        const modifier = Number(diceMatch[3] || 0);
        return diceCount * ((diceSize + 1) / 2) + modifier;
    }

    const plain = Number(text);
    return Number.isFinite(plain) ? plain : 0;
}

export function getFirearmProfile(item = null, attack = null, ammo = null) {
    const baseDamage = averageDamageFormula(attack?.dmg ?? item?.system?.damage ?? item?.damage ?? 0);
    const attackBullets = parseBallisticNumber(attack?.bullets);
    const weaponPower = parseBallisticNumber(item?.system?.ballisticPower);
    const attackPower = parseBallisticNumber(attack?.ballisticPower);
    const weaponAp = parseBallisticNumber(item?.system?.armorPiercing ?? item?.system?.ap);
    const attackAp = parseBallisticNumber(attack?.armorPiercing ?? attack?.ap);

    const profile = {
        weaponType: item?.system?.weaponType || "ranged",
        requestedShots: Number.isFinite(attackBullets) && attackBullets > 0 ? Math.floor(attackBullets) : 1,
        baseDamage: Math.max(0, baseDamage),
        ballisticPower: firstFinitePositive(attackPower, weaponPower, baseDamage, FIREARM_BALLISTICS_DEFAULTS.ballisticPower),
        armorPiercing: firstFinite(attackAp, weaponAp, FIREARM_BALLISTICS_DEFAULTS.armorPiercing),
        burstConeAngle: firstFinitePositive(parseBallisticNumber(attack?.coneAngle), parseBallisticNumber(item?.system?.burstConeAngle), FIREARM_BALLISTICS_DEFAULTS.burstConeAngle),
        lineWidth: firstFinitePositive(parseBallisticNumber(attack?.lineWidth), parseBallisticNumber(item?.system?.lineWidth), FIREARM_BALLISTICS_DEFAULTS.lineWidth)
    };

    return ammo ? applyAmmoProfileToFirearmProfile(profile, ammo) : profile;
}

export function resolveJammedBurst({
    requestedShots = 1,
    resultType = "success",
    random = Math.random
} = {}) {
    const shots = Math.max(1, Math.floor(Number(requestedShots) || 1));

    if (resultType !== "crit-fail" || shots <= 1) {
        return {
            requestedShots: shots,
            firedShots: shots,
            jammed: resultType === "crit-fail",
            interrupted: false
        };
    }

    const firedShots = Math.max(1, Math.min(shots, Math.ceil(random() * shots)));

    return {
        requestedShots: shots,
        firedShots,
        jammed: true,
        interrupted: firedShots < shots
    };
}

export function measureFireLineRisk({ source, target, candidate, lineWidth = FIREARM_BALLISTICS_DEFAULTS.lineWidth } = {}) {
    if (!source || !target || !candidate) return null;

    const line = vector(source, target);
    const toCandidate = vector(source, candidate);
    const lineLength = length(line);

    if (lineLength <= 0) return null;

    const projection = dot(toCandidate, line) / (lineLength * lineLength);
    const closest = {
        x: source.x + line.x * projection,
        y: source.y + line.y * projection
    };
    const distanceFromLine = distance(candidate, closest);
    const radius = Number(candidate.radius) || 0.5;
    const laneWidth = Number(lineWidth) || FIREARM_BALLISTICS_DEFAULTS.lineWidth;
    const onLine = projection > 0 && projection < 1 && distanceFromLine <= laneWidth + radius;
    const behindTarget = projection >= 1 && distanceFromLine <= laneWidth + radius;
    const distanceScore = Math.max(0, 1 - (distanceFromLine / Math.max(0.1, laneWidth + radius)));

    return {
        id: candidate.id,
        token: candidate,
        projection,
        distanceFromLine,
        distanceScore,
        onLine,
        behindTarget,
        risk: (onLine || behindTarget) ? Number(distanceScore.toFixed(3)) : 0
    };
}

export function findFireLineCandidates({
    source,
    target,
    candidates = [],
    lineWidth = FIREARM_BALLISTICS_DEFAULTS.lineWidth,
    includeBehindTarget = true
} = {}) {
    return candidates
        .map((candidate) => measureFireLineRisk({ source, target, candidate, lineWidth }))
        .filter((risk) => risk && (risk.onLine || (includeBehindTarget && risk.behindTarget)))
        .sort((a, b) => a.projection - b.projection);
}

export function findBurstConeCandidates({
    source,
    target,
    candidates = [],
    coneAngle = FIREARM_BALLISTICS_DEFAULTS.burstConeAngle,
    maxDistance = Infinity
} = {}) {
    if (!source || !target) return [];

    const aim = vector(source, target);
    const aimLength = length(aim);
    if (aimLength <= 0) return [];

    return candidates
        .map((candidate) => {
            const toCandidate = vector(source, candidate);
            const candidateDistance = length(toCandidate);
            if (candidateDistance <= 0 || candidateDistance > maxDistance) return null;

            const angle = angleBetween(aim, toCandidate);
            const radius = Number(candidate.radius) || 0.5;
            const radiusAngle = radiansToDegrees(Math.atan(radius / candidateDistance));
            const inside = angle <= (coneAngle / 2) + radiusAngle;
            const angleScore = Math.max(0, 1 - (angle / Math.max(1, coneAngle / 2 + radiusAngle)));
            const distanceScore = Math.max(0.1, 1 - (candidateDistance / Math.max(candidateDistance, maxDistance || candidateDistance)));

            return {
                id: candidate.id,
                token: candidate,
                angle,
                distance: candidateDistance,
                inside,
                risk: inside ? Number((angleScore * distanceScore).toFixed(3)) : 0
            };
        })
        .filter((risk) => risk?.inside)
        .sort((a, b) => b.risk - a.risk);
}

export function resolveProjectileImpact({
    target,
    incomingPower = FIREARM_BALLISTICS_DEFAULTS.ballisticPower,
    armorPiercing = FIREARM_BALLISTICS_DEFAULTS.armorPiercing,
    baseDamage = FIREARM_BALLISTICS_DEFAULTS.ballisticPower,
    bodyResistance = FIREARM_BALLISTICS_DEFAULTS.bodyResistance,
    minExitEnergy = FIREARM_BALLISTICS_DEFAULTS.minExitEnergy
} = {}) {
    const armor = Math.max(0, Number(target?.armor ?? target?.ac ?? 0) || 0);
    const piercing = Math.max(0, Number(armorPiercing) || 0);
    const effectiveArmor = Math.max(0, armor - piercing);
    const entryPower = Math.max(0, Number(incomingPower) || 0);
    const stopCost = effectiveArmor + Math.max(0, Number(bodyResistance) || 0);
    const exitPower = Math.max(0, entryPower - stopCost);
    const penetrates = exitPower >= Math.max(0, Number(minExitEnergy) || 0);
    const damageRatio = Math.max(0.15, Math.min(1, (entryPower - effectiveArmor) / Math.max(1, entryPower)));
    const damage = Math.max(1, Math.round((Number(baseDamage) || 0) * damageRatio));

    return {
        targetId: target?.id,
        target,
        armor,
        armorPiercing: piercing,
        effectiveArmor,
        entryPower,
        exitPower,
        penetrates,
        damage
    };
}

export function resolveSingleShotBallistics({
    source,
    target,
    bystanders = [],
    item = null,
    attack = null,
    ammo = null,
    resultType = "success",
    missMargin = 0,
    random = Math.random
} = {}) {
    const profile = getFirearmProfile(item, attack, ammo);
    const lineCandidates = findFireLineCandidates({
        source,
        target,
        candidates: bystanders,
        lineWidth: profile.lineWidth
    });
    const impacts = [];

    if (resultType.includes("success")) {
        let power = profile.ballisticPower;
        const primaryImpact = resolveProjectileImpact({
            target,
            incomingPower: power,
            armorPiercing: profile.armorPiercing,
            baseDamage: profile.baseDamage
        });
        impacts.push({ kind: "primary", ...primaryImpact });
        power = primaryImpact.exitPower;

        if (primaryImpact.penetrates) {
            for (const risk of lineCandidates.filter((candidate) => candidate.behindTarget)) {
                const impact = resolveProjectileImpact({
                    target: risk.token,
                    incomingPower: power,
                    armorPiercing: profile.armorPiercing,
                    baseDamage: profile.baseDamage * 0.65
                });
                impacts.push({ kind: "overpenetration", risk: risk.risk, ...impact });
                power = impact.exitPower;
                if (!impact.penetrates) break;
            }
        }
    } else if (resultType === "fail") {
        const candidate = pickStrayCandidate({
            candidates: lineCandidates.filter((risk) => risk.onLine),
            missMargin,
            random
        });
        if (candidate) {
            const impact = resolveProjectileImpact({
                target: candidate.token,
                incomingPower: profile.ballisticPower * 0.85,
                armorPiercing: profile.armorPiercing,
                baseDamage: profile.baseDamage * 0.75
            });
            impacts.push({ kind: "stray", risk: candidate.risk, ...impact });
        }
    }

    return {
        profile,
        lineCandidates,
        impacts
    };
}

export function resolveBurstBallistics({
    source,
    target,
    bystanders = [],
    item = null,
    attack = null,
    ammo = null,
    resultType = "success",
    burstOverride = null,
    random = Math.random
} = {}) {
    const profile = getFirearmProfile(item, attack, ammo);
    const burst = burstOverride || resolveJammedBurst({
        requestedShots: profile.requestedShots,
        resultType,
        random
    });
    const lineCandidates = findFireLineCandidates({
        source,
        target,
        candidates: bystanders,
        lineWidth: profile.lineWidth
    });
    const coneCandidates = findBurstConeCandidates({
        source,
        target,
        candidates: [target, ...bystanders],
        coneAngle: profile.burstConeAngle,
        maxDistance: distance(source, target) + 3
    });
    const impacts = [];

    for (let shot = 1; shot <= burst.firedShots; shot++) {
        const selected = pickBurstTarget({
            target,
            lineCandidates,
            coneCandidates,
            resultType,
            shot,
            random
        });
        if (!selected) continue;

        const impact = resolveProjectileImpact({
            target: selected.token,
            incomingPower: profile.ballisticPower,
            armorPiercing: profile.armorPiercing,
            baseDamage: profile.baseDamage
        });

        impacts.push({
            shot,
            kind: selected.kind,
            risk: selected.risk,
            ...impact
        });
    }

    return {
        profile,
        burst,
        lineCandidates,
        coneCandidates,
        impacts
    };
}

function pickStrayCandidate({
    candidates = [],
    missMargin = 0,
    random = Math.random
} = {}) {
    if (!candidates.length) return null;
    const best = candidates[0];
    const grace = Math.max(0, FIREARM_BALLISTICS_DEFAULTS.strayGraceMargin - Math.max(0, Number(missMargin) || 0));
    const chance = FIREARM_BALLISTICS_DEFAULTS.strayBaseChance * best.risk * (grace / FIREARM_BALLISTICS_DEFAULTS.strayGraceMargin);
    return random() <= chance ? best : null;
}

function pickBurstTarget({
    target,
    lineCandidates = [],
    coneCandidates = [],
    resultType = "success",
    shot = 1,
    random = Math.random
} = {}) {
    const primaryChance = getBurstPrimaryChance({ resultType, shot });
    if (target && random() <= primaryChance) {
        return { token: target, risk: 1, kind: "primary" };
    }

    if (resultType === "fail" || resultType === "crit-fail") {
        const stray = pickStrayCandidate({
            candidates: lineCandidates.filter((candidate) => candidate.onLine),
            missMargin: resultType === "crit-fail" ? 0 : 8,
            random
        });
        if (stray) return { token: stray.token, risk: stray.risk, kind: "stray" };
    }

    const validCone = coneCandidates
        .filter((candidate) => candidate.risk > 0)
        .filter((candidate) => candidate.token.id !== target?.id);
    if (!validCone.length) return null;

    if (random() > getBurstConeChance({ resultType, shot })) return null;

    const selected = pickWeightedCandidate(validCone, random);
    return selected ? { token: selected.token, risk: selected.risk, kind: "burst-cone" } : null;
}

function getBurstPrimaryChance({ resultType, shot }) {
    if (resultType === "crit-success") return Math.max(0.35, FIREARM_BALLISTICS_DEFAULTS.burstCritPrimaryHitChance - (shot - 1) * 0.08);
    if (resultType === "success") return Math.max(0.2, FIREARM_BALLISTICS_DEFAULTS.burstPrimaryHitChance - (shot - 1) * 0.11);
    if (resultType === "fail") return Math.max(0.02, FIREARM_BALLISTICS_DEFAULTS.burstFailPrimaryHitChance - (shot - 1) * 0.02);
    return 0;
}

function getBurstConeChance({ resultType, shot }) {
    const fatigue = Math.max(0, (shot - 1) * 0.04);
    if (resultType === "crit-success") return Math.max(0.35, FIREARM_BALLISTICS_DEFAULTS.burstCritConeHitChance - fatigue);
    if (resultType === "success") return Math.max(0.2, FIREARM_BALLISTICS_DEFAULTS.burstConeHitChance - fatigue);
    if (resultType === "fail") return Math.max(0.05, FIREARM_BALLISTICS_DEFAULTS.burstFailConeHitChance - fatigue);
    if (resultType === "crit-fail") return FIREARM_BALLISTICS_DEFAULTS.burstCritFailConeHitChance;
    return 0;
}

function pickWeightedCandidate(candidates, random = Math.random) {
    const weighted = candidates.map((candidate) => ({
        ...candidate,
        weight: Math.max(0.01, candidate.risk)
    }));
    const totalWeight = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);
    let cursor = random() * totalWeight;

    for (const candidate of weighted) {
        cursor -= candidate.weight;
        if (cursor <= 0) return candidate;
    }

    return weighted[weighted.length - 1] || null;
}

function firstFinite(...values) {
    for (const value of values) {
        if (Number.isFinite(value)) return value;
    }
    return 0;
}

function firstFinitePositive(...values) {
    for (const value of values) {
        if (Number.isFinite(value) && value > 0) return value;
    }
    return 0;
}

export function parseBallisticNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const normalized = String(value ?? "").trim().replace(",", ".");
    if (!normalized) return NaN;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
}

function vector(a, b) {
    return {
        x: (Number(b?.x) || 0) - (Number(a?.x) || 0),
        y: (Number(b?.y) || 0) - (Number(a?.y) || 0)
    };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

function length(v) {
    return Math.hypot(v.x, v.y);
}

function distance(a, b) {
    return Math.hypot((Number(b?.x) || 0) - (Number(a?.x) || 0), (Number(b?.y) || 0) - (Number(a?.y) || 0));
}

function angleBetween(a, b) {
    const denominator = length(a) * length(b);
    if (denominator <= 0) return 180;
    const cosine = Math.max(-1, Math.min(1, dot(a, b) / denominator));
    return radiansToDegrees(Math.acos(cosine));
}

function radiansToDegrees(value) {
    return value * (180 / Math.PI);
}
