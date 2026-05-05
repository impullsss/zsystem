import {
    buildTravelPlan,
    measureTokenTravelDistance,
    resolveWalkerTravelPressure,
    resolveWalkerTravelSupplies,
    resolveVehicleTravelWear,
    resolveTravelEvent,
    shouldBlockVehicleTravel,
    TRAVEL_ACTOR_TYPES
} from "./travel-rules.js";
import { buildTravelChatHtml } from "./travel-chat.js";
import { classifySurvivalItem, countSurvivalResources } from "./survival-resources.js";

export class TravelManager {
    static async handleMovement(tokenDoc, changes) {
        const actor = tokenDoc.actor;
        if (!actor) return true;

        if (shouldBlockVehicleTravel({ actorType: actor.type, broken: actor.system?.broken })) {
            ui.notifications.error("Транспорт неисправен: сначала нужен ремонт.");
            return false;
        }

        const distance = measureTokenTravelDistance(
            tokenDoc,
            changes,
            (origin, destination) => canvas.grid.measureDistance(origin, destination)
        );
        const plan = buildTravelPlan({
            actorType: actor.type,
            distance,
            fuel: actor.system?.resources?.fuel?.value,
            mpg: actor.system?.attributes?.mpg?.value,
            speed: actor.system?.attributes?.speed?.value,
            cargoWeight: getActorCargoWeight(actor),
            cargoMax: actor.system?.cargo?.max,
            terrain: tokenDoc.parent?.getFlag("zsystem", "travelTerrain") || "normal",
            movementMode: tokenDoc.parent?.getFlag("zsystem", "travelMovementMode") || "normal"
        });

        if (!plan.relevant) return true;
        if (!plan.allowed) {
            ui.notifications.error(`${plan.reason}: нужно ${plan.fuelCost}, есть ${actor.system?.resources?.fuel?.value ?? 0}.`);
            return false;
        }

        if (plan.actorType === TRAVEL_ACTOR_TYPES.vehicle && plan.fuelCost > 0) {
            await actor.update({ "system.resources.fuel.value": plan.fuelAfter });
        }

        plan.vehicleWear = resolveVehicleTravelWear({
            plan,
            hp: actor.system?.resources?.hp?.value,
            hpMax: actor.system?.resources?.hp?.max,
            maintenanceMode: getTravelMaintenanceMode()
        });

        if (plan.vehicleWear?.applied) {
            await actor.update({ "system.resources.hp.value": plan.vehicleWear.hpAfter });
        }

        if (plan.vehicleWear?.broken) {
            await actor.update({ "system.broken": true });
            ui.notifications.warn("Транспорт сломался во время перехода.");
        }

        plan.walkerPressure = resolveWalkerTravelPressure({
            plan,
            vigor: actor.system?.attributes?.vig?.value,
            survival: actor.system?.skills?.survival?.value
        });
        plan.walkerSupplies = resolveWalkerTravelSupplies({
            pressure: plan.walkerPressure,
            inventory: countSurvivalResources(actor.items ?? []),
            supplyMode: getTravelSupplyMode()
        });

        if (plan.walkerSupplies?.applied) {
            await spendActorSurvivalResource(actor, "food", plan.walkerSupplies.food.spent);
            await spendActorSurvivalResource(actor, "water", plan.walkerSupplies.water.spent);
            if (plan.walkerSupplies.fatigueTriggered) await actor.addFatigue?.(1);
        }

        const travelEvent = resolveTravelEvent({
            actorType: actor.type,
            distance: plan.distance,
            overload: plan.overload,
            terrain: plan.terrain,
            movementMode: plan.movementMode,
            mode: getTravelEventMode()
        });

        await ChatMessage.create({
            content: buildTravelChatHtml(plan, travelEvent),
            speaker: ChatMessage.getSpeaker({ actor })
        });

        return true;
    }
}

function getActorCargoWeight(actor) {
    if (actor.type !== "vehicle") return 0;
    let totalWeight = 0;
    actor.items?.forEach(item => {
        totalWeight += (Number(item.system?.weight) || 0) * (Number(item.system?.quantity) || 1);
    });
    return totalWeight;
}

function getTravelEventMode() {
    try {
        return game.settings.get("zsystem", "travelEventMode") || "off";
    } catch (_error) {
        return "off";
    }
}

function getTravelMaintenanceMode() {
    try {
        return game.settings.get("zsystem", "travelMaintenanceMode") || "off";
    } catch (_error) {
        return "off";
    }
}

function getTravelSupplyMode() {
    try {
        return game.settings.get("zsystem", "travelSupplyMode") || "report";
    } catch (_error) {
        return "report";
    }
}

async function spendActorSurvivalResource(actor, resourceType, amount) {
    let remaining = Math.max(0, Number(amount) || 0);
    if (remaining <= 0) return;

    for (const item of actor.items ?? []) {
        if (remaining <= 0) break;
        if (classifySurvivalItem(item) !== resourceType) continue;

        const quantity = Math.max(0, Number(item.system?.quantity) || 1);
        const spent = Math.min(quantity, Math.ceil(remaining));
        remaining -= spent;
        if (quantity - spent <= 0) await item.delete();
        else await item.update({ "system.quantity": quantity - spent });
    }
}
