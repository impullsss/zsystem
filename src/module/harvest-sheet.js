import * as Dice from "./dice.js";
import { NoiseManager } from "./noise.js"; 

export class ZHarvestSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "harvest"],
      template: "systems/zsystem/sheets/harvest-sheet.hbs",
      width: 450,
      height: 600,
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system;
    
    // --- ИСПРАВЛЕНИЕ: Явно передаем флаг ГМа ---
    context.isGM = game.user.isGM;

    // Флаги
    context.isHarvested = this.actor.getFlag("zsystem", "isHarvested") || false;
    context.isBroken = this.actor.getFlag("zsystem", "isBroken") || false;
    context.description = this.actor.getFlag("zsystem", "description") || "";
    
    // Подготовка инвентаря
    this._prepareItems(context);

    // Список навыков
    context.skillsList = {
        survival: "Выживание",
        mechanical: "Механика",
        science: "Наука",
        medical: "Медицина",
        athletics: "Атлетика"
    };

    // --- ЛОГИКА ДИСТАНЦИИ ---
    context.canHarvest = true;
    context.distanceMsg = "";

    // Если это Игрок (не ГМ), проверяем токен
    if (!context.isGM) {
        const token = canvas.tokens.controlled[0];
        if (!token) {
            context.canHarvest = false;
            context.distanceMsg = "Нет токена";
        } else {
            const targetToken = this.actor.getActiveTokens()[0];
            if (targetToken) {
                const dist = canvas.grid.measureDistance(token, targetToken);
                // 1.5 клетки ~ 2-3 метра
                if (dist > 1.5) { 
                    context.canHarvest = false;
                    context.distanceMsg = "Далеко";
                }
            } else {
                 context.canHarvest = false;
                 context.distanceMsg = "Ошибка цели";
            }
        }
    } else {
        // ГМ всегда может нажать кнопку (для теста)
        context.canHarvest = true;
    }

    return context;
  }

  _prepareItems(context) {
    const inventory = { items: [] };
    for (let i of this.actor.items) {
        inventory.items.push(i);
    }
    context.inventory = inventory;
  }

  activateListeners(html) {
    super.activateListeners(html);
    

    html.find('.harvest-btn').click(this._onHarvestAttempt.bind(this));

    html.find('.harvest-desc-input').change(async ev => {
        await this.actor.setFlag("zsystem", "description", ev.target.value);
    });

    html.find('.reset-btn').click(async () => {
        await this.actor.setFlag("zsystem", "isHarvested", false);
        await this.actor.setFlag("zsystem", "isBroken", false);
        await this.actor.update({img: "icons/svg/padlock.svg"}); 
        this.render(true);
    });

    html.find('.item-delete').click(async ev => {
        ev.preventDefault();
        // Ищем ближайший родительский элемент с атрибутом data-item-id
        const li = $(ev.currentTarget).closest("[data-item-id]"); 
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (item) await item.delete();
    });
    
    html.find('.item-edit').click(ev => {
        ev.preventDefault();
        const li = $(ev.currentTarget).closest("[data-item-id]");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (item) item.sheet.render(true);
    });
    
    // Создание предмета (Важно для ГМа)
    html.find('.item-create').click(async ev => {
        await Item.create({name: "Случайный лут", type: "misc"}, {parent: this.actor});
    });
  }

  async _onHarvestAttempt(event) {
      event.preventDefault();
      
      const tokens = canvas.tokens.controlled;
      if (tokens.length === 0) return ui.notifications.warn("Выберите своего персонажа!");
      
      const character = tokens[0].actor;
      if (!character) return;

      // --- ЗАЩИТА: Проверка на самого себя или неживой объект ---
      if (character.id === this.actor.id) {
          return ui.notifications.warn("Вы выбрали саму Точку Сбора! Пожалуйста, выберите своего персонажа.");
      }

      if (["harvest_spot", "container", "shelter"].includes(character.type)) {
          return ui.notifications.warn("Этот объект не может совершать проверки навыков. Выберите живого персонажа.");
      }
      // -----------------------------------------------------------

      const skillKey = this.actor.getFlag("zsystem", "reqSkill") || "survival";
      const dc = Number(this.actor.getFlag("zsystem", "difficulty")) || 10;
      
      const skill = character.system.skills[skillKey];
      const skillVal = skill ? skill.value : 0;
      
      let chance = skillVal - dc;
      chance = Math.max(5, Math.min(95, chance));
      
      const roll = new Roll("1d100");
      await roll.evaluate();
      
      const isSuccess = roll.total <= chance;
      const isCriticalFail = roll.total >= 96; 

      let resultText = isSuccess ? "УСПЕХ" : "ПРОВАЛ";
      let resultClass = isSuccess ? "success" : "failure";
      let flavor = "";

      if (isCriticalFail) {
          resultText = "КРИТИЧЕСКИЙ ПРОВАЛ";
          flavor = "<br>Объект поврежден / Шум!";
          await this.actor.setFlag("zsystem", "isBroken", true);
          await this.actor.update({img: "icons/svg/hazard.svg"}); 
          NoiseManager.add(10);
      } else if (isSuccess) {
          await this.actor.setFlag("zsystem", "isHarvested", true);
          await this.actor.update({img: "icons/svg/chest.svg"}); 
      }

      let content = `<div class="z-chat-card">
          <div class="z-card-header">${character.name}: Сбор (${skillKey})</div>
          <div class="z-card-sub">Навык ${skillVal} - DC ${dc} = Шанс <b>${chance}%</b></div>
          <div class="z-slot-machine">
             <div class="z-reel-window"><div class="z-reel-spin ${resultClass}">${roll.total}</div></div>
          </div>
          <div class="z-result-label ${resultClass}">${resultText}</div>
          <div style="font-size:0.8em; color:#aaa;">${flavor}</div>
      </div>`;
      
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: character}), content });
      this.render(true);
  }
}