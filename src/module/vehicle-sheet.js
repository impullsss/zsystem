import { ZBaseActorSheet } from "./base-sheet.js";
import {
    VEHICLE_REPAIR_TOOLS,
    buildVehicleRepairPlan,
    resolveVehicleRepairAttempt
} from "./travel-rules.js";

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
    context.repairCandidates = getVehicleRepairCandidates(this.actor, context.passengers);
    context.repairTools = Object.values(VEHICLE_REPAIR_TOOLS);
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

      const repairInput = await promptRepairOptions({
          partsAvailable,
          suggested: preview.partsSpent,
          candidates: getVehicleRepairCandidates(this.actor, getVehiclePassengers(system)),
          tools: Object.values(VEHICLE_REPAIR_TOOLS)
      });
      if (!repairInput?.parts) return;

      const repairer = repairInput.repairerId ? game.actors.get(repairInput.repairerId) : null;
      const mechanicSkill = Number(repairer?.system?.skills?.mechanical?.value) || 0;
      const roll = await new Roll("1d100").evaluate();
      const plan = resolveVehicleRepairAttempt({
          hp: system?.resources?.hp?.value,
          hpMax: system?.resources?.hp?.max,
          broken: system?.broken,
          partsAvailable,
          partsToSpend: repairInput.parts,
          repairPerPart: 5,
          mechanicSkill,
          tools: repairInput.tools,
          roll: roll.total
      });

      if (plan.partsSpent <= 0) return;
      await spendVehicleRepairParts(this.actor, plan.partsSpent);
      await this.actor.update({
          "system.resources.hp.value": plan.hpAfter,
          "system.broken": plan.breaksVehicle ? true : plan.clearsBroken ? false : Boolean(system?.broken)
      });

      await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: buildVehicleRepairChatHtml({ vehicle: this.actor, repairer, plan })
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

function getVehicleRepairCandidates(vehicle, passengers = []) {
    const actors = [...passengers];
    const assigned = game.user?.character;
    if (assigned && !actors.some((actor) => actor.id === assigned.id)) actors.unshift(assigned);
    if (!actors.length) actors.push(vehicle);

    return actors
        .filter(Boolean)
        .map((actor) => ({
            id: actor.id,
            name: actor.name,
            skill: Number(actor.system?.skills?.mechanical?.value) || 0
        }));
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

function promptRepairOptions({ partsAvailable, suggested, candidates = [], tools = [] }) {
    return new Promise(resolve => {
        const candidateOptions = candidates.map((actor) =>
            `<option value="${actor.id}">${actor.name} - Механика ${actor.skill}</option>`
        ).join("");
        const toolOptions = tools.map((tool) =>
            `<option value="${tool.id}" ${tool.id === "basic" ? "selected" : ""}>${tool.label} (${tool.modifier >= 0 ? "+" : ""}${tool.modifier})</option>`
        ).join("");

        new Dialog({
            title: "Ремонт транспорта",
            content: `
                <p>Деталей в багажнике: <b>${partsAvailable}</b></p>
                <div class="form-group">
                    <label>Кто чинит</label>
                    <select name="repairer">${candidateOptions}</select>
                </div>
                <div class="form-group">
                    <label>Инструменты</label>
                    <select name="tools">${toolOptions}</select>
                </div>
                <p>1 деталь обычно восстанавливает 5 прочности. Бросок Механики решает качество ремонта.</p>
                <input type="number" name="repair-parts" value="${Math.max(1, suggested)}" min="1" max="${partsAvailable}"/>
            `,
            buttons: {
                repair: {
                    label: "Ремонт",
                    callback: html => {
                        const value = Number(html.find('[name="repair-parts"]').val()) || 0;
                        resolve({
                            parts: Math.min(partsAvailable, Math.max(0, Math.floor(value))),
                            repairerId: html.find('[name="repairer"]').val() || "",
                            tools: html.find('[name="tools"]').val() || "basic"
                        });
                    }
                },
                cancel: {
                    label: "Отмена",
                    callback: () => resolve(null)
                }
            },
            default: "repair",
            close: () => resolve(null)
        }).render(true);
    });
}

function buildVehicleRepairChatHtml({ vehicle, repairer, plan }) {
    return `
        <div class="z-chat-card z-travel-card">
            <div class="z-card-header z-travel-title">Ремонт транспорта</div>
            <div class="z-travel-row"><span>Транспорт</span><b>${vehicle.name}</b></div>
            <div class="z-travel-row"><span>Механик</span><b>${repairer?.name || "без механика"}</b></div>
            <div class="z-travel-row"><span>Инструменты</span><b>${plan.check.tools.label}</b></div>
            <div class="z-travel-row"><span>Проверка</span><b>${plan.roll} vs DC ${plan.check.dc} (${formatRepairResult(plan.resultType)})</b></div>
            <div class="z-travel-row"><span>Детали</span><b>-${plan.partsSpent}</b></div>
            <div class="z-travel-row"><span>Прочность</span><b>${plan.hpAfter}${plan.repairedHp ? ` (+${plan.repairedHp})` : ""}</b></div>
            ${plan.breaksVehicle ? `<div class="z-travel-event z-travel-event--danger"><b>Крит. провал: транспорт снова неисправен.</b></div>` : ""}
            ${plan.clearsBroken ? `<div class="z-travel-event z-travel-event--good"><b>Поломка устранена.</b></div>` : ""}
        </div>`;
}

function formatRepairResult(resultType) {
    if (resultType === "crit-success") return "крит. успех";
    if (resultType === "success") return "успех";
    if (resultType === "crit-fail") return "крит. провал";
    if (resultType === "blocked") return "невозможно";
    return "провал";
}
