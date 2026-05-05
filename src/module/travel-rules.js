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

export const TRAVEL_VEHICLE_STATES = {
    working: "working",
    broken: "broken"
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

export function buildTravelChatHtml(plan, event = null) {
    if (!plan?.relevant) return "";
    const typeLabel = plan.actorType === TRAVEL_ACTOR_TYPES.vehicle ? "Транспорт" : "Пешком";
    const fuelRow = plan.actorType === TRAVEL_ACTOR_TYPES.vehicle
        ? `<div class="z-travel-row"><span>Топливо</span><b>-${plan.fuelCost} / осталось ${plan.fuelAfter}</b></div>`
        : "";
    const overloadRow = plan.overload?.overloaded
        ? `<div class="z-travel-row z-travel-row--bad"><span>Перегруз</span><b>+${Math.round(plan.overload.ratio * 100)}% груза</b></div>`
        : "";
    const terrainRow = plan.terrain
        ? `<div class="z-travel-row"><span>Местность</span><b>${plan.terrain.label}</b></div>`
        : "";
    const movementRow = plan.movementMode
        ? `<div class="z-travel-row"><span>Темп</span><b>${plan.movementMode.label}</b></div>`
        : "";

    return `
        <div class="z-chat-card z-travel-card">
            <div class="z-card-header z-travel-title">Путешествие</div>
            <div class="z-travel-row"><span>Режим</span><b>${typeLabel}</b></div>
            ${terrainRow}
            ${movementRow}
            <div class="z-travel-row"><span>Дистанция</span><b>${Math.round(plan.distance)} км</b></div>
            ${fuelRow}
            ${overloadRow}
            <div class="z-travel-row"><span>В пути</span><b>${plan.timeLabel}</b></div>
            ${buildTravelEventHtml(event)}
            ${buildWalkerPressureHtml(plan.walkerPressure)}
            ${buildVehicleWearHtml(plan.vehicleWear)}
        </div>`;
}

export function buildTravelEventHtml(event) {
    if (!event) return "";
    return `
        <div class="z-travel-event z-travel-event--${event.tone}">
            <span>Событие дороги</span>
            <b>${event.label}</b>
            <small>Шанс: ${event.chance}%</small>
        </div>`;
}

export function buildVehicleWearHtml(wear) {
    if (!wear) return "";
    const wearRow = wear.wearAmount > 0
        ? `<div class="z-travel-row z-travel-row--bad"><span>Износ</span><b>-${wear.wearAmount} прочн. / осталось ${wear.hpAfter}</b></div>`
        : `<div class="z-travel-row"><span>Износ</span><b>нет</b></div>`;
    const breakdownLabel = wear.broken
        ? "Поломка: транспорт остановлен"
        : "Риск поломки сработал";
    const breakdownRow = wear.breakdown
        ? `<div class="z-travel-event z-travel-event--danger"><span>Транспорт</span><b>${breakdownLabel}</b><small>Шанс: ${wear.breakdownChance}%</small></div>`
        : "";

    return `
        <div class="z-travel-event z-travel-event--warning">
            <span>Состояние транспорта</span>
            <b>${wear.mode === TRAVEL_MAINTENANCE_MODES.auto ? "Авто-износ" : "Отчёт"}</b>
            <small>Шанс износа: ${wear.wearChance}% · шанс поломки: ${wear.breakdownChance}%</small>
        </div>
        ${wearRow}
        ${breakdownRow}`;
}

export function buildWalkerPressureHtml(pressure) {
    if (!pressure) return "";
    return `
        <div class="z-travel-event z-travel-event--warning">
            <span>Пеший переход</span>
            <b>${pressure.risk}</b>
            <small>Усталость: ${pressure.fatigueChance}% · вода: ~${pressure.waterUnits} · еда: ~${pressure.foodUnits} · отдых: ~${pressure.restHours}ч</small>
        </div>`;
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

function isTruthyFlag(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}
