import { calcChanceBreakdown, calcRollResult } from "../src/module/chance.js";
import { buildDamageFormula, applyDamageModifiers, finalizeDamageAmount } from "../src/module/attack-damage.js";
import { Z_DIFFICULTY } from "../src/module/difficulty-tables.js";

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
    isThrowing = false
} = {}) {
    return {
        system: {
            weaponType,
            range,
            hands,
            damageType,
            isThrowing
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
    const damageFormula = buildDamageFormula(attack.dmg || item.damage || "0", resultType);
    const critMatch = damageFormula.match(/^ceil\(\((.+)\) \* 1\.5\)$/i);
    const baseDamage = critMatch
        ? averageDamageFromFormula(critMatch[1]) * 1.5
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

    for (let i = 0; i < iterations; i++) {
        let remainingHp = targetHp;
        let rounds = 0;

        while (remainingHp > 0 && rounds < 100) {
            rounds += 1;
            const roll = Math.floor(Math.random() * 100) + 1;
            const resultType = calcRollResult(roll, chanceBreakdown.chance);

            if (resultType === "crit-success") crits += 1;
            if (resultType === "crit-fail") fumbles += 1;

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
                remainingHp -= damage;
            }
        }

        totalRoundsToDown += rounds;
    }

    const totalAttacks = totalRoundsToDown > 0 ? totalRoundsToDown : iterations;
    const result = {
        name,
        shownChance: chanceBreakdown.chance,
        hitRate: hits / totalAttacks,
        critRate: crits / totalAttacks,
        fumbleRate: fumbles / totalAttacks,
        avgDamagePerAttack: totalDamage / totalAttacks,
        avgRoundsToDown: totalRoundsToDown / iterations,
        expectations
    };

    return result;
}

function printScenario(result) {
    console.log(`\nScenario: ${result.name}`);
    console.log(`Shown chance: ${result.shownChance}%`);
    console.log(`Hit rate: ${formatMetric(result.hitRate)} [${rateMetric(result.hitRate, result.expectations.hitRate)}]`);
    console.log(`Crit rate: ${formatMetric(result.critRate)}`);
    console.log(`Fumble rate: ${formatMetric(result.fumbleRate)}`);
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
            hitRate: { min: 0.20, max: 0.45 }
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
            hitRate: { min: 0.75, max: 0.95 },
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
            hitRate: { min: 0.30, max: 0.60 }
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
