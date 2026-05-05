import { calcChanceBreakdown, calcCombatRollResult } from "../src/module/chance.js";
import { buildDamageFormula, applyDamageModifiers, finalizeDamageAmount, getCritMultiplier } from "../src/module/attack-damage.js";
import { projectCritFailPressure, formatCritFailProjection } from "../src/module/combat-fumble.js";
import { Z_DIFFICULTY } from "../src/module/difficulty-tables.js";
import { resolveTraumaOutcome, TRAUMA_SEVERITY } from "../src/module/trauma.js";

globalThis.game = {
    settings: {
        get(namespace, key) {
            if (namespace !== "zsystem") return undefined;
            if (key === "aimBonus") return 10;
            return undefined;
        }
    }
};

globalThis.canvas = {
    grid: {
        measureDistance(sourceToken, targetToken) {
            return targetToken._distance ?? 0;
        }
    }
};

function makeActor({
    skill = 50,
    strength = 3,
    evasion = 0,
    statuses = [],
    prone = false
} = {}) {
    return {
        system: {
            attributes: {
                str: { value: strength }
            },
            skills: {
                ranged: { value: skill },
                melee: { value: skill },
                athletics: { value: skill }
            },
            secondary: {
                evasion: { value: evasion }
            }
        },
        statuses: new Set(statuses),
        hasStatusEffect(status) {
            if (status === "prone") return prone;
            return this.statuses.has(status);
        }
    };
}

function makeItem({
    weaponType = "ranged",
    range = 10,
    damage = "20",
    hands = "1h",
    damageType = "blunt",
    isThrowing = false,
    critMult = 1.5
} = {}) {
    return {
        system: {
            weaponType,
            range,
            hands,
            damageType,
            isThrowing,
            critMult
        },
        damage
    };
}

function makeAttack({
    mod = 0,
    mode = "single",
    dmg = "20"
} = {}) {
    return { mod, mode, dmg };
}

function makeToken({ distance = 0, actor = null } = {}) {
    return {
        actor,
        _distance: distance
    };
}

function buildCoverFn(penalty = 0) {
    return () => ({ penalty });
}

function buildRangeFn(mode = "near") {
    return (item) => {
        if (item.system.weaponType === "melee") return { penalty: 0, label: "" };
        if (mode === "near") return { penalty: Z_DIFFICULTY.range.near, label: "" };
        if (mode === "medium") return { penalty: Z_DIFFICULTY.range.medium, label: "Далеко" };
        return { penalty: Z_DIFFICULTY.range.far, label: "Слишк. далеко" };
    };
}

function buildInterferenceFn(count = 0) {
    return () => Array.from({ length: count }, (_, index) => ({ id: index }));
}

function averageDamageFromFormula(formula) {
    const normalized = String(formula).trim().toLowerCase();
    const diceMatch = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (diceMatch) {
        const diceCount = Number(diceMatch[1]);
        const diceSize = Number(diceMatch[2]);
        const modifier = Number(diceMatch[3] || 0);
        return diceCount * ((diceSize + 1) / 2) + modifier;
    }
    const plainNumber = Number(normalized);
    if (!Number.isNaN(plainNumber)) return plainNumber;
    return 0;
}

function evaluateAttackDamage({ actor, item, attack, resultType, isStealth = false }) {
    const critMultiplier = getCritMultiplier(item);
    const damageFormula = buildDamageFormula(attack.dmg || item.damage || "0", resultType, { critMultiplier });
    const critMatch = damageFormula.match(/^ceil\(\((.+)\) \* ([\d.]+)\)$/i);
    const baseDamage = critMatch
        ? averageDamageFromFormula(critMatch[1]) * Number(critMatch[2])
        : averageDamageFromFormula(damageFormula);

    const damageMath = applyDamageModifiers({
        rolledDamage: baseDamage,
        weaponType: item.system.weaponType,
        hands: item.system.hands,
        strength: actor.system.attributes.str.value || 0,
        isStealth
    });

    return finalizeDamageAmount(damageMath.finalDamage);
}

