import { PerkLogic } from "./perk-logic.js";
import { TravelManager } from "./travel.js";

export function initTokenMovementHooks() {
    Hooks.on("preUpdateToken", async (tokenDoc, changes, context, userId) => {
        if (changes.x === undefined && changes.y === undefined) return true;
        if (game.user.id !== userId) return true;

        const actor = tokenDoc.actor;
        if (!actor) return true;

        const scene = tokenDoc.parent;
        const isGlobalMap = scene.getFlag("zsystem", "isGlobalMap");
        if (isGlobalMap) return await TravelManager.handleMovement(tokenDoc, changes);

        const inCombat = tokenDoc.inCombat || (game.combat?.active && game.combat.combatants.some(c => c.tokenId === tokenDoc.id));
        if (!inCombat) return true;

        const gridSize = canvas.dimensions.size;
        const dx = Math.abs((changes.x ?? tokenDoc.x) - tokenDoc.x);
        const dy = Math.abs((changes.y ?? tokenDoc.y) - tokenDoc.y);
        const squaresMoved = Math.max(Math.round(dx / gridSize), Math.round(dy / gridSize));
        if (squaresMoved <= 0) return true;

        let stepsCounter = actor.getFlag("zsystem", "turnSteps") || 0;
        let totalAPCost = 0;

        for (let i = 1; i <= squaresMoved; i++) {
            stepsCounter++;

            let singleStepCost = 1;
            if (actor.hasStatusEffect("prone")) singleStepCost += 1;
            if (actor.hasStatusEffect("overburdened")) singleStepCost += 1;
            if (actor.hasStatusEffect("stealth")) singleStepCost += 1;
            if (actor.hasStatusEffect("injury-leg-lLeg")) singleStepCost += 1;
            if (actor.hasStatusEffect("injury-leg-rLeg")) singleStepCost += 1;

            try {
                singleStepCost = PerkLogic.onGetStepCost(actor, singleStepCost, stepsCounter);
            } catch (e) {
                console.error("PerkLogic Error:", e);
            }

            totalAPCost += singleStepCost;
        }

        const currentAP = Number(actor.system.resources.ap?.value) || 0;
        if (currentAP < totalAPCost) {
            ui.notifications.warn(`Недостаточно AP! Нужно: ${totalAPCost}, есть: ${currentAP}`);
            return false;
        }

        await actor.update({
            "system.resources.ap.value": currentAP - totalAPCost,
            "flags.zsystem.turnSteps": stepsCounter
        });

        if (actor.hasStatusEffect("injury-torso")) {
            const torsoRoll = new Roll("1d5");
            await torsoRoll.evaluate();
            await actor.applyDamage(torsoRoll.total, "true", "torso");
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<div style="color:#e74c3c;">ТРАВМА ТОРСА: движение наносит ${torsoRoll.total} урона</div>`
            });
        }

        return true;
    });
}
