export class ZBaseActorSheet extends ActorSheet {
  
  /**
   * Универсальный метод обработки сброса предметов.
   * Удаляет предмет из источника при перемещении между разными акторами.
   */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    
    // 1. Стандартное создание предмета (копия)
    const items = await super._onDropItem(event, data);
    
    // super._onDropItem может вернуть один предмет или массив. Нормализуем.
    const createdItems = Array.isArray(items) ? items : [items];
    const createdItem = createdItems[0]; // Берем первый (обычно он один)

    // Если создание не удалось или нет исходных данных - выходим
    if (!createdItem || !data.uuid) return items;

    // 2. Получаем исходный предмет по UUID
    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return items;

    const sourceActor = sourceItem.actor;
    
    // 3. Логика ПЕРЕМЕЩЕНИЯ (Move instead of Copy)
    // Если источник существует И это ДРУГОЙ актор (не перетаскивание внутри одного инвентаря)
    if (sourceActor && sourceActor.uuid !== this.actor.uuid) {
        
        // Проверка прав: Мы можем удалить предмет у источника, только если мы им владеем.
        // Для контейнеров (Loot) и своих персонажей это обычно true.
        if (sourceActor.isOwner) {
            await sourceItem.delete();
            // Опционально: Визуальное уведомление или звук
        }
    }

    return items;
  }
}