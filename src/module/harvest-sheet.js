import { ZBaseActorSheet } from "./base-sheet.js";
import { NoiseManager } from "./noise.js";

export class ZHarvestSheet extends ZBaseActorSheet {
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

  _getActions() {
    const flags = this.actor.flags.zsystem?.actions;
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

    context.actions = this._getActions();
    context.outcomes = foundry.utils.mergeObject(
      { 
        critSuccess: { text: "Идеально!", type: "none", value: 0, limb: "torso" },
        success: { text: "Успех!", type: "none", value: 0, limb: "torso" },
        fail: { text: "Провал.", type: "noise", value: 5, limb: "torso" },
        critFail: { text: "Катастрофа!", type: "damage", value: 5, limb: "torso" },
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
      torso: "Торс", head: "Голова", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога",
    };

    // === ЛОГИКА БЕЗ ДИСТАНЦИИ ===
    context.availableActors = [];
    context.distanceMsg = ""; 
    context.canHarvest = false;

    if (!context.isGM) {
        const controlled = canvas.tokens.controlled;
        const targetToken = this.token || this.actor.getActiveTokens()[0];
        
        // 1. Проверка: Выделил ли игрок кого-то?
        if (controlled.length === 0) {
            context.distanceMsg = "Выделите своего персонажа.";
        }
        else if (controlled.length > 1) {
            context.distanceMsg = "Выделите только ОДИН токен.";
        }
        else {
            const charToken = controlled[0];
            
            // 2. Проверка: Не выделил ли саму цель?
            if (targetToken && charToken.document.id === targetToken.id) {
                context.distanceMsg = "Выделите СВОЕГО персонажа!";
            } 
            else {
                // ДИСТАНЦИЮ НЕ ПРОВЕРЯЕМ. Просто смотрим тип.
                const tokenActor = charToken.actor;
                
                if (tokenActor.type === "vehicle") {
                    const passengerIds = tokenActor.system.passengers || [];
                    context.availableActors = passengerIds.map(id => game.actors.get(id)).filter(a => a);
                    
                    if (context.availableActors.length === 0) {
                        context.distanceMsg = "В машине никого нет!";
                    }
                } 
                else if (["survivor", "npc"].includes(tokenActor.type)) {
                    context.availableActors = [tokenActor];
                }
                else {
                    context.distanceMsg = "Этот токен не может взаимодействовать.";
                }

                if (context.availableActors.length > 0) {
                    context.canHarvest = true;
                    context.distanceMsg = ""; 
                }
            }
        }
    } else {
        // ГМ
        context.canHarvest = true;
        context.availableActors = canvas.tokens.placeables
            .filter(t => t.actor && ["survivor", "npc"].includes(t.actor.type))
            .map(t => t.actor);
    }

    return context;
  }

  _prepareItems(context) {
    context.inventory = this.actor.items.map((i) => i);
  }

  // ... (activateListeners и остальной код БЕЗ ИЗМЕНЕНИЙ, оставляем как в твоем файле) ...
  activateListeners(html) {
    super.activateListeners(html);
    
    // ... копируй слушатели из твоего файла или оставь как есть ...
    // ВАЖНО: Вставь сюда код слушателей, который ты присылал выше.
    
    html.find(".tool-drop").on("drop", async (ev) => { /*...*/ });
    if (!this.isEditable) return;
    html.find(".add-action").click(async () => { /*...*/ });
    html.find(".delete-action").click(async (ev) => { /*...*/ });
    html.find(".action-input").change(async (ev) => { /*...*/ });
    html.find(".outcome-input").change(async (ev) => { /*...*/ });
    html.find(".harvest-desc-input").change(async (ev) => { /*...*/ });
    html.find(".reset-btn").click(async () => { /*...*/ });
    
    // ЭТО ВАЖНО:
    html.find(".harvest-action-btn").click(this._onHarvestAttempt.bind(this));
    
    html.find(".item-take").click(async (ev) => { /*...*/ });
    html.find(".item-create").click(async () => { /*...*/ });
    html.find(".item-delete").click(async (ev) => { /*...*/ });
    html.find(".item-edit").click((ev) => { /*...*/ });
  }

  async _onHarvestAttempt(event) {
    event.preventDefault();
    const idx = event.currentTarget.dataset.idx;
    const actions = this._getActions();
    const action = actions[idx];

    if (!action) return ui.notifications.error("Действие не найдено.");

    // === 1. ОПРЕДЕЛЯЕМ КТО ДЕЙСТВУЕТ (ИСПРАВЛЕНО ЧТЕНИЕ ИЗ ФОРМЫ) ===
    // Используем jQuery от корневого элемента
    const actorId = this.element.find("#actor-selector").val();
    let character = game.actors.get(actorId);

    // Фоллбэк для ГМа, если он не выбрал из списка (редкий кейс)
    if (!character && game.user.isGM) {
        const controlled = canvas.tokens.controlled;
        character = controlled.length > 0 ? controlled[0].actor : null;
    }

    if (!character) return ui.notifications.warn("Выберите персонажа в списке!");
    if (character.id === this.actor.id) return ui.notifications.warn("Нельзя лутать самим собой.");

    // === 2. ПРОВЕРКА ИНСТРУМЕНТОВ ===
    if (action.toolRequired && action.reqTool) {
      const hasTool = character.items.find((i) =>
        i.name.toLowerCase().includes(action.reqTool.toLowerCase())
      );
      if (!hasTool) return ui.notifications.error(`Требуется: ${action.reqTool}`);
    }

    // === 3. РАСЧЕТ ШАНСА ===
    const skillVal = character.system.skills[action.skill]?.value || 0;
    let chance = skillVal - (Number(action.dc) || 0);
    let bonusText = "";

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

    // === 4. БРОСОК ===
    const roll = new Roll("1d100");
    await roll.evaluate();

    let resultKey = "fail";
    if (roll.total <= 5) resultKey = "critSuccess";
    else if (roll.total <= chance) resultKey = "success";
    else if (roll.total >= 96) resultKey = "critFail";
    
    // Загрузка итогов
    const savedOutcomes = this.actor.flags.zsystem?.outcomes || {};
    const defaultOutcomes = {
        critSuccess: { text: "Идеально!", type: "none", value: 0 },
        success: { text: "Успех!", type: "none", value: 0 },
        fail: { text: "Провал.", type: "noise", value: 5 },
        critFail: { text: "Катастрофа!", type: "damage", value: 5 }
    };
    const outcomes = foundry.utils.mergeObject(defaultOutcomes, savedOutcomes);
    
    // Фоллбэк критов
    if (resultKey === "critSuccess" && !outcomes.critSuccess?.text) resultKey = "success";
    if (resultKey === "critFail" && !outcomes.critFail?.text) resultKey = "fail";

    const outcome = outcomes[resultKey] || {};
    const flavor = outcome.text || "Результат...";

    // === 5. ПРИМЕНЕНИЕ ===
    let effectMsg = "";
    const val = Number(outcome.value) || 0;
    let noiseToAdd = 0;

    if (val > 0) {
      if (outcome.type === "noise") {
        noiseToAdd = val;
        effectMsg = `<div style="color:orange; font-weight:bold; margin-top:5px; border-top:1px dashed #555; padding-top:2px;"><i class="fas fa-volume-up"></i> Шум +${val}</div>`;
      }
      else if (outcome.type === "damage") {
        const limb = outcome.limb || "torso";
        await character.applyDamage(val, "blunt", limb);
        effectMsg = `<div style="color:#d32f2f; font-weight:bold; margin-top:5px; border-top:1px dashed #555; padding-top:2px;"><i class="fas fa-tint"></i> Урон ${val} (${limb})</div>`;
      }
    }

    if (resultKey.toLowerCase().includes("success")) {
      await this._openContainer();
    } else if (resultKey === "critFail") {
      await this.actor.setFlag("zsystem", "isBroken", true);
      await this.actor.update({ img: "icons/svg/hazard.svg" });
    }

    // === 6. ЧАТ ===
    const statusClass = resultKey.toLowerCase().includes("success") ? "success" : "failure";
    const labels = { critSuccess: "КРИТ. УСПЕХ", success: "УСПЕХ", fail: "ПРОВАЛ", critFail: "КРИТ. ПРОВАЛ" };

    let content = `
        <div class="z-chat-card">
          <div class="z-card-header">${character.name}: ${action.name}</div>
          <div class="z-card-sub">Навык: ${action.skill} (${skillVal}) ${bonusText} - DC ${action.dc} = <b>${chance}%</b></div>
          <div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${roll.total}</div></div></div>
          <div class="z-result-label ${statusClass}">${labels[resultKey]}</div>
          <div style="font-size:0.9em; margin-top:5px; padding:5px; background:rgba(0,0,0,0.2); border-radius:3px; color:#fff;">"${flavor}"${effectMsg}</div>
        </div>`;

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: character }),
      content: content,
      flags: { zsystem: { noiseAdd: noiseToAdd } },
    });
  }

  async _openContainer() {
    await this.actor.setFlag("zsystem", "isHarvested", true);
    await this.actor.update({ img: "icons/svg/chest.svg" });
  }
}