export class TravelManager {
  
  /**
   * Основной метод обработки перемещения на глобальной карте
   */
static async handleMovement(tokenDoc, changes) {
    const actor = tokenDoc.actor;
    if (!actor) return true; // Если это просто картинка без актора, пусть двигается

    // 1. ОПРЕДЕЛЯЕМ ТИП ПУТЕШЕСТВИЯ
    const isVehicle = actor.type === "vehicle";
    const isWalker = ["survivor", "npc"].includes(actor.type);

    if (!isVehicle && !isWalker) {
        ui.notifications.warn("Этот объект не может путешествовать по карте.");
        return false;
    }

    // 2. СЧИТАЕМ ДИСТАНЦИЮ
    const origin = { x: tokenDoc.x, y: tokenDoc.y };
    const dest = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
    const distance = canvas.grid.measureDistance(origin, dest);
    
    if (distance <= 0) return true;

    // 3. ПАРАМЕТРЫ (Скорость и Расход)
    let speed = 3; // Пешком по умолчанию (миль/час)
    let mpg = 0;   // Расход топлива
    let fuel = 0;
    
    if (isVehicle) {
        speed = Number(actor.system.attributes.speed.value) || 40;
        mpg = Number(actor.system.attributes.mpg.value) || 0;
        fuel = Number(actor.system.resources.fuel.value) || 0;
    } else {
        // Логика для пешехода
        // Можно модифицировать скорость от Атлетики, но 3 мили/ч - это стандарт
        // Если перегруз - скорость падает
        if (actor.hasStatusEffect("overburdened")) speed = 2;
    }

    // 4. РАСЧЕТ РАСХОДА (Только для машин)
    let finalCost = 0;
    if (isVehicle && mpg > 0) {
        const fuelCost = distance / mpg;
        finalCost = Math.round(fuelCost * 100) / 100;

        if (fuel < finalCost) {
            ui.notifications.error(`Недостаточно топлива! Нужно: ${finalCost}, Есть: ${fuel}`);
            return false;
        }
    }

    // 5. РАСЧЕТ ВРЕМЕНИ
    // Время = Дистанция / Скорость
    // Если скорость 0 (машина сломана), ставим минимум, чтобы не делить на ноль
    const safeSpeed = Math.max(0.1, speed);
    const timeHours = distance / safeSpeed;
    const timeSeconds = Math.floor(timeHours * 3600);

    // 6. ПРИМЕНЕНИЕ
    if (isVehicle && finalCost > 0) {
        const newFuel = Math.max(0, fuel - finalCost);
        await actor.update({ "system.resources.fuel.value": newFuel });
    }

    // Продвигаем время мира
    await game.time.advance(timeSeconds);

    // 7. ВИЗУАЛИЗАЦИЯ
    // Форматируем время красиво (чч:мм)
    const hours = Math.floor(timeHours);
    const minutes = Math.round((timeHours - hours) * 60);
    const timeString = `${hours}ч ${minutes > 0 ? minutes + "м" : ""}`;

    const icon = isVehicle ? "🚗" : "🚶";
    const fuelRow = isVehicle ? `<div><b>Топливо:</b> -${finalCost} (Ост: ${Math.round(fuel - finalCost)})</div>` : "";

    ChatMessage.create({
        content: `
            <div class="z-chat-card">
                <div class="z-card-header">${icon} Путешествие</div>
                <div><b>Дистанция:</b> ${Math.round(distance * 10) / 10} миль</div>
                <div><b>Скорость:</b> ${safeSpeed} м/ч</div>
                ${fuelRow}
                <div style="border-top:1px dashed #555; margin-top:5px; padding-top:2px;">
                    <b>Прошло времени:</b> ${timeString}
                </div>
            </div>
        `,
        speaker: ChatMessage.getSpeaker({ actor: actor })
    });

    // 8. СЛУЧАЙНАЯ ВСТРЕЧА
    // Для пешеходов шанс выше? Пока оставим одинаковый.
    const encounterChance = Math.min(50, Math.floor(distance / 10) * 10); 
    await this._checkEncounter(encounterChance);

    return true;
  }

  static async _checkEncounter(chance) {
      if (chance <= 0) return;
      
      const roll = new Roll("1d100");
      await roll.evaluate();

      if (roll.total <= chance) {
          // Встреча!
          // Звук тревоги
          AudioHelper.play({src: "icons/svg/sound.svg", volume: 0.8, autoplay: true}, false);
          
          ChatMessage.create({
              content: `
                <div class="z-chat-card" style="border-color:red;">
                    <div class="z-card-header" style="color:red;">⚠️ СЛУЧАЙНАЯ ВСТРЕЧА!</div>
                    <div>Шанс: ${chance}% (Roll: ${roll.total})</div>
                    <div style="margin-top:5px; font-style:italic;">Группа замечает что-то впереди...</div>
                    <button class="roll-encounter-table">Генерировать событие</button>
                </div>
              `,
              whisper: ChatMessage.getWhisperRecipients("GM") // Только ГМу
          });
      }
  }
}