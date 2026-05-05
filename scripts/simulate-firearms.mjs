import {
    resolveBurstBallistics,
    resolveSingleShotBallistics
} from "../src/module/firearm-ballistics.js";
import { resolveCritFailEffects } from "../src/module/combat-fumble.js";

function makeRandom(seed = 1) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function runScenario({ name, iterations, mode, source, target, bystanders, item, attack, ammo, resultTypeMix }) {
    const random = makeRandom(20260504);
    const summary = {
        impacts: 0,
        primaryHits: 0,
        strayHits: 0,
        overpenetrations: 0,
        burstConeHits: 0,
        jammedBursts: 0,
        interruptedBursts: 0,
        firedShots: 0,
        fumbleEffects: {}
    };

    for (let i = 0; i < iterations; i++) {
        const roll = random();
        const resultType = pickResultType(resultTypeMix, roll);
        if (resultType === "crit-fail") {
            const fumble = resolveCritFailEffects({ item, attack, ammo, random });
            for (const effect of fumble.triggeredEffects) {
                summary.fumbleEffects[effect.key] = (summary.fumbleEffects[effect.key] || 0) + 1;
            }
        }
        const result = mode === "burst"
            ? resolveBurstBallistics({ source, target, bystanders, item, attack, ammo, resultType, random })
            : resolveSingleShotBallistics({ source, target, bystanders, item, attack, ammo, resultType, missMargin: 8, random });

        for (const impact of result.impacts) {
            summary.impacts += 1;
            if (impact.kind === "primary") summary.primaryHits += 1;
            if (impact.kind === "stray") summary.strayHits += 1;
            if (impact.kind === "overpenetration") summary.overpenetrations += 1;
            if (impact.kind === "burst-cone") summary.burstConeHits += 1;
        }

        if (result.burst) {
            summary.firedShots += result.burst.firedShots;
            if (result.burst.jammed) summary.jammedBursts += 1;
            if (result.burst.interrupted) summary.interruptedBursts += 1;
        }
    }

    return { name, iterations, summary };
}

function pickResultType(mix, roll) {
    let cursor = 0;
    for (const entry of mix) {
        cursor += entry.chance;
        if (roll <= cursor) return entry.resultType;
    }
    return mix[mix.length - 1].resultType;
}

function printScenario(result) {
    const { summary, iterations } = result;

    console.log(`\nScenario: ${result.name}`);
    console.log(`Total impacts: ${summary.impacts}`);
    console.log(`Primary hits / 100 attacks: ${per100(summary.primaryHits, iterations)}`);
    console.log(`Stray hits / 100 attacks: ${per100(summary.strayHits, iterations)}`);
    console.log(`Overpenetrations / 100 attacks: ${per100(summary.overpenetrations, iterations)}`);
    console.log(`Burst cone hits / 100 attacks: ${per100(summary.burstConeHits, iterations)}`);
    if (summary.firedShots > 0) {
        console.log(`Avg fired shots / burst: ${(summary.firedShots / iterations).toFixed(2)}`);
        console.log(`Jammed bursts / 100 bursts: ${per100(summary.jammedBursts, iterations)}`);
        console.log(`Interrupted bursts / 100 bursts: ${per100(summary.interruptedBursts, iterations)}`);
    }
    for (const [key, value] of Object.entries(summary.fumbleEffects)) {
        console.log(`Crit fail ${key} / 100 attacks: ${per100(value, iterations)}`);
    }
}

function per100(value, total) {
    return ((value / total) * 100).toFixed(2);
}

const iterationsArg = Number(process.argv[2]);
const iterations = Number.isFinite(iterationsArg) && iterationsArg > 0 ? iterationsArg : 10000;
const source = { id: "shooter", x: 0, y: 0, radius: 0.5 };
const target = { id: "target", x: 10, y: 0, armor: 4, radius: 0.5 };

const scenarios = [
    {
        name: "single shot, ally near line, ordinary misses can become stray hits",
        mode: "single",
        source,
        target,
        bystanders: [
            { id: "ally-line", x: 6, y: 0.35, armor: 1, radius: 0.5 },
            { id: "safe-side", x: 6, y: 3, armor: 1, radius: 0.5 }
        ],
        item: { system: { weaponType: "ranged", ballisticPower: 30, armorPiercing: 2 } },
        attack: { dmg: "20", bullets: 1 },
        ammo: { system: { ammoKind: "standard", calibre: "12g" } },
        resultTypeMix: [
            { resultType: "crit-success", chance: 0.05 },
            { resultType: "success", chance: 0.65 },
            { resultType: "fail", chance: 0.25 },
            { resultType: "crit-fail", chance: 0.05 }
        ]
    },
    {
        name: "high power rifle, overpenetration target behind primary",
        mode: "single",
        source,
        target,
        bystanders: [
            { id: "behind-target", x: 13, y: 0.2, armor: 0, radius: 0.5 }
        ],
        item: { system: { weaponType: "ranged", ballisticPower: 55, armorPiercing: 8 } },
        attack: { dmg: "24", bullets: 1 },
        ammo: { system: { ammoKind: "armor-piercing", calibre: "7.62" } },
        resultTypeMix: [
            { resultType: "crit-success", chance: 0.05 },
            { resultType: "success", chance: 0.75 },
            { resultType: "fail", chance: 0.15 },
            { resultType: "crit-fail", chance: 0.05 }
        ]
    },
    {
        name: "burst fire, several bodies inside cone, crit fail can cut burst short",
        mode: "burst",
        source,
        target,
        bystanders: [
            { id: "left-close", x: 8, y: 0.9, armor: 1, radius: 0.5 },
            { id: "right-close", x: 9, y: -0.8, armor: 1, radius: 0.5 },
            { id: "outside", x: 8, y: 4, armor: 1, radius: 0.5 }
        ],
        item: { system: { weaponType: "ranged", ballisticPower: 22, armorPiercing: 1, burstConeAngle: 22 } },
        attack: { dmg: "12", bullets: 5 },
        ammo: { system: { ammoKind: "homemade", calibre: "5.56" } },
        resultTypeMix: [
            { resultType: "crit-success", chance: 0.05 },
            { resultType: "success", chance: 0.65 },
            { resultType: "fail", chance: 0.25 },
            { resultType: "crit-fail", chance: 0.05 }
        ]
    },
    {
        name: "shot ammo, wider lane and cone increase collateral risk",
        mode: "burst",
        source,
        target,
        bystanders: [
            { id: "near-line", x: 6, y: 1.0, armor: 0, radius: 0.5 },
            { id: "near-cone", x: 7, y: -1.4, armor: 0, radius: 0.5 }
        ],
        item: { system: { weaponType: "ranged", ballisticPower: 28, armorPiercing: 1, lineWidth: 0.75, burstConeAngle: 18 } },
        attack: { dmg: "18", bullets: 3 },
        ammo: { system: { ammoKind: "shot", calibre: "12g" } },
        resultTypeMix: [
            { resultType: "crit-success", chance: 0.05 },
            { resultType: "success", chance: 0.65 },
            { resultType: "fail", chance: 0.25 },
            { resultType: "crit-fail", chance: 0.05 }
        ]
    }
];

console.log("ZSystem Firearm Ballistics Simulation");
console.log("=====================================");
console.log(`Iterations per scenario: ${iterations}`);

for (const scenario of scenarios) {
    printScenario(runScenario({ ...scenario, iterations }));
}
