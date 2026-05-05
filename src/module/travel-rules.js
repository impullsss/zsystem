import { calcSkillCheckBands, calcSkillCheckResult } from "./check-model.js";
import { buildSupplySpendPlan, getSupplyFatiguePenalty } from "./survival-resources.js";

export const TRAVEL_ACTOR_TYPES = {
    vehicle: "vehicle",
    walker: "walker",
    unsupported: "unsupported"
};

export const TRAVEL_EVENT_MODES = {
    off: "off",
    report: "report"
};

export const TRAVEL_MAINTENANCE_MODES = {
    off: "off",
    report: "report",
    auto: "auto"
};

export const TRAVEL_SUPPLY_MODES = {
    off: "off",
    report: "report",
    auto: "auto"
};

export const TRAVEL_VEHICLE_STATES = {
    working: "working",
    broken: "broken"
};

export const VEHICLE_REPAIR_TOOLS = {
    none: { id: "none", label: "\u0411\u0435\u0437 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432", modifier: -20 },
    improvised: { id: "improvised", label: "\u041f\u043e\u0434\u0440\u0443\u0447\u043d\u044b\u0435", modifier: -10 },
    basic: { id: "basic", label: "\u041d\u0430\u0431\u043e\u0440 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432", modifier: 0 },
    workshop: { id: "workshop", label: "\u041c\u0430\u0441\u0442\u0435\u0440\u0441\u043a\u0430\u044f", modifier: 20 }
};

export const TRAVEL_MOVEMENT_MODES = {
    cautious: {
        id: "cautious",
        label: "Осторожно",
        speedMultiplier: 0.75,
        fuelMultiplier: 0.95,
        eventChanceModifier: -8,
        wearMultiplier: 0.75
    },
    normal: {
        id: "normal",
        label: "Обычно",
        speedMultiplier: 1,
        fuelMultiplier: 1,
        eventChanceModifier: 0,
        wearMultiplier: 1
    },
    forced: {
        id: "forced",
        label: "Форсаж",
        speedMultiplier: 1.35,
        fuelMultiplier: 1.25,
        eventChanceModifier: 10,
        wearMultiplier: 1.75
    }
};

export const TRAVEL_EVENT_TYPES = {
    encounter: { label: "Встреча", tone: "danger" },
    weather: { label: "Погода", tone: "warning" },
    breakdown: { label: "Поломка", tone: "danger" },
    discovery: { label: "Находка", tone: "good" },
    hazard: { label: "Опасность", tone: "warning" }
};

export const TRAVEL_TERRAIN_PRESETS = {
    road: {
        id: "road",
        label: "Дорога",
        speedMultiplier: 1.15,
        fuelMultiplier: 0.9,
        eventChanceModifier: -2
    },
    normal: {
        id: "normal",
        label: "Обычная местность",
        speedMultiplier: 1,
        fuelMultiplier: 1,
        eventChanceModifier: 0
    },
    rough: {
        id: "rough",
        label: "Пересечённая местность",
        speedMultiplier: 0.7,
        fuelMultiplier: 1.25,
        eventChanceModifier: 8
    },
    dangerous: {
        id: "dangerous",
        label: "Опасная зона",
        speedMultiplier: 0.85,
        fuelMultiplier: 1.1,
        eventChanceModifier: 15
    }
};

export function getTravelActorType(actorType) {
    if (actorType === "vehicle") return TRAVEL_ACTOR_TYPES.vehicle;
    if (["survivor", "npc"].includes(actorType)) return TRAVEL_ACTOR_TYPES.walker;
    return TRAVEL_ACTOR_TYPES.unsupported;
}

export function measureTokenTravelDistance(token, changes, measureDistance) {
    if (!token || typeof measureDistance !== "function") return 0;
    const origin = { x: Number(token.x) || 0, y: Number(token.y) || 0 };
    const destination = {
        x: changes?.x ?? origin.x,
        y: changes?.y ?? origin.y
    };
    return roundTravelNumber(measureDistance(origin, destination));
}

