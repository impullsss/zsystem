import { ZBaseActorSheet } from "./base-sheet.js";

export class ZVehicleSheet extends ZBaseActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "vehicle"],
      template: "systems/zsystem/sheets/vehicle-sheet.hbs",
      width: 700,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }],
      dragDrop: [
          { dragSelector: ".item-list .item", dropSelector: null },
          { dragSelector: ".passenger-card", dropSelector: null } // Разрешаем таскать пассажиров
      ]
    });
  }

  async getData() {
    const context = super.getData();
    context.system = this.actor.system;
    
    // ПАССАЖИРЫ
    // Мы храним массив ID пассажиров в system.passengers
    // Но нам нужны полные данные акторов для отрисовки
    context.passengers = [];
    const pIds = context.system.passengers || [];
    
    for (let id of pIds) {
        // Ищем актора. Если он "в машине", его токен может быть удален со сцены, 
        // поэтому ищем в game.actors
        const a = game.actors.get(id);
        if (a) context.passengers.push(a);
    }

    // БАГАЖНИК (ГРУЗ)
    // Считаем вес
    let totalWeight = 0;
    this.actor.items.forEach(i => {
        totalWeight += (i.system.weight || 0) * (i.system.quantity || 1);
    });
    context.currentCargo = Math.round(totalWeight * 100) / 100;
    context.cargoPercent = Math.min(100, (context.currentCargo / (context.system.cargo.max || 1)) * 100);

    return context;
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    
    // 1. ЕСЛИ БРОСИЛИ АКТОРА (ПАССАЖИРА)
    if (data.type === "Actor") {
        const actor = await Actor.fromDropData(data);
        if (!actor) return;
        if (actor.type === "vehicle" || actor.type === "shelter") return; // Машина в машину не лезет

        const currentPassengers = this.actor.system.passengers || [];
        
        // Если актора еще нет в машине
        if (!currentPassengers.includes(actor.id)) {
            const newPassengers = [...currentPassengers, actor.id];
            await this.actor.update({"system.passengers": newPassengers});
            
            // ОПЦИОНАЛЬНО: Удалить токен со сцены (Посадка в машину)
            // if (actor.token) await actor.token.delete();
            // Пока просто добавим в список.
            ui.notifications.info(`${actor.name} сел в машину.`);
        }
        return;
    }

    // 2. ЕСЛИ БРОСИЛИ ПРЕДМЕТ (В БАГАЖНИК) -> Используем нашу новую логику
    return this._onDropItem(event, data);
  }

  activateListeners(html) {
      super.activateListeners(html);
      if (!this.isEditable) return;

      // Удаление пассажира (Высадка)
      html.find(".remove-passenger").click(async ev => {
          const id = ev.currentTarget.dataset.id;
          const current = this.actor.system.passengers || [];
          const newVal = current.filter(pid => pid !== id);
          await this.actor.update({"system.passengers": newVal});
          ui.notifications.info("Пассажир высажен (Токен нужно создать вручную).");
      });

      // Открытие листа пассажира
      html.find(".open-passenger").click(ev => {
          const id = ev.currentTarget.dataset.id;
          const a = game.actors.get(id);
          if (a) a.sheet.render(true);
      });
      
      // Стандартное управление предметами
      html.find(".item-edit").click(ev => {
          const li = $(ev.currentTarget).parents(".item");
          const item = this.actor.items.get(li.data("itemId"));
          item.sheet.render(true);
      });
      html.find(".item-delete").click(async ev => {
          const li = $(ev.currentTarget).parents(".item");
          const item = this.actor.items.get(li.data("itemId"));
          await item.delete();
      });
  }
}