import { ZBaseActorSheet } from "./base-sheet.js";
import { NoiseManager } from "./noise.js";

export class ZHarvestSheet extends ZBaseActorSheet { // <--- Наследование
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
      dragDrop: [{ dragSelector: ".light-item", dropSelector: null }],
    });
  }

  // === ВСПОМОГАТЕЛЬНЫЙ МЕТОД ДЛЯ ПОЛУЧЕНИЯ ДЕЙСТВИЙ ===
  // Гарантирует, что мы всегда получаем массив, даже если в базе пусто
  _getActions() {
    const flags = this.actor.flags.zsystem?.actions;

    // Если флагов нет или массив пустой — возвращаем дефолт, как в getData
    if (!flags || !Array.isArray(flags) || flags.length === 0) {
      return [
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
    // Возвращаем копию, чтобы можно было мутировать
    return foundry.utils.deepClone(flags);
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system;
    context.isGM = game.user.isGM;
    const flags = this.actor.flags.zsystem || {};

    context.isHarvested = flags.isHarvested || false;
    context.isBroken = flags.isBroken || false;
    context.description = flags.description || "";

    // Используем тот же метод, чтобы данные совпадали
    context.actions = this._getActions();

    // === ИТОГИ ===
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

    // Валидация дистанции
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

    // Drag & Drop инструмента
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

    // --- Actions CRUD (ИСПРАВЛЕНО) ---

    // 1. ДОБАВЛЕНИЕ
    html.find(".add-action").click(async () => {
      const actions = this._getActions(); // Получаем актуальные данные (включая дефолт)
      actions.push({
        id: foundry.utils.randomID(),
        name: "Новый метод",
        skill: "survival",
        dc: 10,
        reqTool: "",
        toolRequired: false,
        bonusTool: "",
        bonusMod: 0,
      });
      await this.actor.setFlag("zsystem", "actions", actions);
    });

    // 2. УДАЛЕНИЕ
    html.find(".delete-action").click(async (ev) => {
      const idx = ev.currentTarget.dataset.idx;
      const actions = this._getActions(); // Теперь это безопасный массив

      // Если массив пустой или индекс кривой, ничего не делаем
      if (!actions[idx]) return;

      actions.splice(idx, 1);

      // Если удалили всё, запишем пустой массив (при следующем открытии создастся дефолт)
      // Или можно запретить удалять последний элемент, если хочешь.
      await this.actor.setFlag("zsystem", "actions", actions);
    });

    // 3. ИЗМЕНЕНИЕ ПОЛЕЙ
    html.find(".action-input").change(async (ev) => {
      const idx = ev.target.closest(".action-config").dataset.idx;
      const field = ev.target.dataset.field;
      const val =
        ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;

      const actions = this._getActions(); // Получаем текущее состояние (даже если это дефолт)

      if (!actions[idx]) return; // Защита

      actions[idx][field] = val;

      // Теперь мы сохраняем ВЕСЬ массив, включая те данные, что были "дефолтными"
      await this.actor.setFlag("zsystem", "actions", actions);
    });

    // --- Остальные слушатели без изменений ---
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

    // И здесь используем безопасный метод, чтобы логика совпадала
    const actions = this._getActions();
    const action = actions[idx];

    if (!action)
      return ui.notifications.error(
        "Действие не найдено. Попробуйте обновить настройки."
      );

    const tokens = canvas.tokens.controlled;
    if (!tokens.length) return ui.notifications.warn("Выберите токен!");
    const character = tokens[0].actor;

    if (
      character.id === this.actor.id ||
      ["harvest_spot", "container"].includes(character.type)
    ) {
      return ui.notifications.warn("Этот объект не может действовать.");
    }

    // 1. Проверка Инструмента
    if (action.toolRequired && action.reqTool) {
      const hasTool = character.items.find((i) =>
        i.name.toLowerCase().includes(action.reqTool.toLowerCase())
      );
      if (!hasTool)
        return ui.notifications.error(`Требуется: ${action.reqTool}`);
    }

    // 2. Шанс
    const skillVal = character.system.skills[action.skill]?.value || 0;
    let chance = skillVal - (Number(action.dc) || 0);
    let bonusText = "";

    // Бонусный инструмент
    if (action.bonusTool && action.bonusMod) {
      const hasBonusItem = character.items.find((i) =>
        i.name.toLowerCase().includes(action.bonusTool.toLowerCase())
      );
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

    const defaultOutcomes = {
      critSuccess: { text: "Идеально!", type: "none", value: 0, limb: "torso" },
      success: { text: "Успех!", type: "none", value: 0, limb: "torso" },
      fail: { text: "Провал.", type: "noise", value: 5, limb: "torso" },
      critFail: {
        text: "Катастрофа!",
        type: "damage",
        value: 5,
        limb: "torso",
      },
    };

    const savedOutcomes = this.actor.flags.zsystem?.outcomes || {};
    const outcomes = foundry.utils.mergeObject(defaultOutcomes, savedOutcomes);

    let resultKey = "";
    if (roll.total <= 5) resultKey = "critSuccess";
    else if (roll.total <= chance) resultKey = "success";
    else if (roll.total >= 96) resultKey = "critFail";
    else resultKey = "fail";

    if (resultKey === "critSuccess" && !outcomes.critSuccess)
      resultKey = "success";

    const outcome = outcomes[resultKey] || {};
    const flavor = outcome.text || "Результат...";

    let effectMsg = "";
    const val = Number(outcome.value) || 0;
    let noiseToAdd = 0;

    if (val > 0) {
      // A) ШУМ
      if (outcome.type === "noise") {
        noiseToAdd = val;
        effectMsg = `<div style="color:orange; font-weight:bold; margin-top:5px; border-top:1px dashed #555; padding-top:2px;">
                             <i class="fas fa-volume-up"></i> Шум +${val}
                           </div>`;
      }
      // B) УРОН
      else if (outcome.type === "damage") {
        const limb = outcome.limb || "torso";
        const limbNames = {
          torso: "Торс",
          head: "Голова",
          lArm: "Л.Рука",
          rArm: "П.Рука",
          lLeg: "Л.Нога",
          rLeg: "П.Нога",
        };
        const limbName = limbNames[limb] || limb;

        await character.applyDamage(val, "blunt", limb);

        effectMsg = `<div style="color:#d32f2f; font-weight:bold; margin-top:5px; border-top:1px dashed #555; padding-top:2px;">
                             <i class="fas fa-tint"></i> Урон ${val} (${limbName})
                           </div>`;
      }
    }

    if (resultKey === "critSuccess" || resultKey === "success") {
      await this._openContainer();
    } else if (resultKey === "critFail") {
      await this.actor.setFlag("zsystem", "isBroken", true);
      await this.actor.update({ img: "icons/svg/hazard.svg" });
    }

    const statusClass = resultKey.toLowerCase().includes("success")
      ? "success"
      : "failure";
    const labels = {
      critSuccess: "КРИТ. УСПЕХ",
      success: "УСПЕХ",
      fail: "ПРОВАЛ",
      critFail: "КРИТ. ПРОВАЛ",
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

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: character }),
      content: content,
      flags: {
        zsystem: {
          noiseAdd: noiseToAdd,
        },
      },
    });
  }

  async _openContainer() {
    await this.actor.setFlag("zsystem", "isHarvested", true);
    await this.actor.update({ img: "icons/svg/chest.svg" });
  }
}
