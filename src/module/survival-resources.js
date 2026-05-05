export const SURVIVAL_RESOURCE_TYPES = {
    food: "food",
    water: "water",
    parts: "parts",
    tools: "tools",
    medicine: "medicine"
};

const RESOURCE_KEYWORDS = {
    [SURVIVAL_RESOURCE_TYPES.food]: ["food", "ration", "meal", "еда", "паек", "паёк", "консер", "сухпай"],
    [SURVIVAL_RESOURCE_TYPES.water]: ["water", "drink", "canteen", "bottle", "вода", "фляг", "бутыл"],
    [SURVIVAL_RESOURCE_TYPES.parts]: ["parts", "repair", "scrap", "детал", "запчаст", "лом", "металл"],
    [SURVIVAL_RESOURCE_TYPES.tools]: ["tool", "kit", "workshop", "инструмент", "набор", "мастерск"],
    [SURVIVAL_RESOURCE_TYPES.medicine]: ["medicine", "medkit", "bandage", "мед", "бинт", "аптеч"]
};

export const TOOL_QUALITY = {
    none: { id: "none", label: "Без инструментов", modifier: -20 },
    improvised: { id: "improvised", label: "Подручные", modifier: -10 },
    basic: { id: "basic", label: "Набор инструментов", modifier: 0 },
    workshop: { id: "workshop", label: "Мастерская", modifier: 20 }
};

export function classifySurvivalItem(item) {
    const type = String(item?.type || "").toLowerCase();
    const category = String(item?.system?.category || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();
    const haystack = `${type} ${category} ${name}`;

    if (type === "food" || matchesAny(haystack, RESOURCE_KEYWORDS.food)) return SURVIVAL_RESOURCE_TYPES.food;
    if (category === "water" || matchesAny(haystack, RESOURCE_KEYWORDS.water)) return SURVIVAL_RESOURCE_TYPES.water;
    if (type === "medicine" || matchesAny(haystack, RESOURCE_KEYWORDS.medicine)) return SURVIVAL_RESOURCE_TYPES.medicine;
    if (category === "tools" || matchesAny(haystack, RESOURCE_KEYWORDS.tools)) return SURVIVAL_RESOURCE_TYPES.tools;
    if (type === "materials" || matchesAny(haystack, RESOURCE_KEYWORDS.parts)) return SURVIVAL_RESOURCE_TYPES.parts;
    return null;
}

export function getItemResourceUnits(item, resourceType = null) {
    const detectedType = resourceType || classifySurvivalItem(item);
    if (!detectedType) return 0;

    const quantity = Math.max(0, Number(item?.system?.quantity) || 1);
    const resourceValue = Number(item?.system?.resourceValue);
    const satiety = Number(item?.system?.satiety);
    const perItem = Number.isFinite(resourceValue) && resourceValue > 0
        ? resourceValue
        : detectedType === SURVIVAL_RESOURCE_TYPES.food && Number.isFinite(satiety) && satiety > 0
            ? satiety
            : 1;
    return roundResource(quantity * perItem);
}

export function countSurvivalResources(items = []) {
    const totals = {
        food: 0,
        water: 0,
        parts: 0,
        tools: 0,
        medicine: 0,
        bestToolQuality: TOOL_QUALITY.none
    };

    for (const item of items) {
        const type = classifySurvivalItem(item);
        if (!type) continue;
        totals[type] = roundResource((totals[type] || 0) + getItemResourceUnits(item, type));
        if (type === SURVIVAL_RESOURCE_TYPES.tools) {
            totals.bestToolQuality = getBetterToolQuality(totals.bestToolQuality, getToolQuality(item));
        }
    }

    return totals;
}

export function planResourceSpend({ available = 0, required = 0 } = {}) {
    const safeAvailable = Math.max(0, Number(available) || 0);
    const safeRequired = Math.max(0, Number(required) || 0);
    const spent = Math.min(safeAvailable, Math.ceil(safeRequired));
    const shortage = Math.max(0, safeRequired - safeAvailable);
    return {
        required: roundResource(safeRequired),
        available: roundResource(safeAvailable),
        spent: roundResource(spent),
        shortage: roundResource(shortage),
        covered: shortage <= 0
    };
}

export function buildSupplySpendPlan({ pressure = null, inventory = null } = {}) {
    const resources = inventory || {};
    return {
        food: planResourceSpend({
            available: resources.food,
            required: pressure?.foodUnits
        }),
        water: planResourceSpend({
            available: resources.water,
            required: pressure?.waterUnits
        })
    };
}

export function getSupplyFatiguePenalty(supplyPlan) {
    if (!supplyPlan) return 0;
    const waterPenalty = supplyPlan.water?.shortage > 0 ? 25 : 0;
    const foodPenalty = supplyPlan.food?.shortage > 0 ? 10 : 0;
    return waterPenalty + foodPenalty;
}

export function getToolQuality(item) {
    const category = String(item?.system?.category || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();
    if (category === "workshop" || name.includes("мастерск") || name.includes("workshop")) return TOOL_QUALITY.workshop;
    if (category === "tools" || name.includes("набор") || name.includes("toolkit") || name.includes("инструмент")) return TOOL_QUALITY.basic;
    if (name.includes("подруч") || name.includes("improvised")) return TOOL_QUALITY.improvised;
    return TOOL_QUALITY.basic;
}

function getBetterToolQuality(a, b) {
    return (b?.modifier ?? -999) > (a?.modifier ?? -999) ? b : a;
}

function matchesAny(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
}

function roundResource(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}
