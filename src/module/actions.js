export class ZSystemActions {
    static async interact() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken) return ui.notifications.warn("Сначала выделите своего персонажа!");

        const targets = canvas.tokens.placeables.filter(t => {
            if (t.id === myToken.id || !t.actor) return false;
            return canvas.grid.measureDistance(myToken, t) <= 3.5;
        });

        if (targets.length === 0) return ui.notifications.warn("Рядом нет ничего интересного.");

        targets.sort((a, b) => canvas.grid.measureDistance(myToken, a) - canvas.grid.measureDistance(myToken, b));
        const target = targets[0];
        target.actor.sheet.render(true);
        ui.notifications.info(`Взаимодействие с ${target.name}`);
    }

    static async manualSearch() {
        const myToken = canvas.tokens.controlled[0];
        if (!myToken) return ui.notifications.warn("Сначала выделите своего персонажа!");

        const actor = myToken.actor;
        const per = actor.system.attributes.per.value;
        const roll = new Roll("1d10 + @per", { per });
        await roll.evaluate();

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `<b>${actor.name}</b> внимательно осматривает местность...`
        });

        const searchResult = roll.total;
        let foundCount = 0;
        const hiddenTokens = canvas.tokens.placeables.filter(t => t.document.hidden);

        for (let t of hiddenTokens) {
            const targetActor = t.actor;
            if (!targetActor) continue;
            const sys = targetActor.system.attributes;
            const spotDC = sys?.spotDC?.value || 15;
            const spotRadius = sys?.spotRadius?.value || 5;
            const dist = canvas.grid.measureDistance(myToken, t);
            if (dist <= spotRadius && searchResult >= spotDC) {
                await t.document.update({ hidden: false });
                canvas.interface.createScrollingText(t.center, "👁️ Найдено!", {
                    fill: "#ffeb3b",
                    stroke: 0x000000,
                    fontSize: 32,
                    fontWeight: "bold"
                });
                foundCount++;
            }
        }

        if (foundCount > 0) {
            ui.notifications.info(`Вы обнаружили что-то интересное! (${foundCount} шт.)`);
        } else {
            this._visualizeSearchRadius(myToken, 5);
        }
    }

    static async _visualizeSearchRadius(token, radius) {
        const templateData = {
            t: "circle",
            user: game.user.id,
            distance: radius,
            direction: 0,
            x: token.center.x,
            y: token.center.y,
            fillColor: "#512da8",
            alpha: 0.1,
            borderColor: "#9575cd"
        };
        const doc = (await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]))[0];
        setTimeout(() => { if (doc) doc.delete(); }, 1500);
    }

    static initHooks() {
        Hooks.on("hotbarDrop", (bar, data, slot) => {
            if (data.type !== "Item") return true;
            ZSystemActions._createItemMacro(data, slot);
            return false;
        });

        // Регистрируем глобальный хелпер для макросов
        game.zsystem = game.zsystem || {};
        game.zsystem.rollItemMacro = (itemName) => {
            const speaker = ChatMessage.getSpeaker();
            let actor;
            if (speaker.token) actor = canvas.tokens.get(speaker.token).actor;
            if (!actor) actor = game.actors.get(speaker.actor);
            if (!actor) return ui.notifications.warn("Сначала выберите токен персонажа!");
            const item = actor.items.find(i => i.name === itemName);
            if (!item) return ui.notifications.warn(`У персонажа ${actor.name} нет предмета "${itemName}"`);
            return actor.performAttack(item.id);
        };
    }

    static async _createItemMacro(data, slot) {
        const item = await fromUuid(data.uuid);
        if (!item || item.type !== "weapon") {
            return ui.notifications.warn("На панель можно выносить только оружие.");
        }
        const command = `game.zsystem.rollItemMacro("${item.name}");`;
        let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
        if (!macro) {
            macro = await Macro.create({
                name: item.name,
                type: "script",
                img: item.img,
                command: command,
                flags: { "zsystem.itemMacro": true }
            });
        }
        game.user.assignHotbarMacro(macro, slot);
    }
}

// Регистрируем кнопки на панели сцены при загрузке модуля —
// getSceneControlButtons стреляет до ready, поэтому не в initHooks()
Hooks.on("getSceneControlButtons", (controls) => {
    const zControl = {
        name: "zsystem-actions",
        title: "Действия Выживания",
        layer: "tokens",
        icon: "fas fa-biohazard",
        visible: true,
        tools: [
            {
                name: "z-interact",
                title: "Взаимодействовать",
                icon: "fas fa-hand-paper",
                button: true,
                onClick: () => ZSystemActions.interact()
            },
            {
                name: "z-search",
                title: "Поиск (Восприятие)",
                icon: "fas fa-search",
                button: true,
                onClick: () => ZSystemActions.manualSearch()
            }
        ]
    };
    if (Array.isArray(controls)) controls.push(zControl);
    else controls["zsystem-actions"] = zControl;
});
