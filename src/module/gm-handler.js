import { GLOBAL_STATUSES } from "./constants.js";
import { NoiseManager } from "./noise.js";

export class GMHandler {
    static initHooks() {
        // Глобальный перехватчик: только ГМ исполняет команды
        Hooks.on("createChatMessage", async (message, options, userId) => {
            if (!game.user.isGM) return;

            const flags = message.flags?.zsystem;

            if (flags?.transferItem) {
                const { sourceUuid, targetActorUuid } = flags.transferItem;
                const item = await fromUuid(sourceUuid);
                const targetActor = await fromUuid(targetActorUuid);
                if (item && targetActor) {
                    const target = targetActor.actor || targetActor;
                    const itemData = item.toObject();
                    await target.createEmbeddedDocuments("Item", [itemData]);
                    await item.delete();
                    console.log(`ZSystem | ГМ переложил ${item.name} в инвентарь ${target.name}`);
                }
            }

            if (!flags) return;

            if (flags.type === "heal") {
                const { healerUuid, targetUuid, itemData, limbKey } = flags;
                const healer = await fromUuid(healerUuid);
                const target = await fromUuid(targetUuid);
                if (healer && target) {
                    const realTarget = target.actor || target;
                    const realHealer = healer.actor || healer;
                    await realTarget.applyMedicineLogic(realHealer, itemData, limbKey);
                }
            }

            if (flags.advanceTime > 0) {
                await game.time.advance(flags.advanceTime);
            }

            if (flags.deleteItemUuid) {
                const itemToDelete = await fromUuid(flags.deleteItemUuid);
                if (itemToDelete) {
                    await itemToDelete.delete();
                    setTimeout(() => message.delete(), 500);
                }
            }

            if (flags.noiseAdd > 0) {
                const current = game.settings.get("zsystem", "currentNoise");
                await game.settings.set("zsystem", "currentNoise", Math.max(0, current + flags.noiseAdd));

                let sourceToken = null;
                if (message.speaker?.token) {
                    sourceToken = canvas.tokens.get(message.speaker.token);
                } else if (message.speaker?.actor) {
                    const actor = game.actors.get(message.speaker.actor);
                    if (actor) {
                        const tokens = actor.getActiveTokens();
                        if (tokens.length > 0) sourceToken = tokens[0];
                    }
                }
                if (sourceToken) {
                    await NoiseManager.checkAggro(sourceToken, flags.noiseAdd);
                }
            }

            if (flags.gmInfo) {
                await ChatMessage.create({
                    user: game.user.id,
                    speaker: { alias: "System" },
                    content: flags.gmInfo,
                    whisper: [game.user.id],
                    type: CONST.CHAT_MESSAGE_TYPES.WHISPER,
                    sound: null
                });
            }

            if (flags.damageData && Array.isArray(flags.damageData)) {
                const undoLog = [];
                for (let entry of flags.damageData) {
                    const doc = await fromUuid(entry.uuid);
                    const actor = doc?.actor || doc;
                    if (actor) {
                        const undoData = await actor.applyDamage(entry.amount, entry.type, entry.limb, entry.headshot || false, false, {
                            armorPiercing: entry.armorPiercing
                        });
                        if (entry.effects && entry.effects.length > 0) {
                            for (let effectId of entry.effects) {
                                const statusData = Object.values(GLOBAL_STATUSES).find(s => s.id === effectId || s.statuses.includes(effectId));
                                if (statusData && !actor.hasStatusEffect(statusData.id)) {
                                    const created = await actor.createEmbeddedDocuments("ActiveEffect", [statusData]);
                                    if (undoData && created.length > 0) {
                                        undoData.createdEffectIds.push(created[0].id);
                                    }
                                    ui.notifications.info(`${actor.name}: наложен эффект ${statusData.label}`);
                                }
                            }
                        }
                        if (undoData) undoLog.push(undoData);
                    }
                }
                if (undoLog.length > 0) await message.setFlag("zsystem", "undoData", undoLog);
            }

            if (flags.actorUpdate) {
                const doc = await fromUuid(flags.actorUpdate.uuid);
                const actor = doc?.actor || doc;
                if (actor) {
                    const updates = flags.actorUpdate.updates;
                    await actor.update(updates);
                    if (updates.img && actor.isToken) {
                        await actor.token.update({ texture: { src: updates.img } });
                    }
                }
            }

            if (flags.visuals && flags.visuals.type === "tracer") {
                const data = flags.visuals.data;
                const doc = (await canvas.scene.createEmbeddedDocuments("Drawing", [data]))[0];
                if (doc) {
                    setTimeout(async () => {
                        if (canvas.scene.drawings.has(doc.id)) await doc.delete();
                    }, 1000);
                }
                setTimeout(() => message.delete(), 500);
            }
        });

        // Конец боя — восстановить AP всем участникам
        Hooks.on("deleteCombat", async (combat, options, userId) => {
            if (!game.user.isGM) return;
            for (let combatant of combat.combatants) {
                const actor = combatant.actor;
                if (actor) {
                    const maxAP = actor.system.resources.ap.max || 7;
                    await actor.update({ "system.resources.ap.value": maxAP });
                }
            }
            ui.notifications.info("Бой окончен. Очки действия восстановлены.");
        });
    }
}

