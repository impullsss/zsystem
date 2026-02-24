export class ZBaseActorSheet extends ActorSheet {

    /** @override */
    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event);
        const actor = this.actor;

        // Обработка предметов
        if (data.type === "Item" && data.uuid) {
            const sourceItem = await fromUuid(data.uuid);
            
            // Если предмет существует и перетаскивается ОТ ДРУГОГО актора
            if (sourceItem && sourceItem.actor && sourceItem.actor.uuid !== actor.uuid) {
                
                // 1. Выполняем стандартное создание (Copy)
                const createdItems = await super._onDrop(event);
                
                // 2. Если создание прошло успешно (вернулся массив предметов)
                if (createdItems && createdItems.length > 0) {
                    
                    // 3. Пытаемся удалить исходный предмет
                    try {
                        if (sourceItem.isOwner) {
                            // Если у нас есть права (мы лутаем свой контейнер) — удаляем сами
                            await sourceItem.delete();
                        } else {
                            // Если прав нет (лутаем другого игрока) — просим ГМа
                            ChatMessage.create({
                                content: `<i>(Система) Удаление предмета после передачи...</i>`,
                                whisper: ChatMessage.getWhisperRecipients("GM"),
                                flags: {
                                    zsystem: {
                                        // Используем существующую логику "transferItem", 
                                        // но здесь мы просто просим удалить старый, т.к. новый уже создан через super._onDrop
                                        deleteItemUuid: sourceItem.uuid
                                    }
                                }
                            });
                        }
                    } catch (err) {
                        console.error("ZSystem | Ошибка удаления при перемещении:", err);
                    }
                }
                return createdItems;
            }
        }

        return super._onDrop(event);
    }

    /**
     * Логика передачи предмета в "чужой" лист
     */
    async _handleTransferToOther(data) {
        const sourceItem = await fromUuid(data.uuid);
        if (!sourceItem || !sourceItem.actor) return;

        const sourceActor = sourceItem.actor;
        const targetActor = this.actor;

        // Проверка на передачу самому себе
        if (sourceActor.uuid === targetActor.uuid) return;

        // ПРОВЕРКА ДИСТАНЦИИ
        const t1 = sourceActor.getActiveTokens()[0];
        const t2 = targetActor.getActiveTokens()[0];

        if (t1 && t2) {
            const dist = canvas.grid.measureDistance(t1, t2);
            if (dist > 3) {
                return ui.notifications.warn("Слишком далеко для передачи предмета!");
            }
        }

        // Создаем невидимый запрос для ГМа
        ChatMessage.create({
            content: `<i>Передача предмета: ${sourceItem.name} от ${sourceActor.name} к ${targetActor.name}</i>`,
            whisper: ChatMessage.getWhisperRecipients("GM"),
            flags: {
                zsystem: {
                    transferItem: {
                        sourceUuid: sourceItem.uuid,
                        targetActorUuid: targetActor.uuid
                    }
                }
            }
        });

        ui.notifications.info(`Вы передаете ${sourceItem.name} персонажу ${targetActor.name}...`);
        return false;
    }
}