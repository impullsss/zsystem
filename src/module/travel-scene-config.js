export function initTravelSceneConfigHooks() {
    Hooks.on("renderSceneConfig", (app, html, data) => {
        const $html = $(html);
        const scene = app.document;
        if (!scene) return;

        const isGlobal = scene.getFlag("zsystem", "isGlobalMap");
        const travelTerrain = scene.getFlag("zsystem", "travelTerrain") || "normal";
        const travelMovementMode = scene.getFlag("zsystem", "travelMovementMode") || "normal";
        const formGroup = buildTravelSceneConfigHtml({ isGlobal, travelTerrain, travelMovementMode });
        const gridInput = $html.find('select[name="grid.type"]');

        if (gridInput.length) {
            gridInput.closest(".form-group").after(formGroup);
        } else {
            $html.find('div[data-tab="grid"]').prepend(formGroup);
        }

        app.setPosition({ height: "auto" });
    });
}

function buildTravelSceneConfigHtml({ isGlobal, travelTerrain, travelMovementMode }) {
    return `
    <div class="form-group">
        <label>Глобальная карта (Travel Mode)</label>
        <div class="form-fields">
            <input type="checkbox" name="flags.zsystem.isGlobalMap" ${isGlobal ? "checked" : ""}/>
        </div>
        <p class="notes">Если включено, движение токенов на сцене считается путешествием: транспорт тратит топливо, пешие токены получают отчёт по времени.</p>
        <label>Местность путешествия</label>
        <div class="form-fields">
            <select name="flags.zsystem.travelTerrain">
                <option value="road" ${travelTerrain === "road" ? "selected" : ""}>Дорога</option>
                <option value="normal" ${travelTerrain === "normal" ? "selected" : ""}>Обычная местность</option>
                <option value="rough" ${travelTerrain === "rough" ? "selected" : ""}>Пересечённая местность</option>
                <option value="dangerous" ${travelTerrain === "dangerous" ? "selected" : ""}>Опасная зона</option>
            </select>
        </div>
        <label>Темп путешествия</label>
        <div class="form-fields">
            <select name="flags.zsystem.travelMovementMode">
                <option value="cautious" ${travelMovementMode === "cautious" ? "selected" : ""}>Осторожно</option>
                <option value="normal" ${travelMovementMode === "normal" ? "selected" : ""}>Обычно</option>
                <option value="forced" ${travelMovementMode === "forced" ? "selected" : ""}>Форсаж</option>
            </select>
        </div>
    </div>`;
}
