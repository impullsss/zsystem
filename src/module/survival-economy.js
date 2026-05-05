export const ECONOMY_ITEM_BLUEPRINTS = {
    foodRation: {
        id: "foodRation",
        label: "Food ration",
        resource: "food",
        units: 1,
        weightKg: 0.5,
        valueCaps: 8,
        note: "One compact meal. Two units cover one survivor for a quiet day."
    },
    cleanWater: {
        id: "cleanWater",
        label: "Clean water",
        resource: "water",
        units: 1,
        weightKg: 1,
        valueCaps: 4,
        note: "One liter. Three units cover one survivor for a quiet day."
    },
    repairPart: {
        id: "repairPart",
        label: "Repair part",
        resource: "parts",
        units: 1,
        weightKg: 0.35,
        valueCaps: 10,
        note: "Generic mechanical part. One part is roughly 5 vehicle HP or one weapon repair step."
    },
    scrap: {
        id: "scrap",
        label: "Scrap",
        resource: "parts",
        units: 0.5,
        weightKg: 0.45,
        valueCaps: 4,
        note: "Cheap salvage. Two scrap units equal one repair part for repairs."
    },
    medicinePack: {
        id: "medicinePack",
        label: "Medicine pack",
        resource: "medicine",
        units: 1,
        weightKg: 0.2,
        valueCaps: 18,
        note: "Basic treatment consumable for trauma, bleeding or infection pressure."
    },
    fieldTools: {
        id: "fieldTools",
        label: "Field tools",
        resource: "tools",
        units: 1,
        weightKg: 3,
        valueCaps: 60,
        note: "Baseline toolkit. Removes no-tool penalties for repairs."
    },
    workshopTools: {
        id: "workshopTools",
        label: "Workshop tools",
        resource: "tools",
        units: 1,
        weightKg: 20,
        valueCaps: 300,
        note: "Heavy workshop kit. Expensive, hard to carry, but strong for settlements and vehicles."
    }
};

export const DAILY_SURVIVAL_NEEDS = {
    foodUnits: 2,
    waterUnits: 3
};

export const ECONOMY_TARGETS = {
    valuePerDayQuiet: 28,
    carryWeightPerDayQuietKg: 4,
    repairHpPerPart: 5,
    weaponRepairHpPerPart: 12
};

const TERRAIN_ECONOMY_MODIFIERS = {
    road: { food: 0.9, water: 0.9, scavenge: 0.75, eventRisk: 0.8 },
    normal: { food: 1, water: 1, scavenge: 1, eventRisk: 1 },
    rough: { food: 1.15, water: 1.25, scavenge: 0.85, eventRisk: 1.25 },
    dangerous: { food: 1.1, water: 1.15, scavenge: 1.15, eventRisk: 1.5 }
};

const MOVEMENT_ECONOMY_MODIFIERS = {
    cautious: { food: 0.95, water: 0.95, scavengeTime: 1.2 },
    normal: { food: 1, water: 1, scavengeTime: 1 },
    forced: { food: 1.25, water: 1.35, scavengeTime: 0.75 }
};

const SCAVENGE_YIELD_PER_4H = {
    food: 1.6,
    water: 2.4,
    parts: 1,
    medicine: 0.25
};

export function getEconomyItemBlueprints() {
    return Object.values(ECONOMY_ITEM_BLUEPRINTS).map((blueprint) => ({ ...blueprint }));
}

export function estimateDailySurvivalNeeds({
    partySize = 1,
    days = 1,
    terrain = "normal",
    movementMode = "normal",
    reserveRatio = 0.25
} = {}) {
    const safePartySize = Math.max(1, Math.floor(Number(partySize) || 1));
    const safeDays = Math.max(0, Number(days) || 0);
    const terrainMod = getTerrainEconomyModifier(terrain);
    const movementMod = getMovementEconomyModifier(movementMode);
    const reserveMultiplier = 1 + Math.max(0, Number(reserveRatio) || 0);

    return {
        partySize: safePartySize,
        days: roundEconomy(safeDays),
        foodUnits: roundEconomy(DAILY_SURVIVAL_NEEDS.foodUnits * safePartySize * safeDays * terrainMod.food * movementMod.food * reserveMultiplier),
        waterUnits: roundEconomy(DAILY_SURVIVAL_NEEDS.waterUnits * safePartySize * safeDays * terrainMod.water * movementMod.water * reserveMultiplier),
        reserveRatio: roundEconomy(reserveMultiplier - 1)
    };
}

