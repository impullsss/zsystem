import { NoiseManager } from "./noise.js";

export class ZHarvestSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "harvest"],
      template: "systems/zsystem/sheets/harvest-sheet.hbs",
      width: 550,
      height: 800,
      tabs: [
        {
          navSelector: ".gm-tabs",
          contentSelector: ".sheet-body",
          initial: "actions",
        },
      ],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }],
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system;
    context.isGM = game.user.isGM;
    const flags = this.actor.flags.zsystem || {};

    context.isHarvested = flags.isHarvested || false;
    context.isBroken = flags.isBroken || false;
    context.description = flags.description || "";

    let actions = flags.actions || [];
    if (!Array.isArray(actions) || actions.length === 0) {
      actions = [
        {
          id: foundry.utils.randomID(),
          name: "Осмотреть / Вскрыть",
          skill: "survival",
          dc: 10,
          reqTool: "",
          toolRequired: false,
          bonusTool: "",
          bonusMod: 0,
        },
      ];
    }
    context.actions = actions;

    context.outcomes = foundry.utils.mergeObject(
      {
        critSuccess: {
          text: "Идеально!",
          type: "none",
          value: 0,
          limb: "torso",
        },
        success: { text: "Успех!", type: "none", value: 0, limb: "torso" },
        fail: { text: "Провал.", type: "noise", value: 5, limb: "torso" },
        critFail: {
          text: "Катастрофа!",
          type: "damage",
          value: 5,
          limb: "torso",
        },
      },
      flags.outcomes || {}
    );

    this._prepareItems(context);

    context.skillsList = {
      survival: "Выживание",
      mechanical: "Механика",
      science: "Наука",
      medical: "Медицина",
      lockpick: "Взлом",
      athletics: "Атлетика",
      melee: "Ближний бой",
      stealth: "Скрытность",
    };

    context.outcomeTypes = { none: "-", noise: "Шум (+)", damage: "Урон (HP)" };
    context.limbOptions = {
      torso: "Торс",
      head: "Голова",
      lArm: "Л.Рука",
      rArm: "П.Рука",
      lLeg: "Л.Нога",
      rLeg: "П.Нога",
    };

    context.canHarvest = true;
    context.distanceMsg = "";
    if (!context.isGM) {
      const token = canvas.tokens.controlled[0];
      if (!token) {
        context.canHarvest = false;
        context.distanceMsg = "ВЫБЕРИТЕ ТОКЕН";
      } else {
        const target = this.actor.getActiveTokens()[0];
        if (target) {
          const dist = canvas.grid.measureDistance(token, target);
          if (dist > 1.5) {
            context.canHarvest = false;
            context.distanceMsg = "ПОДОЙДИТЕ БЛИЖЕ";
          }
        } else {
          context.canHarvest = false;
          context.distanceMsg = "ОШИБКА ЦЕЛИ";
        }
      }
    }
    return context;
  }

  _prepareItems(context) {
    context.inventory = this.actor.items.map((i) => i);
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".tool-drop").on("drop", async (ev) => {
      ev.preventDefault();
      try {
        const data = JSON.parse(
          ev.originalEvent.dataTransfer.getData("text/plain")
        );
        if (data.type !== "Item") return;
        const item = await Item.fromDropData(data);
        if (item) {
          $(ev.target).val(item.name).trigger("change");
        }
      } catch (e) {
        console.error(e);
      }
    });

    if (!this.isEditable) return;

    html.find(".add-action").click(async () => {
      const actions = this.actor.getFlag("zsystem", "actions") || [];
      actions.push({
        id: foundry.utils.randomID(),
        name: "Новый метод",
        skill: "survival",
        dc: 10,
      });
      await this.actor.setFlag("zsystem", "actions", actions);
    });

    html.find(".delete-action").click(async (ev) => {
      const idx = ev.currentTarget.dataset.idx;
      const actions = duplicate(this.actor.getFlag("zsystem", "actions"));
      actions.splice(idx, 1);
      await this.actor.setFlag("zsystem", "actions", actions);
    });

    html.find(".action-input").change(async (ev) => {
      const idx = ev.target.closest(".action-config").dataset.idx;
      const field = ev.target.dataset.field;
      const val =
        ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
      const actions = duplicate(this.actor.getFlag("zsystem", "actions") || []);
      if (!actions[idx]) return;
      actions[idx][field] = val;
      await this.actor.setFlag("zsystem", "actions", actions);
    });

    html.find(".outcome-input").change(async (ev) => {
      const field = ev.target.dataset.field;
      await this.actor.update({ [`flags.zsystem.${field}`]: ev.target.value });
    });

    html.find(".harvest-desc-input").change(async (ev) => {
      await this.actor.setFlag("zsystem", "description", ev.target.value);
    });

    html.find(".reset-btn").click(async () => {
      await this.actor.setFlag("zsystem", "isHarvested", false);
      await this.actor.setFlag("zsystem", "isBroken", false);
      await this.actor.update({ img: "icons/svg/padlock.svg" });
    });

    html.find(".harvest-action-btn").click(this._onHarvestAttempt.bind(this));

    html.find(".item-take").click(async (ev) => {
      ev.preventDefault();
      const li = $(ev.currentTarget).closest("[data-item-id]");
      const itemId = li.data("itemId");
      const item = this.actor.items.get(itemId);
      const tokens = canvas.tokens.controlled;
      if (tokens.length === 0)
        return ui.notifications.warn("Выберите, кто забирает!");
      const taker = tokens[0].actor;
      if (item && taker) {
        await taker.createEmbeddedDocuments("Item", [item.toObject()]);
        await item.delete();
        ui.notifications.info(`${taker.name} забрал ${item.name}`);
      }
    });

    html
      .find(".item-create")
      .click(
        async () =>
          await Item.create(
            { name: "Loot", type: "misc" },
            { parent: this.actor }
          )
      );
    html.find(".item-delete").click(async (ev) => {
      const li = $(ev.currentTarget).closest("[data-item-id]");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) await item.delete();
    });
    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).closest("[data-item-id]");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });
  }

  async _onHarvestAttempt(event) {
      event.preventDefault();
      const idx = event.currentTarget.dataset.idx;
      // Безопасное чтение действий
      const actions = this.actor.getFlag("zsystem", "actions") || []; 
      const action = actions[idx];

      if (!action) return ui.notifications.error("Действие не найдено. Попробуйте обновить настройки.");

      const tokens = canvas.tokens.controlled;
      if (!tokens.length) return ui.notifications.warn("Выберите токен!");
      const character = tokens[0].actor;
      
      if (character.id === this.actor.id || ["harvest_spot", "container"].includes(character.type)) {
          return ui.notifications.warn("Этот объект не может действовать.");
      }

      // 1. Проверка Инструмента
      if (action.toolRequired && action.reqTool) {
          const hasTool = character.items.find(i => i.name.toLowerCase().includes(action.reqTool.toLowerCase()));
          if (!hasTool) return ui.notifications.error(`Требуется: ${action.reqTool}`);
      }

      // 2. Шанс
      const skillVal = character.system.skills[action.skill]?.value || 0;
      let chance = skillVal - (Number(action.dc) || 0);
      let bonusText = "";

      // Бонусный инструмент
      if (action.bonusTool && action.bonusMod) {
          const hasBonusItem = character.items.find(i => i.name.toLowerCase().includes(action.bonusTool.toLowerCase()));
          if (hasBonusItem) {
              const bVal = Number(action.bonusMod);
              chance += bVal;
              bonusText = ` (+${bVal}% ${action.bonusTool})`;
          }
      }

      chance = Math.max(5, Math.min(95, chance));

      // 3. Бросок
      const roll = new Roll("1d100");
      await roll.evaluate();
      
      // === ВАЖНОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ===
      // Мы задаем дефолтные значения прямо здесь, чтобы логика работала, даже если ГМ ничего не настраивал
      const defaultOutcomes = {
          critSuccess: { text: "Идеально!", type: "none", value: 0, limb: "torso" },
          success: { text: "Успех!", type: "none", value: 0, limb: "torso" },
          fail: { text: "Провал.", type: "noise", value: 5, limb: "torso" },
          critFail: { text: "Катастрофа!", type: "damage", value: 5, limb: "torso" }
      };
      
      // Сливаем сохраненные флаги поверх дефолтных
      const savedOutcomes = this.actor.flags.zsystem?.outcomes || {};
      const outcomes = foundry.utils.mergeObject(defaultOutcomes, savedOutcomes);
      
      let resultKey = "";
      if (roll.total <= 5) resultKey = "critSuccess";
      else if (roll.total <= chance) resultKey = "success";
      else if (roll.total >= 96) resultKey = "critFail";
      else resultKey = "fail";

      // Фолбек для старых данных (на всякий случай)
      if (resultKey === "critSuccess" && !outcomes.critSuccess) resultKey = "success";

      const outcome = outcomes[resultKey] || {};
      const flavor = outcome.text || "Результат...";

      // --- ПРИМЕНЕНИЕ ЭФФЕКТОВ (ШУМ / УРОН) ---
      let effectMsg = "";
      const val = Number(outcome.value) || 0;
      let noiseToAdd = 0; // Накопитель для флага

      if (val > 0) {
          // A) ШУМ
          if (outcome.type === 'noise') {
              noiseToAdd = val;
              effectMsg = `<div style="color:orange; font-weight:bold; margin-top:5px; border-top:1px dashed #555; padding-top:2px;">
                             <i class="fas fa-volume-up"></i> Шум +${val}
                           </div>`;
          } 
          // B) УРОН
          else if (outcome.type === 'damage') {
              const limb = outcome.limb || "torso";
              // Получаем название конечности (либо из опций листа, либо заглушку)
              const limbNames = { torso: "Торс", head: "Голова", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога" };
              const limbName = limbNames[limb] || limb;
              
              await character.applyDamage(val, "blunt", limb);
              
              effectMsg = `<div style="color:#d32f2f; font-weight:bold; margin-top:5px; border-top:1px dashed #555; padding-top:2px;">
                             <i class="fas fa-tint"></i> Урон ${val} (${limbName})
                           </div>`;
          }
      }

      // Открытие / Поломка
      if (resultKey === "critSuccess" || resultKey === "success") {
          await this._openContainer();
      } else if (resultKey === "critFail") {
          await this.actor.setFlag("zsystem", "isBroken", true);
          await this.actor.update({img: "icons/svg/hazard.svg"});
      }

      // CSS FIX: Ищем "success" в lowercase
      const statusClass = (resultKey.toLowerCase().includes("success")) ? "success" : "failure";
      const labels = { 
          critSuccess: "КРИТ. УСПЕХ", success: "УСПЕХ", fail: "ПРОВАЛ", critFail: "КРИТ. ПРОВАЛ" 
      };

      let content = `
        <div class="z-chat-card">
          <div class="z-card-header">${character.name}: ${action.name}</div>
          <div class="z-card-sub">Навык: ${action.skill} (${skillVal}) ${bonusText} - DC ${action.dc} = <b>${chance}%</b></div>
          <div class="z-slot-machine">
             <div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${roll.total}</div></div>
          </div>
          <div class="z-result-label ${statusClass}">${labels[resultKey]}</div>
          <div style="font-size:0.9em; margin-top:5px; padding:5px; background:rgba(0,0,0,0.2); border-radius:3px; color:#fff;">
            "${flavor}"
            ${effectMsg}
          </div>
        </div>`;
      
      // Отправляем сообщение С ФЛАГАМИ для ГМа (Шум)
      ChatMessage.create({ 
          speaker: ChatMessage.getSpeaker({actor: character}), 
          content: content,
          flags: {
              zsystem: {
                  noiseAdd: noiseToAdd
              }
          }
      });
  }

  async _openContainer() {
    await this.actor.setFlag("zsystem", "isHarvested", true);
    await this.actor.update({ img: "icons/svg/chest.svg" });
  }
}
