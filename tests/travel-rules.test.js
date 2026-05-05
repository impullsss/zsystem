import test from "node:test";
import assert from "node:assert/strict";

import {
    buildTravelChatHtml,
    buildTravelPlan,
    buildVehicleRepairCheckPlan,
    buildVehicleRepairPlan,
    buildVehicleWearHtml,
    buildWalkerPressureHtml,
    formatTravelTime,
    getTravelActorType,
    getTravelEventChance,
    getTravelMovementMode,
    getTravelTerrainPreset,
    getVehicleOverload,
    measureTokenTravelDistance,
    resolveTravelEvent,
    resolveVehicleRepairAttempt,
    resolveVehicleTravelWear,
    resolveWalkerTravelPressure,
    shouldBlockVehicleTravel,
    TRAVEL_ACTOR_TYPES
} from "../src/module/travel-rules.js";

test("travel actor type separates vehicles, walkers and unsupported actors", () => {
    assert.equal(getTravelActorType("vehicle"), TRAVEL_ACTOR_TYPES.vehicle);
    assert.equal(getTravelActorType("survivor"), TRAVEL_ACTOR_TYPES.walker);
    assert.equal(getTravelActorType("npc"), TRAVEL_ACTOR_TYPES.walker);
    assert.equal(getTravelActorType("zombie"), TRAVEL_ACTOR_TYPES.unsupported);
});

test("vehicle travel spends fuel from distance and mpg", () => {
    const plan = buildTravelPlan({
        actorType: "vehicle",
        distance: 25,
        fuel: 10,
        mpg: 5,
        speed: 50
    });

    assert.equal(plan.allowed, true);
    assert.equal(plan.relevant, true);
    assert.equal(plan.fuelCost, 5);
    assert.equal(plan.fuelAfter, 5);
    assert.equal(plan.timeLabel, "30м");
});

test("overloaded vehicle spends more fuel and travels slower", () => {
    const plan = buildTravelPlan({
        actorType: "vehicle",
        distance: 50,
        fuel: 20,
        mpg: 10,
        speed: 50,
        cargoWeight: 750,
        cargoMax: 500
    });

    assert.equal(plan.overload.overloaded, true);
    assert.equal(plan.overload.ratio, 0.5);
    assert.equal(plan.fuelCost, 6.25);
    assert.equal(plan.speed, 41.5);
    assert.equal(plan.timeLabel, "1ч 12м");
});

test("terrain modifies travel speed fuel and event chance", () => {
    const plan = buildTravelPlan({
        actorType: "vehicle",
        distance: 70,
        fuel: 30,
        mpg: 10,
        speed: 50,
        terrain: "rough"
    });

    assert.equal(plan.terrain.label, "Пересечённая местность");
    assert.equal(plan.fuelCost, 8.75);
    assert.equal(plan.speed, 35);
    assert.equal(getTravelEventChance({
        distance: 70,
        actorType: "vehicle",
        terrain: "rough"
    }), 25);
});

test("movement mode modifies speed fuel event chance and wear", () => {
    const cautious = buildTravelPlan({
        actorType: "vehicle",
        distance: 40,
        fuel: 20,
        mpg: 10,
        speed: 40,
        movementMode: "cautious"
    });
    const forced = buildTravelPlan({
        actorType: "vehicle",
        distance: 40,
        fuel: 20,
        mpg: 10,
        speed: 40,
        movementMode: "forced"
    });

    assert.equal(getTravelMovementMode("strange").id, "normal");
    assert.equal(cautious.speed, 30);
    assert.equal(cautious.fuelCost, 3.8);
    assert.equal(forced.speed, 54);
    assert.equal(forced.fuelCost, 5);
    assert.ok(getTravelEventChance({ distance: 40, actorType: "vehicle", movementMode: "forced" })
        > getTravelEventChance({ distance: 40, actorType: "vehicle", movementMode: "cautious" }));
});

test("unknown terrain falls back to normal travel terrain", () => {
    assert.equal(getTravelTerrainPreset("strange").label, "Обычная местность");
});

test("vehicle overload exposes fuel speed and event modifiers", () => {
    const overload = getVehicleOverload({ cargoWeight: 1000, cargoMax: 500 });

    assert.equal(overload.overloaded, true);
    assert.equal(overload.fuelMultiplier, 1.5);
    assert.equal(overload.speedMultiplier, 0.65);
    assert.equal(overload.eventChanceBonus, 10);
});

test("vehicle travel blocks movement when fuel is insufficient", () => {
    const plan = buildTravelPlan({
        actorType: "vehicle",
        distance: 60,
        fuel: 4,
        mpg: 10,
        speed: 30
    });

    assert.equal(plan.allowed, false);
    assert.equal(plan.reason, "Недостаточно топлива");
    assert.equal(plan.fuelCost, 6);
});