export function estimateRepairReserve({
    vehicleMissingHp = 0,
    expectedVehicleWearHp = 0,
    weaponRepairHp = 0,
    traumaCases = 0,
    reserveRatio = 0.25
} = {}) {
    const reserveMultiplier = 1 + Math.max(0, Number(reserveRatio) || 0);
    const vehicleParts = (Math.max(0, Number(vehicleMissingHp) || 0) + Math.max(0, Number(expectedVehicleWearHp) || 0))
        / ECONOMY_TARGETS.repairHpPerPart;
    const weaponParts = Math.max(0, Number(weaponRepairHp) || 0) / ECONOMY_TARGETS.weaponRepairHpPerPart;
    const medicineUnits = Math.max(0, Number(traumaCases) || 0) * 1.5;

    return {
        partsUnits: roundEconomy(Math.ceil((vehicleParts + weaponParts) * reserveMultiplier)),
        medicineUnits: roundEconomy(Math.ceil(medicineUnits * reserveMultiplier))
    };
}

export function buildSurvivalLoadoutPlan({
    partySize = 1,
    days = 1,
    terrain = "normal",
    movementMode = "normal",
    travelPressure = null,
    vehicleMissingHp = 0,
    expectedVehicleWearHp = 0,
    weaponRepairHp = 0,
    traumaCases = 0,
    reserveRatio = 0.25,
    includeTools = true
} = {}) {
    const daily = estimateDailySurvivalNeeds({ partySize, days, terrain, movementMode, reserveRatio });
    const pressureFood = Math.max(0, Number(travelPressure?.foodUnits) || 0) * Math.max(1, Number(partySize) || 1);
    const pressureWater = Math.max(0, Number(travelPressure?.waterUnits) || 0) * Math.max(1, Number(partySize) || 1);
    const repair = estimateRepairReserve({
        vehicleMissingHp,
        expectedVehicleWearHp,
        weaponRepairHp,
        traumaCases,
        reserveRatio
    });

    const resources = {
        food: Math.max(daily.foodUnits, roundEconomy(pressureFood * (1 + reserveRatio))),
        water: Math.max(daily.waterUnits, roundEconomy(pressureWater * (1 + reserveRatio))),
        parts: repair.partsUnits,
        medicine: repair.medicineUnits,
        tools: includeTools ? 1 : 0
    };
    const totals = priceAndWeighResources(resources);

    return {
        partySize: Math.max(1, Math.floor(Number(partySize) || 1)),
        days: roundEconomy(Math.max(0, Number(days) || 0)),
        terrain,
        movementMode,
        resources,
        totals,
        daily,
        repair,
        notes: buildLoadoutNotes(resources, totals)
    };
}

export function priceAndWeighResources(resources = {}) {
    const food = multiplyResource("foodRation", resources.food);
    const water = multiplyResource("cleanWater", resources.water);
    const parts = multiplyResource("repairPart", resources.parts);
    const medicine = multiplyResource("medicinePack", resources.medicine);
    const tools = multiplyResource("fieldTools", resources.tools);
    const rows = [food, water, parts, medicine, tools].filter((row) => row.units > 0);

    return {
        rows,
        weightKg: roundEconomy(rows.reduce((sum, row) => sum + row.weightKg, 0)),
        valueCaps: roundEconomy(rows.reduce((sum, row) => sum + row.valueCaps, 0)),
        consumableWeightKg: roundEconomy(rows
            .filter((row) => row.resource !== "tools")
            .reduce((sum, row) => sum + row.weightKg, 0)),
        consumableValueCaps: roundEconomy(rows
            .filter((row) => row.resource !== "tools")
            .reduce((sum, row) => sum + row.valueCaps, 0))
    };
}

export function estimateScavengeYield({
    hours = 4,
    survivalSkill = 40,
    mechanicsSkill = 40,
    terrain = "normal",
    risk = "normal"
} = {}) {
    const safeHours = Math.max(0, Number(hours) || 0);
    const terrainMod = getTerrainEconomyModifier(terrain);
    const riskMod = risk === "safe" ? 0.8 : risk === "dangerous" ? 1.2 : 1;
    const survivalMultiplier = clamp(0.45 + (Number(survivalSkill) || 0) / 100, 0.5, 1.75);
    const mechanicsMultiplier = clamp(0.45 + (Number(mechanicsSkill) || 0) / 100, 0.5, 1.75);
    const timeMultiplier = safeHours / 4;

    return {
        food: roundEconomy(SCAVENGE_YIELD_PER_4H.food * timeMultiplier * survivalMultiplier * terrainMod.scavenge * riskMod),
        water: roundEconomy(SCAVENGE_YIELD_PER_4H.water * timeMultiplier * survivalMultiplier * terrainMod.scavenge * riskMod),
        parts: roundEconomy(SCAVENGE_YIELD_PER_4H.parts * timeMultiplier * mechanicsMultiplier * terrainMod.scavenge * riskMod),
        medicine: roundEconomy(SCAVENGE_YIELD_PER_4H.medicine * timeMultiplier * survivalMultiplier * terrainMod.scavenge * riskMod)
    };
}