export function buildTravelPlan({
    actorType,
    distance,
    fuel = 0,
    mpg = 0,
    speed = 0,
    cargoWeight = 0,
    cargoMax = 0,
    terrain = "normal",
    movementMode = "normal"
}) {
    const travelType = getTravelActorType(actorType);
    const safeDistance = Math.max(0, Number(distance) || 0);
    if (travelType === TRAVEL_ACTOR_TYPES.unsupported || safeDistance <= 0) {
        return {
            allowed: true,
            relevant: false,
            actorType: travelType,
            distance: safeDistance,
            fuelCost: 0,
            fuelAfter: Number(fuel) || 0,
            timeHours: 0,
            timeLabel: "0м",
            reason: ""
        };
    }

    const safeFuel = Math.max(0, Number(fuel) || 0);
    const safeMpg = Math.max(0, Number(mpg) || 0);
    const terrainPreset = getTravelTerrainPreset(terrain);
    const movementPreset = getTravelMovementMode(movementMode);
    const safeSpeed = travelType === TRAVEL_ACTOR_TYPES.vehicle
        ? Math.max(0.1, Number(speed) || 40)
        : Math.max(0.1, Number(speed) || 3);
    const overload = getVehicleOverload({ cargoWeight, cargoMax });
    const speedMultiplier = (travelType === TRAVEL_ACTOR_TYPES.vehicle ? overload.speedMultiplier : 1)
        * terrainPreset.speedMultiplier
        * movementPreset.speedMultiplier;
    const fuelMultiplier = (travelType === TRAVEL_ACTOR_TYPES.vehicle ? overload.fuelMultiplier : 1)
        * terrainPreset.fuelMultiplier
        * (travelType === TRAVEL_ACTOR_TYPES.vehicle ? movementPreset.fuelMultiplier : 1);
    const effectiveSpeed = roundTravelNumber(safeSpeed * speedMultiplier);
    const fuelCost = travelType === TRAVEL_ACTOR_TYPES.vehicle && safeMpg > 0
        ? roundTravelNumber((safeDistance / safeMpg) * fuelMultiplier)
        : 0;
    const allowed = travelType !== TRAVEL_ACTOR_TYPES.vehicle || safeFuel >= fuelCost;
    const timeHours = safeDistance / Math.max(0.1, effectiveSpeed);

    return {
        allowed,
        relevant: true,
        actorType: travelType,
        distance: safeDistance,
        fuelCost,
        fuelAfter: roundTravelNumber(Math.max(0, safeFuel - fuelCost)),
        timeHours,
        timeLabel: formatTravelTime(timeHours),
        speed: effectiveSpeed,
        overload,
        terrain: terrainPreset,
        movementMode: movementPreset,
        reason: allowed ? "" : "Недостаточно топлива"
    };
}

export function resolveTravelEvent({
    distance,
    actorType,
    overload = null,
    terrain = "normal",
    movementMode = "normal",
    mode = TRAVEL_EVENT_MODES.off,
    random = Math.random
}) {
    if (mode === TRAVEL_EVENT_MODES.off) return null;

    const travelType = getTravelActorType(actorType);
    if (travelType === TRAVEL_ACTOR_TYPES.unsupported) return null;

    const safeDistance = Math.max(0, Number(distance) || 0);
    const chance = getTravelEventChance({ distance: safeDistance, actorType: travelType, overload, terrain, movementMode });
    if (chance <= 0 || random() * 100 >= chance) return null;

    const eventPool = travelType === TRAVEL_ACTOR_TYPES.vehicle
        ? ["encounter", "weather", "breakdown", "discovery", "hazard"]
        : ["encounter", "weather", "discovery", "hazard"];
    const index = Math.min(eventPool.length - 1, Math.floor(random() * eventPool.length));
    const type = eventPool[index];
    const meta = TRAVEL_EVENT_TYPES[type];

    return {
        type,
        label: meta.label,
        tone: meta.tone,
        chance
    };
}

export function getTravelEventChance({ distance, actorType, overload = null, terrain = "normal", movementMode = "normal" }) {
    const safeDistance = Math.max(0, Number(distance) || 0);
    if (safeDistance <= 0) return 0;
    const travelType = getTravelActorType(actorType);
    const terrainPreset = typeof terrain === "string" ? getTravelTerrainPreset(terrain) : terrain;
    const movementPreset = typeof movementMode === "string" ? getTravelMovementMode(movementMode) : movementMode;
    const vehicleBonus = travelType === TRAVEL_ACTOR_TYPES.vehicle ? 5 : 0;
    const overloadBonus = travelType === TRAVEL_ACTOR_TYPES.vehicle ? Number(overload?.eventChanceBonus) || 0 : 0;
    const terrainBonus = Number(terrainPreset?.eventChanceModifier) || 0;
    const movementBonus = Number(movementPreset?.eventChanceModifier) || 0;
    return Math.min(75, Math.max(5, Math.round(5 + safeDistance / 10 + vehicleBonus + overloadBonus + terrainBonus + movementBonus)));
}

