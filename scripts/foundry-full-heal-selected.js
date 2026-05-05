// Run inside Foundry as a Script Macro.
// Fully heals all selected tokens through ZSystem's actor.fullHeal().

const tokens = canvas.tokens?.controlled || [];
if (!tokens.length) {
    ui.notifications.warn("Выбери один или несколько токенов для полного лечения.");
    return;
}

let healed = 0;
for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;

    if (typeof actor.fullHeal === "function") {
        await actor.fullHeal();
        healed += 1;
        continue;
    }

    const updates = {};
    if (actor.system?.resources?.hp) {
        updates["system.resources.hp.penalty"] = 0;
        updates["system.resources.hp.value"] = actor.system.resources.hp.max;
    }
    if (actor.system?.resources?.ap) {
        updates["system.resources.ap.value"] = actor.system.resources.ap.max;
    }
    if (actor.system?.limbs) {
        for (const [key, limb] of Object.entries(actor.system.limbs)) {
            updates[`system.limbs.${key}.penalty`] = 0;
            updates[`system.limbs.${key}.value`] = limb.max;
        }
    }
    if (Object.keys(updates).length) {
        await actor.update(updates);
        healed += 1;
    }
}

ui.notifications.info(`Полное лечение применено: ${healed}.`);
