export class TravelManager {
  
  static async handleMovement(tokenDoc, changes) {
    const actor = tokenDoc.actor;
    if (!actor) return true; 

    // 1. Определяем тип
    const isVehicle = actor.type === "vehicle";
    // Пешеходы тоже могут ходить по глобалке, но без топлива
    const isWalker = ["survivor", "npc"].includes(actor.type);

    if (!isVehicle && !isWalker) return true;

    // 2. Считаем дистанцию (учитывает масштаб сцены!)
    const origin = { x: tokenDoc.x, y: tokenDoc.y };
    const dest = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
    const distance = canvas.grid.measureDistance(origin, dest);
    
    if (distance <= 0) return true;

    // 3. Параметры Транспорта
    let mpg = 0;
    let fuel = 0;
    let speed = 40; // Скорость для расчета времени

    if (isVehicle) {
        speed = Number(actor.system.attributes.speed.value) || 40;
        mpg = Number(actor.system.attributes.mpg.value) || 0;
        fuel = Number(actor.system.resources.fuel.value) || 0;
    } else {
        // Пешеход
        speed = 3; 
    }

    // 4. РАСЧЕТ РАСХОДА (Только для машин)
    let finalCost = 0;
    if (isVehicle && mpg > 0) {
        // Дистанция (км) / Расход (км на литр/галлон)
        const fuelCost = distance / mpg;
        finalCost = Math.round(fuelCost * 100) / 100;

        // БЛОКИРУЕМ ДВИЖЕНИЕ, ЕСЛИ НЕТ ТОПЛИВА
        if (fuel < finalCost) {
            ui.notifications.error(`Недостаточно топлива! Дистанция: ${Math.round(distance)}, Расход: ${finalCost}, Есть: ${fuel}`);
            return false; // <--- ВАЖНО: Возвращаем false, чтобы токен не сдвинулся
        }
    }

    // 5. Списание
    if (isVehicle && finalCost > 0) {
        const newFuel = Math.max(0, fuel - finalCost);
        // await внутри preUpdate допустим для данных актора, но не токена
        await actor.update({ "system.resources.fuel.value": newFuel });
    }

    // 6. Визуализация в чат
    const timeHours = distance / Math.max(0.1, speed);
    const timeStr = `${Math.floor(timeHours)}ч ${Math.round((timeHours % 1)*60)}м`;
    
    const fuelMsg = isVehicle ? `<div>⛽ Топливо: -${finalCost} (Ост: ${Math.round(fuel - finalCost)})</div>` : "";

    ChatMessage.create({
        content: `
            <div class="z-chat-card" style="border-color: #fbc02d;">
                <div class="z-card-header" style="color: #fbc02d;">🗺️ Путешествие</div>
                <div><b>Дистанция:</b> ${Math.round(distance)} км</div>
                ${fuelMsg}
                <div style="font-size:0.8em; margin-top:5px; border-top:1px dashed #555;">В пути: ${timeStr}</div>
            </div>
        `,
        speaker: ChatMessage.getSpeaker({ actor: actor })
    });

    return true; // Разрешаем движение
  }
}