import {
    TRAVEL_ACTOR_TYPES,
    TRAVEL_MAINTENANCE_MODES
} from "./travel-rules.js";

export function buildTravelChatHtml(plan, event = null) {
    if (!plan?.relevant) return "";
    const typeLabel = plan.actorType === TRAVEL_ACTOR_TYPES.vehicle ? "Транспорт" : "Пешком";
    const fuelRow = plan.actorType === TRAVEL_ACTOR_TYPES.vehicle
        ? `<div class="z-travel-row"><span>Топливо</span><b>-${plan.fuelCost} / осталось ${plan.fuelAfter}</b></div>`
        : "";
    const overloadRow = plan.overload?.overloaded
        ? `<div class="z-travel-row z-travel-row--bad"><span>Перегруз</span><b>+${Math.round(plan.overload.ratio * 100)}% груза</b></div>`
        : "";
    const terrainRow = plan.terrain
        ? `<div class="z-travel-row"><span>Местность</span><b>${plan.terrain.label}</b></div>`
        : "";
    const movementRow = plan.movementMode
        ? `<div class="z-travel-row"><span>Темп</span><b>${plan.movementMode.label}</b></div>`
        : "";

    return `
        <div class="z-chat-card z-travel-card">
            <div class="z-card-header z-travel-title">Путешествие</div>
            <div class="z-travel-row"><span>Режим</span><b>${typeLabel}</b></div>
            ${terrainRow}
            ${movementRow}
            <div class="z-travel-row"><span>Дистанция</span><b>${Math.round(plan.distance)} км</b></div>
            ${fuelRow}
            ${overloadRow}
            <div class="z-travel-row"><span>В пути</span><b>${plan.timeLabel}</b></div>
            ${buildTravelEventHtml(event)}
            ${buildWalkerPressureHtml(plan.walkerPressure)}
            ${buildWalkerSupplyHtml(plan.walkerSupplies)}
            ${buildVehicleWearHtml(plan.vehicleWear)}
        </div>`;
}

export function buildTravelEventHtml(event) {
    if (!event) return "";
    return `
        <div class="z-travel-event z-travel-event--${event.tone}">
            <span>Событие дороги</span>
            <b>${event.label}</b>
            <small>Шанс: ${event.chance}%</small>
        </div>`;
}

export function buildVehicleWearHtml(wear) {
    if (!wear) return "";
    const wearRow = wear.wearAmount > 0
        ? `<div class="z-travel-row z-travel-row--bad"><span>Износ</span><b>-${wear.wearAmount} прочн. / осталось ${wear.hpAfter}</b></div>`
        : `<div class="z-travel-row"><span>Износ</span><b>нет</b></div>`;
    const breakdownLabel = wear.broken
        ? "Поломка: транспорт остановлен"
        : "Риск поломки сработал";
    const breakdownRow = wear.breakdown
        ? `<div class="z-travel-event z-travel-event--danger"><span>Транспорт</span><b>${breakdownLabel}</b><small>Шанс: ${wear.breakdownChance}%</small></div>`
        : "";

    return `
        <div class="z-travel-event z-travel-event--warning">
            <span>Состояние транспорта</span>
            <b>${wear.mode === TRAVEL_MAINTENANCE_MODES.auto ? "Авто-износ" : "Отчёт"}</b>
            <small>Шанс износа: ${wear.wearChance}% · шанс поломки: ${wear.breakdownChance}%</small>
        </div>
        ${wearRow}
        ${breakdownRow}`;
}

export function buildWalkerPressureHtml(pressure) {
    if (!pressure) return "";
    return `
        <div class="z-travel-event z-travel-event--warning">
            <span>Пеший переход</span>
            <b>${pressure.risk}</b>
            <small>Усталость: ${pressure.fatigueChance}% · вода: ~${pressure.waterUnits} · еда: ~${pressure.foodUnits} · отдых: ~${pressure.restHours}ч</small>
        </div>`;
}

export function buildWalkerSupplyHtml(supplies) {
    if (!supplies) return "";
    const tone = supplies.food.covered && supplies.water.covered ? "good" : "warning";
    const fatigue = supplies.applied
        ? supplies.fatigueTriggered ? "усталость применена" : "усталость не сработала"
        : "только отчёт";
    return `
        <div class="z-travel-event z-travel-event--${tone}">
            <span>Припасы</span>
            <b>Еда -${supplies.food.spent}/${supplies.food.required} · Вода -${supplies.water.spent}/${supplies.water.required}</b>
            <small>Дефицит: еда ${supplies.food.shortage}, вода ${supplies.water.shortage} · шанс усталости ${supplies.fatigueChance}% · ${fatigue}</small>
        </div>`;
}