test("broken vehicle travel is blocked before fuel or events", () => {
    assert.equal(shouldBlockVehicleTravel({ actorType: "vehicle", broken: true }), true);
    assert.equal(shouldBlockVehicleTravel({ actorType: "vehicle", broken: "true" }), true);
    assert.equal(shouldBlockVehicleTravel({ actorType: "vehicle", broken: false }), false);
    assert.equal(shouldBlockVehicleTravel({ actorType: "vehicle", broken: "false" }), false);
    assert.equal(shouldBlockVehicleTravel({ actorType: "survivor", broken: true }), false);
});

test("walker travel reports time without spending fuel", () => {
    const plan = buildTravelPlan({
        actorType: "survivor",
        distance: 9,
        speed: 3
    });

    assert.equal(plan.allowed, true);
    assert.equal(plan.actorType, TRAVEL_ACTOR_TYPES.walker);
    assert.equal(plan.fuelCost, 0);
    assert.equal(plan.timeLabel, "3ч");
});

test("token travel distance delegates to Foundry grid measurement", () => {
    const distance = measureTokenTravelDistance(
        { x: 10, y: 20 },
        { x: 40, y: 60 },
        (origin, destination) => Math.hypot(destination.x - origin.x, destination.y - origin.y) / 10
    );

    assert.equal(distance, 5);
});

test("travel time formatting stays compact", () => {
    assert.equal(formatTravelTime(0), "0м");
    assert.equal(formatTravelTime(0.5), "30м");
    assert.equal(formatTravelTime(2), "2ч");
    assert.equal(formatTravelTime(2.25), "2ч 15м");
});

test("travel chat html is readable and includes fuel only for vehicles", () => {
    const vehicleHtml = buildTravelChatHtml(buildTravelPlan({
        actorType: "vehicle",
        distance: 25,
        fuel: 10,
        mpg: 5,
        speed: 50
    }));
    const walkerHtml = buildTravelChatHtml(buildTravelPlan({
        actorType: "npc",
        distance: 6,
        speed: 3
    }));

    assert.match(vehicleHtml, /Путешествие/);
    assert.match(vehicleHtml, /Топливо/);
    assert.match(vehicleHtml, /Темп/);
    assert.match(walkerHtml, /Пешком/);
    assert.doesNotMatch(walkerHtml, /Топливо/);
});

test("travel event chance grows with distance and vehicles are slightly riskier", () => {
    assert.equal(getTravelEventChance({ distance: 0, actorType: "vehicle" }), 0);
    assert.equal(getTravelEventChance({ distance: 10, actorType: "npc" }), 6);
    assert.equal(getTravelEventChance({ distance: 10, actorType: "vehicle" }), 11);
    assert.equal(getTravelEventChance({
        distance: 10,
        actorType: "vehicle",
        overload: { eventChanceBonus: 10 }
    }), 21);
    assert.equal(getTravelEventChance({ distance: 1000, actorType: "vehicle" }), 75);
});

test("travel events are optional and can be deterministic for tests", () => {
    assert.equal(resolveTravelEvent({
        actorType: "vehicle",
        distance: 100,
        mode: "off",
        random: () => 0
    }), null);

    const event = resolveTravelEvent({
        actorType: "vehicle",
        distance: 100,
        mode: "report",
        random: (() => {
            const values = [0, 0.45];
            return () => values.shift() ?? 0;
        })()
    });

    assert.equal(event.type, "breakdown");
    assert.equal(event.label, "Поломка");
    assert.equal(event.chance, 20);
});

test("vehicle travel wear can report or apply maintenance pressure", () => {
    const plan = buildTravelPlan({
        actorType: "vehicle",
        distance: 80,
        fuel: 20,
        mpg: 10,
        speed: 50,
        terrain: "rough",
        movementMode: "forced"
    });
    const wear = resolveVehicleTravelWear({
        plan,
        hp: 20,
        hpMax: 100,
        maintenanceMode: "auto",
        random: () => 0
    });

    assert.equal(wear.applied, true);
    assert.equal(wear.broken, true);
    assert.ok(wear.wearChance > 80);
    assert.ok(wear.breakdownChance > 30);
    assert.ok(wear.wearAmount >= 1);
    assert.match(buildVehicleWearHtml(wear), /Состояние транспорта/);
    assert.match(buildVehicleWearHtml(wear), /транспорт остановлен/);
});

test("walker travel pressure estimates fatigue and supplies without spending them", () => {
    const easyPlan = buildTravelPlan({
        actorType: "survivor",
        distance: 8,
        speed: 4,
        terrain: "road",
        movementMode: "cautious"
    });
    const hardPlan = buildTravelPlan({
        actorType: "survivor",
        distance: 30,
        speed: 3,
        terrain: "rough",
        movementMode: "forced"
    });

    const easy = resolveWalkerTravelPressure({ plan: easyPlan, vigor: 7, survival: 40 });
    const hard = resolveWalkerTravelPressure({ plan: hardPlan, vigor: 3, survival: 0 });

    assert.ok(hard.fatigueChance > easy.fatigueChance);
    assert.ok(hard.waterUnits > easy.waterUnits);
    assert.match(buildWalkerPressureHtml(hard), /Пеший переход/);
});

