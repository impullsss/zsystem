import { GLOBAL_STATUSES, INJURY_EFFECTS, PANIC_STAGES } from "./constants.js";
import { applyArmorWear, calculateArmorWear, getActorProtection, resolveDamageProtection } from "./protection.js";

export async function applyDamage(actor, amount, type = "blunt", limb = "torso", headshot = false, ignoreAC = false, options = {}) {
    const undoData = {
        uuid: actor.uuid,
        updates: {},
        createdEffectIds: [],
    };

    let originalAmount = amount;
    if (actor.type === "zombie" && type === "fire") amount *= 2;

    const protection = getActorProtection(actor, {
        location: limb,
        damageType: type,
        ignoreAC
    });
    const protectionResult = resolveDamageProtection({
        amount,
        damageType: type,
        protection,
        armorPiercing: options.armorPiercing,
        headshot
    });
    const totalAC = protectionResult.effectiveAC;
    const totalResist = protectionResult.resist;
    const dmg = protectionResult.finalDamage;
    const armorWear = calculateArmorWear({
        protectionResult,
        protection,
        damageType: type
    });
    const armorWearMode = getArmorWearMode();
    const appliedArmorWear = armorWearMode === "auto" ? await applyArmorWear(armorWear) : [];
    const armorWearLog = buildArmorWearLog({ armorWear, armorWearMode, appliedArmorWear });

    ChatMessage.create({
        content: `<div style="font-size:0.85em; color:#555; background:#eee; padding:3px; border:1px solid #ccc;">
                    <b>Absorb Log (${actor.name})</b><br>
                    Raw: ${originalAmount} (${type})<br>
                    Armor AC: -${totalAC}${protectionResult.armorPiercing ? ` (AP ${protectionResult.armorPiercing})` : ""}<br>
                    Resist: -${totalResist}%<br>
                    ${armorWearLog}
                    ${headshot ? '<b style="color:#c0392b;">ХЕДШОТ ×2</b><br>' : ''}
                    <b>Final: ${dmg}</b>
                  </div>`,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        blind: true,
        speaker: { alias: "System" },
    });

    if (dmg > 0) {
        const currentHP = actor.system.resources.hp.value;
        const newHP = currentHP - dmg;

        undoData.updates["system.resources.hp.value"] = currentHP;
        const updateData = { "system.resources.hp.value": newHP };

        if (actor.system.limbs && actor.system.limbs[limb]) {
            const currentLimbVal = actor.system.limbs[limb].value;
            const newLimbHP = currentLimbVal - dmg;

            undoData.updates[`system.limbs.${limb}.value`] = currentLimbVal;
            updateData[`system.limbs.${limb}.value`] = newLimbHP;

            if (currentLimbVal > 0 && newLimbHP <= 0) {
                const addedIds = await actor._applyInjury(limb);
                if (addedIds) undoData.createdEffectIds.push(...addedIds);
            }
        }

        await actor.update(updateData);

        const vig = actor.system.attributes?.vig?.value || 1;
        const deathThreshold = -(vig * 5);

        if (newHP <= deathThreshold && !actor.hasStatusEffect("dead")) {
            const eff = await actor.createEmbeddedDocuments("ActiveEffect", [{
                id: "dead",
                name: "Мертв",
                icon: "icons/svg/skull.svg",
                statuses: ["dead"],
            }]);
            undoData.createdEffectIds.push(eff[0].id);

            const tokens = actor.getActiveTokens();
            for (let t of tokens) {
                await t.document.update({ alpha: 0.5, overlayEffect: "icons/svg/skull.svg" });
            }
        } else if (currentHP > 0 && newHP <= 0 && !actor.hasStatusEffect("status-unconscious")) {
            const eff1 = await actor.createEmbeddedDocuments("ActiveEffect", [INJURY_EFFECTS.unconscious]);
            undoData.createdEffectIds.push(eff1[0].id);

            const eff2 = await applyBleeding(actor, "torso");
            if (eff2) undoData.createdEffectIds.push(eff2);
        }

        if (actor.type !== "zombie" && actor.type !== "shelter" && newHP > deathThreshold) {
            await checkPanic(actor, dmg);
        }

        const _limbNames = { head: "Голова", torso: "Торс", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога" };
        ui.notifications.info(`${actor.name}: -${dmg} HP (${_limbNames[limb] || limb})`);

        return undoData;
    } else {
        ui.notifications.info(`${actor.name}: Урон поглощен броней!`);
        return null;
    }
}

function getArmorWearMode() {
    try {
        return game.settings.get("zsystem", "armorWearMode") || "report";
    } catch (_error) {
        return "report";
    }
}

function buildArmorWearLog({ armorWear, armorWearMode, appliedArmorWear }) {
    if (!armorWear?.enabled || armorWearMode === "off") return "";
    if (armorWearMode === "auto" && appliedArmorWear.length) {
        const labels = appliedArmorWear
            .map((entry) => `${entry.name}: ${entry.before} → ${entry.after}`)
            .join(", ");
        return `<span style="color:#b9770e;">Armor wear: ${labels}</span><br>`;
    }
    return `<span style="color:#b9770e;">Armor wear: -${armorWear.amount} прочн. (рекоменд.)</span><br>`;
}

export async function applyBleeding(actor, limb) {
    const base = GLOBAL_STATUSES.bleeding;
    const uniqueId = `bleeding-${limb}`;

    const exists = actor.effects.some((e) => e.id === uniqueId);
    if (exists) return null;

    const eff = foundry.utils.deepClone(base);
    eff.id = uniqueId;
    eff.name = `Кровотечение (${limb})`;
    eff.statuses = ["bleeding", uniqueId];

    const created = await actor.createEmbeddedDocuments("ActiveEffect", [eff]);
    return created[0].id;
}

export async function checkPanic(actor, damageAmount) {
    if (actor.hasStatusEffect("dead") ||
        actor.hasStatusEffect("status-unconscious") ||
        actor.hasStatusEffect("panic-breaking")) return;

    const bravery = actor.system.secondary?.bravery?.value || 0;
    const tenacity = actor.system.secondary?.tenacity?.value || 0;

    if (damageAmount > tenacity) {
        const roll = new Roll("1d100");
        await roll.evaluate();

        const saveTarget = bravery * 5;
        console.log(`ZSystem | Panic Check for ${actor.name}: Roll ${roll.total} vs Target ${saveTarget}`);

        if (roll.total > saveTarget) {
            let stage = "anxious";

            if (damageAmount > (actor.system.resources.hp.value / 2)) stage = "panicked";
            if (actor.hasStatusEffect("panic-anxious")) stage = "panicked";
            else if (actor.hasStatusEffect("panic-panicked")) stage = "breaking";

            await applyPanicStage(actor, stage, roll.total, saveTarget);
        }
    }
}

export async function applyPanicStage(actor, stage, rollResult, target) {
    const effectData = PANIC_STAGES[stage];
    if (!effectData) return;

    const oldIds = actor.effects
        .filter(e => ["panic-anxious", "panic-panicked", "panic-breaking"].some(s => e.statuses.has(s)))
        .map(e => e.id);

    if (oldIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", oldIds);

    await actor.createEmbeddedDocuments("ActiveEffect", [foundry.utils.deepClone(effectData)]);

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
        <div class="z-chat-card" style="border-left: 4px solid #7e57c2;">
            <div class="z-card-header">ПРОВЕРКА ХРАБРОСТИ</div>
            <div style="text-align:center; font-size:1.2em;"><b>ПРОВАЛ</b></div>
            <div style="font-size:0.9em; margin:5px 0;">Результат: ${rollResult} (Цель: ${target})</div>
            <hr>
            <div style="color:#d32f2f; font-weight:bold; text-align:center;">
                <i class="fas fa-exclamation-triangle"></i> СОСТОЯНИЕ: ${effectData.name}
            </div>
        </div>`
    });
}
