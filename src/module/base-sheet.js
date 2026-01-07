export class ZBaseActorSheet extends ActorSheet {

    /** @override */
    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event);
        const actor = this.actor;

        // Если это предмет и мы НЕ владельцы этого листа (значит, подкидываем кому-то)
        if (data.type === "Item" && !actor.isOwner) {
            return this._handleTransferToOther(data);
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