import { calcSkillCheckBands, calcSkillCheckResult } from "./check-model.js";
import { estimateScavengeYield } from "./survival-economy.js";

export const GATHERING_TERRAINS = {
    urban: { id: "urban", label: "Город", food: 0.8, water: 0.7, parts: 1.4, medicine: 1.1, danger: 15 },
    wilderness: { id: "wilderness", label: "Дикая местность", food: 1.2, water: 1.1, parts: 0.5, medicine: 0.7, danger: 10 },
    road: { id: "road", label: "Дорога", food: 0.7, water: 0.8, parts: 0.9, medicine: 0.5, danger: 8 },
    ruins: { id: "ruins", label: "Руины", food: 0.6, water: 0.6, parts: 1.3, medicine: 0.8, danger: 20 }
};

export const CAMP_ACTIVITY_PRESETS = {
    rest: { id: "rest", label: "Отдых", fatigueRecovery: 1, scavengeMultiplier: 0.25, dangerModifier: -5 },
    forage: { id: "forage", label: "Поиск припасов", fatigueRecovery: 0, scavengeMultiplier: 1, dangerModifier: 0 },
    repair: { id: "repair", label: "Ремонт", fatigueRecovery: 0, scavengeMultiplier: 0.35, dangerModifier: 5 },
    hidden: { id: "hidden", label: "Тихий лагерь", fatigueRecovery: 1, scavengeMultiplier: 0.15, dangerModifier: -10 }
};

export function buildGatheringCheckPlan({
    survivalSkill = 0,
    mechanicalSkill = 0,
    hours = 4,
    terrain = "urban",
    danger = "normal"
} = {}) {
    const terrainPreset = getGatheringTerrain(terrain);
    const safeHours = Math.max(1, Number(hours) || 4);
    const dangerDc = danger === "safe" ? -10 : danger === "dangerous" ? 20 : 0;
    const dc = Math.min(120, Math.max(20, 50 + terrainPreset.danger + dangerDc - Math.min(20, Math.floor(safeHours / 2))));
    const survivalBands = calcSkillCheckBands({ skill: Number(survivalSkill) || 0, difficulty: dc });
    const mechanicalBands = calcSkillCheckBands({ skill: Number(mechanicalSkill) || 0, difficulty: dc });

    return {
        dc,
        terrain: terrainPreset,
        hours: safeHours,
        danger,
        survivalBands,
        mechanicalBands,
        riskChance: Math.min(80, Math.max(5, terrainPreset.danger + dangerDc + Math.round(safeHours / 2)))
    };
}

export function resolveGatheringAttempt({
    survivalSkill = 0,
    mechanicalSkill = 0,
    hours = 4,
    terrain = "urban",
    danger = "normal",
    roll = null,
    random = Math.random
} = {}) {
    const plan = buildGatheringCheckPlan({ survivalSkill, mechanicalSkill, hours, terrain, danger });
    const d100 = roll ?? (Math.floor(random() * 100) + 1);
    const survivalResult = calcSkillCheckResult(d100, { skill: Number(survivalSkill) || 0, difficulty: plan.dc });
    const mechanicalResult = calcSkillCheckResult(d100, { skill: Number(mechanicalSkill) || 0, difficulty: plan.dc });
    const yieldBase = estimateScavengeYield({ hours, survivalSkill, mechanicsSkill: mechanicalSkill, terrain: "normal", risk: danger });
    const multiplier = getGatheringResultMultiplier(bestResult(survivalResult, mechanicalResult));
    const terrainPreset = plan.terrain;
    const riskTriggered = random() * 100 < plan.riskChance;

    return {
        plan,
        roll: d100,
        resultType: bestResult(survivalResult, mechanicalResult),
        survivalResult,
        mechanicalResult,
        riskTriggered,
        yield: {
            food: roundGathering(yieldBase.food * terrainPreset.food * multiplier),
            water: roundGathering(yieldBase.water * terrainPreset.water * multiplier),
            parts: roundGathering(yieldBase.parts * terrainPreset.parts * multiplier),
            medicine: roundGathering(yieldBase.medicine * terrainPreset.medicine * multiplier)
        }
    };
}

export function buildCampPlan({
    partySize = 1,
    hours = 8,
    terrain = "wilderness",
    activity = "rest",
    survivalSkill = 0,
    mechanicalSkill = 0
} = {}) {
    const safePartySize = Math.max(1, Number(partySize) || 1);
    const safeHours = Math.max(1, Number(hours) || 8);
    const activityPreset = CAMP_ACTIVITY_PRESETS[activity] || CAMP_ACTIVITY_PRESETS.rest;
    const gathering = resolveGatheringAttempt({
        survivalSkill,
        mechanicalSkill,
        hours: safeHours * activityPreset.scavengeMultiplier,
        terrain,
        danger: activityPreset.id === "hidden" ? "safe" : "normal",
        roll: 50,
        random: () => 1
    });

    return {
        partySize: safePartySize,
        hours: safeHours,
        terrain: getGatheringTerrain(terrain),
        activity: activityPreset,
        foodCost: roundGathering((safeHours / 24) * safePartySize * 2),
        waterCost: roundGathering((safeHours / 24) * safePartySize * 3),
        fatigueRecovery: Math.floor((safeHours / 8) * activityPreset.fatigueRecovery),
        expectedYield: gathering.yield,
        dangerChance: Math.min(80, Math.max(0, gathering.plan.riskChance + activityPreset.dangerModifier))
    };
}

export function resolveFoodSpoilage({
    items = [],
    hours = 24,
    temperature = "normal"
} = {}) {
    const temperatureMultiplier = temperature === "cold" ? 0.5 : temperature === "hot" ? 1.75 : 1;
    const updates = [];
    for (const item of items) {
        if (item?.type !== "food") continue;
        const spoilage = Math.max(0, Number(item.system?.spoilage) || 0);
        if (spoilage <= 0) continue;
        const quantity = Math.max(0, Number(item.system?.quantity) || 1);
        const spoiled = Math.min(quantity, Math.floor((spoilage * hours * temperatureMultiplier) / 24));
        if (spoiled > 0) updates.push({ item, spoiled, remaining: Math.max(0, quantity - spoiled) });
    }
    return updates;
}

export function resolveDirtyWaterRisk({
    waterUnits = 0,
    contamination = 35,
    survivalSkill = 0,
    boiled = false
} = {}) {
    const baseRisk = Math.max(0, Number(contamination) || 0);
    const boiledReduction = boiled ? 25 : 0;
    const skillReduction = Math.floor((Number(survivalSkill) || 0) / 20) * 3;
    const chance = Math.min(95, Math.max(0, baseRisk - boiledReduction - skillReduction + Math.max(0, Number(waterUnits) - 1) * 5));
    return {
        chance,
        label: chance >= 50 ? "опасно" : chance >= 20 ? "рискованно" : "терпимо"
    };
}

function getGatheringTerrain(terrain) {
    return GATHERING_TERRAINS[terrain] || GATHERING_TERRAINS.urban;
}

function getGatheringResultMultiplier(resultType) {
    if (resultType === "crit-success") return 1.75;
    if (resultType === "success") return 1;
    if (resultType === "crit-fail") return 0;
    return 0.35;
}

function bestResult(a, b) {
    const rank = { "crit-fail": 0, fail: 1, success: 2, "crit-success": 3 };
    return rank[b] > rank[a] ? b : a;
}

function roundGathering(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}