export function estimateScavengeHoursForResources({
    resources = {},
    survivalSkill = 40,
    mechanicsSkill = 40,
    terrain = "normal",
    risk = "normal"
} = {}) {
    const yield4h = estimateScavengeYield({ hours: 4, survivalSkill, mechanicsSkill, terrain, risk });
    const hours = {};
    for (const resource of ["food", "water", "parts", "medicine"]) {
        const required = Math.max(0, Number(resources[resource]) || 0);
        const yieldPerHour = Math.max(0.01, yield4h[resource] / 4);
        hours[resource] = roundEconomy(required / yieldPerHour);
    }
    return {
        hours,
        bottleneckHours: roundEconomy(Math.max(...Object.values(hours))),
        yieldPer4h: yield4h
    };
}

export function buildEconomyBalanceReport(scenarios = getDefaultEconomyScenarios()) {
    return scenarios.map((scenario) => {
        const loadout = buildSurvivalLoadoutPlan(scenario);
        const scavenge = estimateScavengeHoursForResources({
            resources: loadout.resources,
            survivalSkill: scenario.survivalSkill,
            mechanicsSkill: scenario.mechanicsSkill,
            terrain: scenario.terrain,
            risk: scenario.risk
        });
        return {
            scenario,
            loadout,
            scavenge,
            flags: evaluateEconomyFlags(loadout, scavenge)
        };
    });
}

export function getDefaultEconomyScenarios() {
    return [
        { name: "solo one day on foot", partySize: 1, days: 1, terrain: "normal", movementMode: "normal", survivalSkill: 40, mechanicsSkill: 30 },
        { name: "four survivors three days", partySize: 4, days: 3, terrain: "rough", movementMode: "normal", survivalSkill: 50, mechanicsSkill: 40 },
        { name: "vehicle raid with repair reserve", partySize: 4, days: 2, terrain: "road", movementMode: "forced", vehicleMissingHp: 20, expectedVehicleWearHp: 10, survivalSkill: 45, mechanicsSkill: 60 },
        { name: "dangerous forced march", partySize: 3, days: 2, terrain: "dangerous", movementMode: "forced", traumaCases: 1, survivalSkill: 35, mechanicsSkill: 30 },
        { name: "post combat maintenance", partySize: 4, days: 1, terrain: "normal", movementMode: "cautious", weaponRepairHp: 36, traumaCases: 2, survivalSkill: 40, mechanicsSkill: 70 }
    ];
}

function multiplyResource(blueprintId, units = 0) {
    const blueprint = ECONOMY_ITEM_BLUEPRINTS[blueprintId];
    const safeUnits = Math.max(0, Number(units) || 0);
    return {
        id: blueprint.id,
        label: blueprint.label,
        resource: blueprint.resource,
        units: roundEconomy(safeUnits),
        weightKg: roundEconomy(safeUnits * blueprint.weightKg / blueprint.units),
        valueCaps: roundEconomy(safeUnits * blueprint.valueCaps / blueprint.units)
    };
}

function buildLoadoutNotes(resources, totals) {
    const notes = [];
    if (resources.water > resources.food) notes.push("Water is the main weight driver, so vehicles and caches matter.");
    if (resources.parts > 0) notes.push("Repair parts are intentionally expensive enough to make breakdowns a resource decision.");
    if (totals.weightKg > 25) notes.push("This load is heavy for one survivor and should push the party toward vehicles, caches or pack animals.");
    return notes;
}

function evaluateEconomyFlags(loadout, scavenge) {
    const flags = [];
    const quietDayValue = loadout.totals.consumableValueCaps / Math.max(1, loadout.partySize * loadout.days);
    const quietDayWeight = loadout.totals.consumableWeightKg / Math.max(1, loadout.partySize * loadout.days);
    if (quietDayValue > ECONOMY_TARGETS.valuePerDayQuiet * 1.8) flags.push("expensive");
    if (quietDayWeight > ECONOMY_TARGETS.carryWeightPerDayQuietKg * 1.5) flags.push("heavy");
    if (scavenge.bottleneckHours > 16) flags.push("hard-to-scavenge");
    if (flags.length === 0) flags.push("balanced");
    return flags;
}

function getTerrainEconomyModifier(terrain) {
    return TERRAIN_ECONOMY_MODIFIERS[terrain] || TERRAIN_ECONOMY_MODIFIERS.normal;
}

function getMovementEconomyModifier(mode) {
    return MOVEMENT_ECONOMY_MODIFIERS[mode] || MOVEMENT_ECONOMY_MODIFIERS.normal;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function roundEconomy(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}