export function getTravelTerrainPreset(terrain) {
    return TRAVEL_TERRAIN_PRESETS[terrain] || TRAVEL_TERRAIN_PRESETS.normal;
}

export function getTravelMovementMode(mode) {
    return TRAVEL_MOVEMENT_MODES[mode] || TRAVEL_MOVEMENT_MODES.normal;
}

export function resolveVehicleTravelWear({
    plan,
    hp = 0,
    hpMax = 0,
    maintenanceMode = TRAVEL_MAINTENANCE_MODES.off,
    random = Math.random
} = {}) {
    if (!plan?.relevant || plan.actorType !== TRAVEL_ACTOR_TYPES.vehicle) return null;
    if (maintenanceMode === TRAVEL_MAINTENANCE_MODES.off) return null;

    const safeHp = Math.max(0, Number(hp) || 0);
    const safeHpMax = Math.max(1, Number(hpMax) || safeHp || 1);
    const terrainWear = getTerrainWearMultiplier(plan.terrain?.id);
    const overloadWear = plan.overload?.overloaded ? 1 + (Number(plan.overload.ratio) || 0) : 1;
    const movementWear = Number(plan.movementMode?.wearMultiplier) || 1;
    const distanceWear = Math.max(0, Number(plan.distance) || 0) / 160;
    const wearChance = Math.min(85, Math.max(0, Math.round(distanceWear * 100 * terrainWear * overloadWear * movementWear)));
    const breakdownChance = Math.min(60, Math.max(0, Math.round((wearChance / 4) + getLowHpBreakdownBonus(safeHp, safeHpMax))));
    const wearAmount = random() * 100 < wearChance ? Math.max(1, Math.round(distanceWear * terrainWear * overloadWear * movementWear)) : 0;
    const breakdown = random() * 100 < breakdownChance;

    return {
        mode: maintenanceMode,
        wearChance,
        breakdownChance,
        wearAmount,
        hpAfter: Math.max(0, safeHp - wearAmount),
        breakdown,
        applied: maintenanceMode === TRAVEL_MAINTENANCE_MODES.auto && wearAmount > 0,
        broken: maintenanceMode === TRAVEL_MAINTENANCE_MODES.auto && breakdown
    };
}

export function shouldBlockVehicleTravel({ actorType, broken = false } = {}) {
    return getTravelActorType(actorType) === TRAVEL_ACTOR_TYPES.vehicle && isTruthyFlag(broken);
}

export function resolveWalkerTravelPressure({ plan, vigor = 5, survival = 0 } = {}) {
    if (!plan?.relevant || plan.actorType !== TRAVEL_ACTOR_TYPES.walker) return null;

    const distance = Math.max(0, Number(plan.distance) || 0);
    const hours = Math.max(0, Number(plan.timeHours) || 0);
    const safeVigor = Math.max(1, Number(vigor) || 5);
    const safeSurvival = Math.max(0, Number(survival) || 0);
    const terrainFatigue = getTerrainFatigueMultiplier(plan.terrain?.id);
    const movementFatigue = getMovementFatigueMultiplier(plan.movementMode?.id);
    const pressure = (distance / 10 + hours / 2) * terrainFatigue * movementFatigue;
    const mitigation = Math.min(12, safeVigor + Math.floor(safeSurvival / 20));
    const fatigueChance = Math.min(80, Math.max(0, Math.round(pressure * 8 - mitigation)));

    return {
        fatigueChance,
        waterUnits: roundTravelNumber(Math.max(0.1, distance / 18 + hours / 8)),
        foodUnits: roundTravelNumber(Math.max(0.1, distance / 28 + hours / 12)),
        restHours: roundTravelNumber(Math.max(0, hours / 4)),
        risk: getWalkerRiskLabel(fatigueChance)
    };
}