test("vehicle repair plan spends only useful parts and can clear broken state", () => {
    const damaged = buildVehicleRepairPlan({
        hp: 70,
        hpMax: 100,
        broken: true,
        partsAvailable: 10,
        partsToSpend: 20,
        repairPerPart: 5
    });
    const alreadyFine = buildVehicleRepairPlan({
        hp: 100,
        hpMax: 100,
        broken: false,
        partsAvailable: 10,
        partsToSpend: 5,
        repairPerPart: 5
    });
    const brokenButFull = buildVehicleRepairPlan({
        hp: 100,
        hpMax: 100,
        broken: "true",
        partsAvailable: 3,
        partsToSpend: 3,
        repairPerPart: 5
    });

    assert.equal(damaged.partsSpent, 6);
    assert.equal(damaged.repairedHp, 30);
    assert.equal(damaged.hpAfter, 100);
    assert.equal(damaged.clearsBroken, true);
    assert.equal(alreadyFine.canRepair, false);
    assert.equal(alreadyFine.partsSpent, 0);
    assert.equal(brokenButFull.partsSpent, 1);
    assert.equal(brokenButFull.repairedHp, 0);
    assert.equal(brokenButFull.clearsBroken, true);
});

test("vehicle repair check uses mechanics skill and tools against vehicle condition", () => {
    const noTools = buildVehicleRepairCheckPlan({
        hp: 25,
        hpMax: 100,
        broken: true,
        mechanicSkill: 60,
        tools: "none"
    });
    const workshop = buildVehicleRepairCheckPlan({
        hp: 25,
        hpMax: 100,
        broken: true,
        mechanicSkill: 60,
        tools: "workshop"
    });

    assert.equal(noTools.dc, 100);
    assert.equal(noTools.effectiveSkill, 40);
    assert.equal(workshop.effectiveSkill, 80);
    assert.ok(workshop.successChance > noTools.successChance);
});

test("vehicle repair attempt applies crit success success fail and crit fail differently", () => {
    const base = {
        hp: 50,
        hpMax: 100,
        broken: true,
        partsAvailable: 10,
        partsToSpend: 6,
        repairPerPart: 5,
        mechanicSkill: 100,
        tools: "workshop"
    };

    const crit = resolveVehicleRepairAttempt({ ...base, roll: 1 });
    const success = resolveVehicleRepairAttempt({ ...base, roll: 40 });
    const fail = resolveVehicleRepairAttempt({ ...base, mechanicSkill: 20, tools: "none", roll: 50 });
    const fumble = resolveVehicleRepairAttempt({ ...base, mechanicSkill: 20, tools: "none", roll: 100 });

    assert.equal(crit.resultType, "crit-success");
    assert.ok(crit.partsSpent < success.partsSpent);
    assert.ok(crit.repairedHp >= success.repairedHp);
    assert.equal(success.resultType, "success");
    assert.equal(success.clearsBroken, true);
    assert.equal(fail.resultType, "fail");
    assert.equal(fail.repairedHp, 0);
    assert.equal(fail.partsSpent, 1);
    assert.equal(fumble.resultType, "crit-fail");
    assert.equal(fumble.breaksVehicle, true);
    assert.ok(fumble.hpAfter < base.hp);
});

test("travel chat can include road event vehicle wear and walker pressure reports", () => {
    const vehiclePlan = buildTravelPlan({
        actorType: "vehicle",
        distance: 100,
        fuel: 40,
        mpg: 10,
        speed: 50
    });
    vehiclePlan.vehicleWear = resolveVehicleTravelWear({
        plan: vehiclePlan,
        hp: 80,
        hpMax: 100,
        maintenanceMode: "report",
        random: () => 0
    });

    const vehicleHtml = buildTravelChatHtml(
        vehiclePlan,
        { label: "Опасность", tone: "warning", chance: 20 }
    );

    const walkerPlan = buildTravelPlan({
        actorType: "npc",
        distance: 20,
        speed: 3
    });
    walkerPlan.walkerPressure = resolveWalkerTravelPressure({ plan: walkerPlan, vigor: 4, survival: 10 });
    const walkerHtml = buildTravelChatHtml(walkerPlan);

    assert.match(vehicleHtml, /Событие дороги/);
    assert.match(vehicleHtml, /Опасность/);
    assert.match(vehicleHtml, /Шанс: 20%/);
    assert.match(vehicleHtml, /Состояние транспорта/);
    assert.match(walkerHtml, /Пеший переход/);
});
