import {
    buildTravelPlan,
    getTravelEventChance,
    resolveTravelEvent,
    resolveVehicleTravelWear,
    resolveWalkerTravelPressure
} from "../src/module/travel-rules.js";

const iterations = Number(process.argv[2]) || 10000;

const scenarios = [
    { name: "пешком короткий переход", actorType: "survivor", distance: 8, speed: 3, vigor: 6, survival: 25 },
    { name: "пешком форсаж по пересечёнке", actorType: "survivor", distance: 28, speed: 3, terrain: "rough", movementMode: "forced", vigor: 4, survival: 10 },
    { name: "машина по глобалке", actorType: "vehicle", distance: 50, speed: 50, fuel: 20, mpg: 5, hp: 90, hpMax: 100 },
    { name: "дальний рейд", actorType: "vehicle", distance: 180, speed: 60, fuel: 50, mpg: 8, hp: 80, hpMax: 100 },
    { name: "плохая дорога", actorType: "vehicle", distance: 70, speed: 50, fuel: 30, mpg: 10, terrain: "rough", hp: 80, hpMax: 100 },
    { name: "перегруженный грузовик", actorType: "vehicle", distance: 80, speed: 50, fuel: 30, mpg: 8, cargoWeight: 900, cargoMax: 600, hp: 70, hpMax: 100 },
    { name: "осторожный объезд", actorType: "vehicle", distance: 70, speed: 45, fuel: 30, mpg: 10, terrain: "dangerous", movementMode: "cautious", hp: 70, hpMax: 100 },
    { name: "форсаж через опасную зону", actorType: "vehicle", distance: 70, speed: 45, fuel: 30, mpg: 10, terrain: "dangerous", movementMode: "forced", hp: 70, hpMax: 100 },
    { name: "почти без топлива", actorType: "vehicle", distance: 80, speed: 40, fuel: 4, mpg: 10, hp: 50, hpMax: 100 }
];

console.log("ZSystem Travel Simulation");
console.log("=========================");
console.log(`Iterations per scenario: ${iterations}`);

for (const scenario of scenarios) {
    const plan = buildTravelPlan(scenario);
    const eventChance = getTravelEventChance({
        distance: plan.distance,
        actorType: scenario.actorType,
        overload: plan.overload,
        terrain: plan.terrain,
        movementMode: plan.movementMode
    });
    const events = simulateEvents(scenario, iterations);
    const wear = simulateWear(scenario, iterations);
    const walkerPressure = resolveWalkerTravelPressure({
        plan,
        vigor: scenario.vigor,
        survival: scenario.survival
    });

    console.log(`\nScenario: ${scenario.name}`);
    console.log(`Allowed: ${plan.allowed ? "yes" : "no"}${plan.reason ? ` (${plan.reason})` : ""}`);
    console.log(`Distance: ${plan.distance} km`);
    console.log(`Terrain: ${plan.terrain?.label || "Обычная местность"}`);
    console.log(`Movement: ${plan.movementMode?.label || "Обычно"}`);
    console.log(`Time: ${plan.timeLabel}`);
    if (plan.actorType === "vehicle") {
        console.log(`Fuel: -${plan.fuelCost} -> ${plan.fuelAfter}`);
        if (plan.overload?.overloaded) {
            console.log(`Overload: +${Math.round(plan.overload.ratio * 100)}% cargo, fuel x${plan.overload.fuelMultiplier}, speed x${plan.overload.speedMultiplier}`);
        }
        console.log(`Wear chance: ${wear.wearChance}%`);
        console.log(`Wear / 100 travels: ${wear.wearPer100.toFixed(1)}`);
        console.log(`Avg durability loss / travel: ${wear.avgLoss.toFixed(2)}`);
        console.log(`Breakdowns / 100 travels: ${wear.breakdownsPer100.toFixed(1)}`);
    }
    if (walkerPressure) {
        console.log(`Walker fatigue chance: ${walkerPressure.fatigueChance}% (${walkerPressure.risk})`);
        console.log(`Expected supplies: water ~${walkerPressure.waterUnits}, food ~${walkerPressure.foodUnits}, rest ~${walkerPressure.restHours}h`);
    }
    console.log(`Event chance: ${eventChance}%`);
    console.log(`Events / 100 travels: ${events.total.toFixed(1)}`);
    for (const [type, count] of Object.entries(events.byType)) {
        if (count > 0) console.log(`- ${type}: ${count.toFixed(1)}`);
    }
}

function simulateEvents(scenario, count) {
    const byType = {};
    let total = 0;
    const plan = buildTravelPlan(scenario);
    if (!plan.allowed) return { total: 0, byType: {} };
    for (let i = 0; i < count; i++) {
        const event = resolveTravelEvent({
            actorType: scenario.actorType,
            distance: scenario.distance,
            overload: plan.overload,
            terrain: scenario.terrain || "normal",
            movementMode: scenario.movementMode || "normal",
            mode: "report",
            random: Math.random
        });
        if (!event) continue;
        total += 1;
        byType[event.label] = (byType[event.label] || 0) + 1;
    }

    return {
        total: total / count * 100,
        byType: Object.fromEntries(
            Object.entries(byType).map(([type, eventCount]) => [type, eventCount / count * 100])
        )
    };
}

function simulateWear(scenario, count) {
    const plan = buildTravelPlan(scenario);
    if (!plan.allowed) return { wearChance: 0, wearPer100: 0, avgLoss: 0, breakdownsPer100: 0 };
    const baseline = resolveVehicleTravelWear({
        plan,
        hp: scenario.hp ?? 100,
        hpMax: scenario.hpMax ?? 100,
        maintenanceMode: "report",
        random: () => 1
    });
    if (!baseline) return { wearChance: 0, wearPer100: 0, avgLoss: 0, breakdownsPer100: 0 };

    let wearCount = 0;
    let totalLoss = 0;
    let breakdowns = 0;
    for (let i = 0; i < count; i++) {
        const wear = resolveVehicleTravelWear({
            plan,
            hp: scenario.hp ?? 100,
            hpMax: scenario.hpMax ?? 100,
            maintenanceMode: "report",
            random: Math.random
        });
        if (wear.wearAmount > 0) wearCount += 1;
        totalLoss += wear.wearAmount;
        if (wear.breakdown) breakdowns += 1;
    }

    return {
        wearChance: baseline.wearChance,
        wearPer100: wearCount / count * 100,
        avgLoss: totalLoss / count,
        breakdownsPer100: breakdowns / count * 100
    };
}