export function resolveWalkerTravelSupplies({
    pressure = null,
    inventory = null,
    supplyMode = TRAVEL_SUPPLY_MODES.report,
    random = Math.random
} = {}) {
    if (!pressure || supplyMode === TRAVEL_SUPPLY_MODES.off) return null;

    const supplyPlan = buildSupplySpendPlan({ pressure, inventory });
    const shortagePenalty = getSupplyFatiguePenalty(supplyPlan);
    const fatigueChance = Math.min(95, Math.max(0, (Number(pressure.fatigueChance) || 0) + shortagePenalty));
    const fatigueTriggered = random() * 100 < fatigueChance;

    return {
        mode: supplyMode,
        food: supplyPlan.food,
        water: supplyPlan.water,
        shortagePenalty,
        fatigueChance,
        fatigueTriggered,
        applied: supplyMode === TRAVEL_SUPPLY_MODES.auto
    };
}

export function buildVehicleRepairPlan({
    hp = 0,
    hpMax = 0,
    broken = false,
    partsAvailable = 0,
    partsToSpend = 0,
    repairPerPart = 5
} = {}) {
    const safeHpMax = Math.max(1, Number(hpMax) || 1);
    const safeHp = Math.min(safeHpMax, Math.max(0, Number(hp) || 0));
    const safePartsAvailable = Math.max(0, Math.floor(Number(partsAvailable) || 0));
    const safeRepairPerPart = Math.max(1, Number(repairPerPart) || 5);
    const missingHp = Math.max(0, safeHpMax - safeHp);
    const usefulPartsForHp = Math.ceil(missingHp / safeRepairPerPart);
    const isBroken = isTruthyFlag(broken);
    const usefulParts = Math.max(isBroken ? 1 : 0, usefulPartsForHp);
    const requestedParts = Math.max(0, Math.floor(Number(partsToSpend) || 0));
    const partsSpent = Math.min(safePartsAvailable, requestedParts, usefulParts);
    const repairedHp = Math.min(missingHp, partsSpent * safeRepairPerPart);
    const hpAfter = Math.min(safeHpMax, safeHp + repairedHp);
    const clearsBroken = isBroken && partsSpent > 0 && hpAfter > 0;

    return {
        canRepair: safePartsAvailable > 0 && usefulParts > 0,
        partsAvailable: safePartsAvailable,
        partsSpent,
        repairedHp,
        hpAfter,
        hpMissing: missingHp,
        usefulParts,
        clearsBroken
    };
}

export function buildVehicleRepairCheckPlan({
    hp = 0,
    hpMax = 0,
    broken = false,
    mechanicSkill = 0,
    tools = "basic"
} = {}) {
    const safeHpMax = Math.max(1, Number(hpMax) || 1);
    const safeHp = Math.min(safeHpMax, Math.max(0, Number(hp) || 0));
    const hpRatio = safeHp / safeHpMax;
    const isBroken = isTruthyFlag(broken);
    const baseDc = hpRatio >= 0.75 ? 40 : hpRatio >= 0.4 ? 60 : 80;
    const brokenDc = isBroken ? 20 : 0;
    const dc = Math.min(120, baseDc + brokenDc);
    const toolProfile = VEHICLE_REPAIR_TOOLS[tools] || VEHICLE_REPAIR_TOOLS.basic;
    const effectiveSkill = Math.max(0, Number(mechanicSkill) + toolProfile.modifier);
    const bands = calcSkillCheckBands({ skill: effectiveSkill, difficulty: dc });

    return {
        dc,
        baseDc,
        brokenDc,
        mechanicSkill: Number(mechanicSkill) || 0,
        effectiveSkill,
        tools: toolProfile,
        bands,
        successChance: bands.successChance,
        difficultyLabel: getVehicleRepairDifficultyLabel(dc)
    };
}

