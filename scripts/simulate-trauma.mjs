import { resolveTraumaOutcome, TRAUMA_SEVERITY } from "../src/module/trauma.js";

const iterationsArg = Number(process.argv[2]);
const severityArg = Number(process.argv[3]);
const iterations = Number.isFinite(iterationsArg) && iterationsArg > 0 ? iterationsArg : 10000;
const severityMultiplier = Number.isFinite(severityArg) && severityArg > 0 ? severityArg : 1;

const scenarios = [
    {
        name: "pistol torso / 20 dmg / 60 hp",
        damage: () => 20,
        maxHp: 60,
        limbMax: 30,
        location: "torso",
        damageType: "ballistic"
    },
    {
        name: "pistol head / 20 dmg / 60 hp",
        damage: () => 20,
        maxHp: 60,
        limbMax: 10,
        location: "head",
        damageType: "ballistic"
    },
    {
        name: "crit pistol torso / 30 dmg / 60 hp",
        damage: () => 30,
        maxHp: 60,
        limbMax: 30,
        location: "torso",
        damageType: "ballistic",
        resultType: "crit-success"
    },
    {
        name: "knife arm / 8-14 dmg / 60 hp",
        damage: () => randomInt(8, 14),
        maxHp: 60,
        limbMax: 15,
        location: "rArm",
        damageType: "slashing"
    },
    {
        name: "club torso / 10-18 dmg / 80 hp",
        damage: () => randomInt(10, 18),
        maxHp: 80,
        limbMax: 36,
        location: "torso",
        damageType: "blunt"
    },
    {
        name: "heavy melee leg / 28-42 dmg / 80 hp",
        damage: () => randomInt(28, 42),
        maxHp: 80,
        limbMax: 20,
        location: "rLeg",
        damageType: "blunt"
    }
];

console.log("ZSystem Trauma Simulation");
console.log("=========================");
console.log(`Iterations per scenario: ${iterations}`);
console.log(`Severity multiplier: ${severityMultiplier}`);

for (const scenario of scenarios) {
    printScenario(runScenario(scenario));
}

function runScenario(scenario) {
    const stats = createStats();
    let totalPressure = 0;
    let totalDamage = 0;

    for (let i = 0; i < iterations; i++) {
        const damage = scenario.damage();
        const trauma = resolveTraumaOutcome({
            damage,
            maxHp: scenario.maxHp,
            limbMax: scenario.limbMax,
            location: scenario.location,
            damageType: scenario.damageType,
            resultType: scenario.resultType || "success",
            severityMultiplier
        });

        totalDamage += damage;
        totalPressure += trauma.pressure || 0;
        collect(stats, trauma);
    }

    return {
        ...scenario,
        stats,
        avgDamage: totalDamage / iterations,
        avgPressure: totalPressure / iterations
    };
}

function createStats() {
    return {
        [TRAUMA_SEVERITY.none]: 0,
        [TRAUMA_SEVERITY.light]: 0,
        [TRAUMA_SEVERITY.serious]: 0,
        [TRAUMA_SEVERITY.critical]: 0,
        bleeding: 0,
        injury: 0,
        dizzy: 0,
        prone: 0
    };
}

function collect(stats, trauma) {
    stats[trauma.severity] += 1;
    for (const effect of trauma.effects || []) {
        stats[effect.key] = (stats[effect.key] || 0) + 1;
    }
}

function printScenario(result) {
    console.log(`\nScenario: ${result.name}`);
    console.log(`Avg damage: ${result.avgDamage.toFixed(2)} | Avg pressure: ${(result.avgPressure * 100).toFixed(1)}%`);
    console.log(`Severity: none ${pct(result.stats.none)}, light ${pct(result.stats.light)}, serious ${pct(result.stats.serious)}, critical ${pct(result.stats.critical)}`);
    console.log(`Effects: bleeding ${pct(result.stats.bleeding)}, injury ${pct(result.stats.injury)}, dizzy ${pct(result.stats.dizzy)}, prone ${pct(result.stats.prone)}`);
}

function pct(value) {
    return `${((value / iterations) * 100).toFixed(1)}%`;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
