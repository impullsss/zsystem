import { calcSkillCheckBands, calcSkillCheckResult } from "./check-model.js";
import { countSurvivalResources, TOOL_QUALITY } from "./survival-resources.js";

export const WEAPON_REPAIR_DEFAULTS = {
    hpPerPart: 12,
    apCost: 4
};

export function buildWeaponRepairPlan({
    weapon = null,
    inventory = null,
    mechanicalSkill = 0,
    tools = null,
    partsToSpend = 1,
    hpPerPart = WEAPON_REPAIR_DEFAULTS.hpPerPart
} = {}) {
    const hp = Math.max(0, Number(weapon?.system?.hp?.value) || 0);
    const hpMax = Math.max(1, Number(weapon?.system?.hp?.max) || 100);
    const missingHp = Math.max(0, hpMax - hp);
    const resources = inventory || {};
    const toolProfile = tools || resources.bestToolQuality || TOOL_QUALITY.none;
    const safePartsAvailable = Math.max(0, Math.floor(Number(resources.parts) || 0));
    const usefulParts = Math.ceil(missingHp / Math.max(1, hpPerPart));
    const partsSpent = Math.min(
        safePartsAvailable,
        Math.max(0, Math.floor(Number(partsToSpend) || 0)),
        usefulParts
    );
    const jamPenalty = weapon?.system?.jammed ? 10 : 0;
    const hpRatio = hp / hpMax;
    const baseDc = hpRatio >= 0.75 ? 35 : hpRatio >= 0.4 ? 55 : 75;
    const dc = Math.min(120, baseDc + jamPenalty);
    const effectiveSkill = Math.max(0, Number(mechanicalSkill) + (toolProfile.modifier || 0));
    const bands = calcSkillCheckBands({ skill: effectiveSkill, difficulty: dc });

    return {
        canRepair: missingHp > 0 && partsSpent > 0,
        hp,
        hpMax,
        missingHp,
        partsAvailable: safePartsAvailable,
        usefulParts,
        partsSpent,
        hpPerPart,
        dc,
        mechanicalSkill: Number(mechanicalSkill) || 0,
        effectiveSkill,
        tools: toolProfile,
        bands,
        successChance: bands.successChance
    };
}

export function resolveWeaponRepairAttempt({
    weapon = null,
    inventory = null,
    mechanicalSkill = 0,
    tools = null,
    partsToSpend = 1,
    hpPerPart = WEAPON_REPAIR_DEFAULTS.hpPerPart,
    roll = null,
    random = Math.random
} = {}) {
    const plan = buildWeaponRepairPlan({
        weapon,
        inventory,
        mechanicalSkill,
        tools,
        partsToSpend,
        hpPerPart
    });
    const d100 = roll ?? (Math.floor(random() * 100) + 1);
    const resultType = calcSkillCheckResult(d100, { skill: plan.effectiveSkill, difficulty: plan.dc });

    if (!plan.canRepair) {
        return { ...plan, roll: d100, resultType: "blocked", repairedHp: 0, hpAfter: plan.hp, clearsJam: false };
    }

    if (resultType === "crit-success") {
        const repairedHp = Math.min(plan.missingHp, Math.ceil(plan.partsSpent * hpPerPart * 1.5));
        return {
            ...plan,
            roll: d100,
            resultType,
            repairedHp,
            hpAfter: Math.min(plan.hpMax, plan.hp + repairedHp),
            clearsJam: true
        };
    }

    if (resultType === "success") {
        const repairedHp = Math.min(plan.missingHp, plan.partsSpent * hpPerPart);
        return {
            ...plan,
            roll: d100,
            resultType,
            repairedHp,
            hpAfter: Math.min(plan.hpMax, plan.hp + repairedHp),
            clearsJam: Boolean(weapon?.system?.jammed)
        };
    }

    if (resultType === "crit-fail") {
        return {
            ...plan,
            roll: d100,
            resultType,
            repairedHp: 0,
            hpAfter: Math.max(0, plan.hp - Math.ceil(hpPerPart / 2)),
            clearsJam: false,
            worsensWeapon: true
        };
    }

    return {
        ...plan,
        roll: d100,
        resultType,
        repairedHp: 0,
        hpAfter: plan.hp,
        clearsJam: false
    };
}

export async function repairActorWeapon(actor, weapon, {
    partsToSpend = 1,
    roll = null,
    random = Math.random
} = {}) {
    if (!actor || !weapon || weapon.type !== "weapon") return null;
    const inventory = countSurvivalResources(actor.items ?? []);
    const attempt = resolveWeaponRepairAttempt({
        weapon,
        inventory,
        mechanicalSkill: actor.system?.skills?.mechanical?.value,
        partsToSpend,
        roll,
        random
    });
    if (attempt.resultType === "blocked") return attempt;

    await spendParts(actor, attempt.partsSpent);
    await weapon.update({
        "system.hp.value": attempt.hpAfter,
        "system.jammed": attempt.clearsJam ? false : weapon.system?.jammed
    });
    return attempt;
}

async function spendParts(actor, amount) {
    let remaining = Math.max(0, Number(amount) || 0);
    for (const item of actor.items ?? []) {
        if (remaining <= 0) break;
        if (!["materials", "resource"].includes(item.type)) continue;
        const category = String(item.system?.category || "").toLowerCase();
        const name = String(item.name || "").toLowerCase();
        if (category !== "parts" && !name.includes("parts") && !name.includes("детал") && !name.includes("лом")) continue;
        const quantity = Math.max(0, Number(item.system?.quantity) || 1);
        const spent = Math.min(quantity, Math.ceil(remaining));
        remaining -= spent;
        if (quantity - spent <= 0) await item.delete();
        else await item.update({ "system.quantity": quantity - spent });
    }
}