export function resolveVehicleRepairAttempt({
    hp = 0,
    hpMax = 0,
    broken = false,
    partsAvailable = 0,
    partsToSpend = 0,
    repairPerPart = 5,
    mechanicSkill = 0,
    tools = "basic",
    roll = null,
    random = Math.random
} = {}) {
    const check = buildVehicleRepairCheckPlan({ hp, hpMax, broken, mechanicSkill, tools });
    const d100 = roll ?? (Math.floor(random() * 100) + 1);
    const resultType = calcSkillCheckResult(d100, {
        skill: check.effectiveSkill,
        difficulty: check.dc
    });
    const basePlan = buildVehicleRepairPlan({
        hp,
        hpMax,
        broken,
        partsAvailable,
        partsToSpend,
        repairPerPart
    });

    if (!basePlan.canRepair || basePlan.partsSpent <= 0) {
        return {
            ...basePlan,
            check,
            roll: d100,
            resultType: "blocked",
            applied: false,
            hpAfter: basePlan.hpAfter
        };
    }

    if (resultType === "crit-success") {
        const partsSpent = Math.max(1, Math.ceil(basePlan.partsSpent * 0.75));
        const repairedHp = Math.min(basePlan.hpMissing, Math.ceil(partsSpent * repairPerPart * 1.5));
        return {
            ...basePlan,
            check,
            roll: d100,
            resultType,
            partsSpent,
            repairedHp,
            hpAfter: Math.min(Math.max(1, Number(hpMax) || 1), (Number(hp) || 0) + repairedHp),
            clearsBroken: isTruthyFlag(broken),
            applied: true
        };
    }

    if (resultType === "success") {
        return {
            ...basePlan,
            check,
            roll: d100,
            resultType,
            applied: true
        };
    }

    if (resultType === "crit-fail") {
        const partsSpent = Math.min(basePlan.partsSpent, Math.max(1, Math.ceil(basePlan.partsSpent * 0.5)));
        const hpAfter = Math.max(0, (Number(hp) || 0) - Math.max(1, Math.round(repairPerPart / 2)));
        return {
            ...basePlan,
            check,
            roll: d100,
            resultType,
            partsSpent,
            repairedHp: 0,
            hpAfter,
            clearsBroken: false,
            breaksVehicle: true,
            applied: true
        };
    }

    return {
        ...basePlan,
        check,
        roll: d100,
        resultType,
        partsSpent: Math.min(basePlan.partsSpent, 1),
        repairedHp: 0,
        hpAfter: Number(hp) || 0,
        clearsBroken: false,
        applied: true
    };
}

export function getVehicleOverload({ cargoWeight = 0, cargoMax = 0 }) {
    const max = Math.max(0, Number(cargoMax) || 0);
    const weight = Math.max(0, Number(cargoWeight) || 0);
    if (max <= 0 || weight <= max) {
        return {
            overloaded: false,
            ratio: 0,
            fuelMultiplier: 1,
            speedMultiplier: 1,
            eventChanceBonus: 0
        };
    }

    const ratio = Math.min(1, (weight - max) / max);
    return {
        overloaded: true,
        ratio: roundTravelNumber(ratio),
        fuelMultiplier: roundTravelNumber(1 + ratio * 0.5),
        speedMultiplier: roundTravelNumber(1 - ratio * 0.35),
        eventChanceBonus: Math.round(ratio * 10)
    };
}

export function formatTravelTime(hours) {
    const safeHours = Math.max(0, Number(hours) || 0);
    const wholeHours = Math.floor(safeHours);
    const minutes = Math.round((safeHours - wholeHours) * 60);
    if (wholeHours <= 0) return `${minutes}м`;
    if (minutes <= 0) return `${wholeHours}ч`;
    return `${wholeHours}ч ${minutes}м`;
}

function roundTravelNumber(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function getTerrainWearMultiplier(terrainId) {
    if (terrainId === "road") return 0.65;
    if (terrainId === "rough") return 1.55;
    if (terrainId === "dangerous") return 1.35;
    return 1;
}

function getLowHpBreakdownBonus(hp, hpMax) {
    const ratio = hp / Math.max(1, hpMax);
    if (ratio <= 0.15) return 25;
    if (ratio <= 0.35) return 12;
    if (ratio <= 0.6) return 5;
    return 0;
}

function getTerrainFatigueMultiplier(terrainId) {
    if (terrainId === "road") return 0.75;
    if (terrainId === "rough") return 1.35;
    if (terrainId === "dangerous") return 1.2;
    return 1;
}

function getMovementFatigueMultiplier(modeId) {
    if (modeId === "cautious") return 0.85;
    if (modeId === "forced") return 1.6;
    return 1;
}

function getWalkerRiskLabel(chance) {
    if (chance >= 55) return "Тяжёлый переход";
    if (chance >= 25) return "Утомительно";
    return "Нормально";
}

function getVehicleRepairDifficultyLabel(dc) {
    if (dc >= 100) return "\u0430\u0432\u0430\u0440\u0438\u0439\u043d\u044b\u0439";
    if (dc >= 80) return "\u0442\u044f\u0436\u0451\u043b\u044b\u0439";
    if (dc >= 60) return "\u0441\u0440\u0435\u0434\u043d\u0438\u0439";
    return "\u043b\u0451\u0433\u043a\u0438\u0439";
}

function isTruthyFlag(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}