function getLocationMaxHp(location, targetHp) {
    if (location === "head") return Math.max(8, Math.round(targetHp * 0.18));
    if (location === "torso") return Math.max(20, Math.round(targetHp * 0.50));
    return Math.max(10, Math.round(targetHp * 0.25));
}

function createTraumaStats() {
    return {
        [TRAUMA_SEVERITY.light]: 0,
        [TRAUMA_SEVERITY.serious]: 0,
        [TRAUMA_SEVERITY.critical]: 0,
        bleeding: 0,
        injury: 0,
        dizzy: 0,
        prone: 0
    };
}

function collectTraumaStats(stats, trauma) {
    if (!trauma?.enabled) return;
    stats[trauma.severity] += 1;
    for (const effect of trauma.effects) {
        stats[effect.key] = (stats[effect.key] || 0) + 1;
    }
}

function rateMetric(value, target) {
    if (!target) return "n/a";
    if (target.min !== undefined && value < target.min) return "LOW";
    if (target.max !== undefined && value > target.max) return "HIGH";
    return "OK";
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function formatMetric(value, type = "percent") {
    if (type === "percent") return formatPercent(value);
    return value.toFixed(2);
}

function runScenario({
    name,
    iterations = 10000,
    attacker,
    target,
    item,
    attack,
    targetHp = 60,
    distance = 5,
    location = "torso",
    aimSteps = 0,
    coverPenalty = 0,
    interferenceCount = 0,
    rangeMode = "near",
    expectations = {}
}) {
    const sourceToken = makeToken({ actor: attacker });
    const targetToken = makeToken({ actor: target, distance });

    const chanceBreakdown = calcChanceBreakdown({
        actor: attacker,
        item,
        attack,
        sourceToken,
        targetToken,
        aimSteps,
        location,
        calculateCover: buildCoverFn(coverPenalty),
        calculateRangePenalty: buildRangeFn(rangeMode),
        checkInterveningTokens: buildInterferenceFn(interferenceCount)
    });
    let hits = 0;
    let crits = 0;
    let fumbles = 0;
    let totalDamage = 0;
    let totalRoundsToDown = 0;
    let totalAttacks = 0;
    let totalCritsPerFight = 0;
    let totalFumblesPerFight = 0;
    let fightsWithFumble = 0;
    const traumaStats = createTraumaStats();

    for (let i = 0; i < iterations; i++) {
        let remainingHp = targetHp;
        let rounds = 0;
        let fightCrits = 0;
        let fightFumbles = 0;

        while (remainingHp > 0 && rounds < 100) {
            rounds += 1;
            totalAttacks += 1;
            const roll = Math.floor(Math.random() * 100) + 1;
            const resultType = calcCombatRollResult(roll, {
                skill: chanceBreakdown.details.skillVal,
                difficulty: chanceBreakdown.difficulty.total
            });

            if (resultType === "crit-success") {
                crits += 1;
                fightCrits += 1;
            }
            if (resultType === "crit-fail") {
                fumbles += 1;
                fightFumbles += 1;
            }

            if (resultType.includes("success")) {
                hits += 1;
                const damage = evaluateAttackDamage({
                    actor: attacker,
                    item,
                    attack,
                    resultType,
                    isStealth: attacker.statuses.has("stealth")
                });
                totalDamage += damage;
                collectTraumaStats(traumaStats, resolveTraumaOutcome({
                    damage,
                    maxHp: targetHp,
                    limbMax: getLocationMaxHp(location, targetHp),
                    location,
                    damageType: item.system.damageType || "blunt",
                    resultType,
                    severityMultiplier: 1
                }));
                remainingHp -= damage;
            }
        }

        totalRoundsToDown += rounds;
        totalCritsPerFight += fightCrits;
        totalFumblesPerFight += fightFumbles;
        if (fightFumbles > 0) fightsWithFumble += 1;
    }

    const fumbleProjection = projectCritFailPressure({
        fumbles,
        totalAttacks,
        item,
        attack
    });

    const result = {
        name,
        totalAttacks,
        shownChance: chanceBreakdown.chance,
        hitRate: hits / totalAttacks,
        critRate: crits / totalAttacks,
        fumbleRate: fumbles / totalAttacks,
        avgDamagePerAttack: totalDamage / totalAttacks,
        avgRoundsToDown: totalRoundsToDown / iterations,
        outcomePressure: {
            avgCritsPerFight: totalCritsPerFight / iterations,
            avgFumblesPerFight: totalFumblesPerFight / iterations,
            fightsWithFumbleRate: fightsWithFumble / iterations,
            critFailProjection: fumbleProjection,
            trauma: traumaStats
        },
        newModel: {
            difficulty: chanceBreakdown.difficulty.total,
            ordinaryFailChance: chanceBreakdown.check.ordinaryFailChance,
            successChance: chanceBreakdown.check.successChance,
            fumbleChance: chanceBreakdown.check.fumbleChance,
            margin: chanceBreakdown.check.margin,
            critSuccessChance: chanceBreakdown.check.critSuccessChance
        },
        expectations
    };

    return result;
}

function printScenario(result) {
    console.log(`\nScenario: ${result.name}`);
    console.log(`Shown chance: ${result.shownChance}%`);
    console.log(`Combat check: skill ${result.newModel.difficulty + result.newModel.margin} vs DC ${result.newModel.difficulty} -> hit ${result.newModel.successChance}% (crit ${result.newModel.critSuccessChance}%), fail ${result.newModel.ordinaryFailChance}%, fumble ${result.newModel.fumbleChance}%`);
    console.log(`Hit rate: ${formatMetric(result.hitRate)} [${rateMetric(result.hitRate, result.expectations.hitRate)}]`);
    console.log(`Crit rate: ${formatMetric(result.critRate)}`);
    console.log(`Fumble rate: ${formatMetric(result.fumbleRate)}`);
    console.log(`Outcome pressure: crits/fight ${formatMetric(result.outcomePressure.avgCritsPerFight, "number")}, fumbles/fight ${formatMetric(result.outcomePressure.avgFumblesPerFight, "number")}, fights with fumble ${formatMetric(result.outcomePressure.fightsWithFumbleRate)}`);
    console.log(`Projected crit-fail profile: ${result.outcomePressure.critFailProjection.profileLabel} -> ${formatCritFailProjection(result.outcomePressure.critFailProjection)}`);
    console.log(`Trauma / 100 attacks: light ${formatMetric(result.outcomePressure.trauma.light / result.totalAttacks * 100, "number")}, serious ${formatMetric(result.outcomePressure.trauma.serious / result.totalAttacks * 100, "number")}, critical ${formatMetric(result.outcomePressure.trauma.critical / result.totalAttacks * 100, "number")}`);
    console.log(`Trauma effects / 100 attacks: bleeding ${formatMetric(result.outcomePressure.trauma.bleeding / result.totalAttacks * 100, "number")}, injury ${formatMetric(result.outcomePressure.trauma.injury / result.totalAttacks * 100, "number")}, dizzy ${formatMetric(result.outcomePressure.trauma.dizzy / result.totalAttacks * 100, "number")}, prone ${formatMetric(result.outcomePressure.trauma.prone / result.totalAttacks * 100, "number")}`);
    console.log(`Avg damage / attack: ${formatMetric(result.avgDamagePerAttack, "number")}${result.expectations.avgDamagePerAttack ? ` [${rateMetric(result.avgDamagePerAttack, result.expectations.avgDamagePerAttack)}]` : ""}`);
    console.log(`Avg rounds to down: ${formatMetric(result.avgRoundsToDown, "number")}${result.expectations.avgRoundsToDown ? ` [${rateMetric(result.avgRoundsToDown, result.expectations.avgRoundsToDown)}]` : ""}`);
}

const iterationsArg = Number(process.argv[2]);
const iterations = Number.isFinite(iterationsArg) && iterationsArg > 0 ? iterationsArg : 10000;

const scenarios = [
    {
        name: "обычный бой / skill 70 / torso / medium range / light cover",
        attacker: makeActor({ skill: 70, strength: 4 }),
        target: makeActor({ evasion: 10 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 12,
        location: "torso",
        coverPenalty: Z_DIFFICULTY.cover.light,
        rangeMode: "medium",
        expectations: {
            hitRate: { min: 0.55, max: 0.75 },
            avgRoundsToDown: { min: 3, max: 8 }
        }
    },
    {
        name: "headshot без прицела / skill 70 / medium range / light cover",
        attacker: makeActor({ skill: 70, strength: 4 }),
        target: makeActor({ evasion: 10 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 12,
        location: "head",
        coverPenalty: Z_DIFFICULTY.cover.light,
        rangeMode: "medium",
        expectations: {
            hitRate: { min: 0.15, max: 0.35 }
        }
    },
    {
        name: "headshot с 2 aim steps / skill 70 / medium range / light cover",
        attacker: makeActor({ skill: 70, strength: 4 }),
        target: makeActor({ evasion: 10 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 12,
        location: "head",
        aimSteps: 2,
        coverPenalty: Z_DIFFICULTY.cover.light,
        rangeMode: "medium",
        expectations: {
            hitRate: { min: 0.35, max: 0.65 }
        }
    },
    {
        name: "помеха союзниками / skill 70 / torso / medium / 2 intervening tokens",
        attacker: makeActor({ skill: 70, strength: 4 }),
        target: makeActor({ evasion: 10 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 12,
        location: "torso",
        interferenceCount: 2,
        rangeMode: "medium",
        expectations: {
            hitRate: { min: 0.30, max: 0.55 }
        }
    },
    {
        name: "головокружение и слепота / skill 100 / torso / near / no cover",
        attacker: makeActor({ skill: 100, strength: 4, statuses: ["dizzy", "blind"] }),
        target: makeActor({ evasion: 10 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 6,
        location: "torso",
        rangeMode: "near",
        expectations: {
            hitRate: { min: 0.20, max: 0.55 }
        }
    },
    {
        name: "прокачанный стрелок / skill 140 / torso / near / no cover",
        attacker: makeActor({ skill: 140, strength: 4 }),
        target: makeActor({ evasion: 6 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 6,
        location: "torso",
        coverPenalty: Z_DIFFICULTY.cover.none,
        rangeMode: "near",
        expectations: {
            hitRate: { min: 0.90, max: 0.99 },
            avgRoundsToDown: { min: 2, max: 5 }
        }
    },
    {
        name: "новичок / skill 40 / torso / near / no cover",
        attacker: makeActor({ skill: 40, strength: 3 }),
        target: makeActor({ evasion: 5 }),
        item: makeItem({ weaponType: "ranged", range: 10, damage: "20" }),
        attack: makeAttack({ dmg: "20" }),
        targetHp: 60,
        distance: 5,
        location: "torso",
        coverPenalty: Z_DIFFICULTY.cover.none,
        rangeMode: "near",
        expectations: {
            hitRate: { min: 0.55, max: 0.80 }
        }
    },
    {
        name: "мясной мили / skill 80 / stealth / 2h melee",
        attacker: makeActor({ skill: 80, strength: 6, statuses: ["stealth"] }),
        target: makeActor({ evasion: 0 }),
        item: makeItem({ weaponType: "melee", range: 1.5, damage: "12", hands: "2h" }),
        attack: makeAttack({ dmg: "12" }),
        targetHp: 60,
        distance: 1,
        location: "torso",
        expectations: {
            avgRoundsToDown: { min: 1, max: 4 }
        }
    }
];

console.log("ZSystem Balance Simulation");
console.log("==========================");
console.log(`Iterations per scenario: ${iterations}`);

for (const scenario of scenarios) {
    printScenario(runScenario({ ...scenario, iterations }));
}
