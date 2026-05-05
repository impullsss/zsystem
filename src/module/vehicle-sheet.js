import { ZBaseActorSheet } from "./base-sheet.js";
import { buildVehicleRepairPlan } from "./travel-rules.js";

export class ZVehicleSheet extends ZBaseActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "vehicle"],
      template: "systems/zsystem/sheets/vehicle-sheet.hbs",
      width: 720,
      height: 620,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }],
      dragDrop: [
          { dragSelector: ".item-list .item", dropSelector: null },
          { dragSelector: ".passenger-card", dropSelector: null }
      ]
    });
  }

  async getData() {
    const context = super.getData();
    context.system = this.actor.system;
    context.passengers = getVehiclePassengers(context.system);
    context.currentCargo = getVehicleCargoWeight(this.actor);

    const cargoMax = Number(context.system?.cargo?.max) || 1;
    context.cargoPercent = Math.min(100, Math.round((context.currentCargo / cargoMax) * 100));
    context.cargoOverloaded = context.currentCargo > cargoMax;
    context.passengerCount = context.passengers.length;
    context.travelRange = getVehicleTravelRange(context.system);
    context.repairPartsAvailable = getVehicleRepairParts(this.actor);
    context.repairPerPart = 5;
    context.repairPreview = buildVehicleRepairPlan({
        hp: context.system?.resources?.hp?.value,
        hpMax: context.system?.resources?.hp?.max,
        broken: context.system?.broken,
        partsAvailable: context.repairPartsAvailable,
        partsToSpend: context.repairPartsAvailable,
        repairPerPart: context.repairPerPart
    });

    return context;
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    
    if (data.type === "Actor") {
        const actor = await Actor.fromDropData(data);
        if (!actor || ["vehicle", "shelter"].includes(actor.type)) return;

        const currentPassengers = this.actor.system.passengers || [];
        if (!currentPassengers.includes(actor.id)) {
            await this.actor.update({ "system.passengers": [...currentPassengers, actor.id] });
            ui.notifications.info(`${actor.name} сел в транспорт.`);
        }
        return;
    }

    return this._onDropItem(event, data);
  }

  activateListeners(html) {
      super.activateListeners(html);
      if (!this.isEditable) return;

      html.find(".remove-passenger").click(async ev => {
          const id = ev.currentTarget.dataset.id;
          const current = this.actor.system.passengers || [];
          await this.actor.update({ "system.passengers": current.filter(pid => pid !== id) });
          ui.notifications.info("Пассажир высажен. Токен на сцену пока нужно вернуть вручную.");
      });

      html.find(".open-passenger").click(ev => {
          const actor = game.actors.get(ev.currentTarget.dataset.id);
          if (actor) actor.sheet.render(true);
      });

      html.find(".repair-vehicle").click(async () => {
          await this._repairVehicle();
      });
      
      html.find(".item-edit").click(ev => {
          const li = $(ev.currentTarget).parents(".item");
          const item = this.actor.items.get(li.data("itemId"));
          item?.sheet.render(true);
      });

      html.find(".item-delete").click(async ev => {
          const li = $(ev.currentTarget).parents(".item");
          const item = this.actor.items.get(li.data("itemId"));
          await item?.delete();
      });
  }

  async _repairVehicle() {
      const partsAvailable = getVehicleRepairParts(this.actor);
      const system = this.actor.system;
      const preview = buildVehicleRepairPlan({
          hp: system?.resources?.hp?.value,
          hpMax: system?.resources?.hp?.max,
          broken: system?.broken,
          partsAvailable,
          partsToSpend: partsAvailable,
          repairPerPart: 5
      });

      if (!preview.canRepair) {
          ui.notifications.warn("Нечего ремонтировать или нет деталей в багажнике.");
          return;
      }

      const requested = await promptRepairParts({ partsAvailable, suggested: preview.partsSpent });
      if (!requested) return;

      const plan = buildVehicleRepairPlan({
          hp: system?.resources?.hp?.value,
          hpMax: system?.resources?.hp?.max,
          broken: system?.broken,
          partsAvailable,
          partsToSpend: requested,
          repairPerPart: 5
      });

      if (plan.partsSpent <= 0) return;
      await spendVehicleRepairParts(this.actor, plan.partsSpent);
      await this.actor.update({
          "system.resources.hp.value": plan.hpAfter,
          "system.broken": plan.clearsBroken ? false : Boolean(system?.broken)
      });

      ui.notifications.info(`Ремонт: -${plan.partsSpent} деталей, +${plan.repairedHp} прочности.`);
  }
}

function getVehiclePassengers(system) {
    const passengerIds = system?.passengers || [];
    return passengerIds
        .map((id) => game.actors.get(id))
        .filter(Boolean);
}

function getVehicleCargoWeight(actor) {
    let totalWeight = 0;
    actor.items.forEach(item => {
        totalWeight += (Number(item.system?.weight) || 0) * (Number(item.system?.quantity) || 1);
    });
    return Math.round(totalWeight * 100) / 100;
}

function getVehicleTravelRange(system) {
    const fuel = Number(system?.resources?.fuel?.value) || 0;
    const mpg = Number(system?.attributes?.mpg?.value) || 0;
    return Math.round(fuel * mpg);
}

function getVehicleRepairParts(actor) {
    let total = 0;
    actor.items.forEach(item => {
        if (!isRepairPartItem(item)) return;
        total += Math.max(0, Number(item.system?.quantity) || 1);
    });
    return total;
}

function isRepairPartItem(item) {
    const category = String(item.system?.category || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();
    return item.type === "materials"
        || category === "parts"
        || category === "repair"
        || name.includes("запчаст")
        || name.includes("детал")
        || name.includes("parts");
}

async function spendVehicleRepairParts(actor, amount) {
    let remaining = Math.max(0, Math.floor(Number(amount) || 0));
    for (const item of actor.items) {
        if (remaining <= 0) break;
        if (!isRepairPartItem(item)) continue;
        const quantity = Math.max(0, Number(item.system?.quantity) || 1);
        const spent = Math.min(quantity, remaining);
        remaining -= spent;
        if (quantity - spent <= 0) await item.delete();
        else await item.update({ "system.quantity": quantity - spent });
    }
}

function promptRepairParts({ partsAvailable, suggested }) {
    return new Promise(resolve => {
        new Dialog({
            title: "Ремонт транспорта",
            content: `
                <p>Деталей в багажнике: <b>${partsAvailable}</b></p>
                <p>1 деталь восстанавливает 5 прочности. Если транспорт неисправен, минимум 1 деталь снимает поломку.</p>
                <input type="number" name="repair-parts" value="${Math.max(1, suggested)}" min="1" max="${partsAvailable}"/>
            `,
            buttons: {
                repair: {
                    label: "Ремонт",
                    callback: html => {
                        const value = Number(html.find('[name="repair-parts"]').val()) || 0;
                        resolve(Math.min(partsAvailable, Math.max(0, Math.floor(value))));
                    }
                },
                cancel: {
                    label: "Отмена",
                    callback: () => resolve(0)
                }
            },
            default: "repair",
            close: () => resolve(0)
        }).render(true);
    });
}