// Контекстное меню чата — кнопки "Нанести Урон" и "Отменить урон" (регистрируется на уровне модуля, до ready)
Hooks.on("getChatMessageContextOptions", (html, options) => {
    options.push({
        name: "Нанести Урон",
        icon: '<i class="fas fa-skull-crossbones"></i>',
        condition: (li) => {
            const messageId = $(li).data("messageId");
            const message = game.messages.get(messageId);
            const damageData = message?.getFlag("zsystem", "damageData");
            return game.user.isGM && Array.isArray(damageData) && damageData.length > 0;
        },
        callback: async (li) => {
            const messageId = $(li).data("messageId");
            const message = game.messages.get(messageId);
            const damageData = message?.getFlag("zsystem", "damageData");
            if (!damageData || !Array.isArray(damageData)) return;

            const undoLog = [];
            for (let entry of damageData) {
                const doc = await fromUuid(entry.uuid);
                const actor = doc?.actor || doc;
                if (actor) {
                    const undoData = await actor.applyDamage(entry.amount, entry.type, entry.limb, entry.headshot || false, false, {
                        armorPiercing: entry.armorPiercing
                    });
                    if (undoData) undoLog.push(undoData);
                } else {
                    ui.notifications.warn(`Не удалось найти цель (UUID: ${entry.uuid})`);
                }
            }
            if (undoLog.length > 0) await message.setFlag("zsystem", "undoData", undoLog);
        },
    });

    options.push({
        name: "Отменить Урон",
        icon: '<i class="fas fa-undo"></i>',
        condition: (li) => {
            const messageId = $(li).data("messageId");
            const message = game.messages.get(messageId);
            return game.user.isGM && message?.getFlag("zsystem", "undoData");
        },
        callback: async (li) => {
            const messageId = $(li).data("messageId");
            const message = game.messages.get(messageId);
            const undoLog = message?.getFlag("zsystem", "undoData");
            if (!undoLog || !Array.isArray(undoLog)) return;

            for (let entry of undoLog) {
                const doc = await fromUuid(entry.uuid);
                const actor = doc?.actor || doc;
                if (actor) {
                    if (!foundry.utils.isEmpty(entry.updates)) {
                        await actor.update(entry.updates);
                    }
                    if (entry.createdEffectIds && entry.createdEffectIds.length > 0) {
                        const idsToDelete = entry.createdEffectIds.filter(id => actor.effects.has(id));
                        if (idsToDelete.length > 0) {
                            await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
                        }
                    }
                    ui.notifications.info(`Откат для ${actor.name} выполнен.`);
                } else {
                    ui.notifications.warn(`Не удалось найти актора для отката (UUID: ${entry.uuid})`);
                }
            }
            await message.unsetFlag("zsystem", "undoData");
        },
    });
});
