import * as Dice from "./dice.js";
import { NoiseManager } from "./noise.js"; 

export class ZHarvestSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "harvest"],
      template: "systems/zsystem/sheets/harvest-sheet.hbs",
      width: 550,
      height: 750, // Увеличил высоту для новых полей
      // ВАЖНО: Tabs configuration. navSelector должен указывать на контейнер табов
      tabs: [{ navSelector: ".gm-tabs", contentSelector: ".sheet-body", initial: "actions" }],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }] 
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system;
    context.isGM = game.user.isGM;
    const flags = this.actor.flags.zsystem || {};

    // Состояния
    context.isHarvested = flags.isHarvested || false;
    context.isBroken = flags.isBroken || false;
    context.description = flags.description || "";

    // === ЛОГИКА ДЕЙСТВИЙ (МАССИВ) ===
    // Если действий нет, создаем дефолтное "Вскрыть"
    let actions = flags.actions || [];
    if (!Array.isArray(actions) || actions.length === 0) {
        actions = [{
            id: foundry.utils.randomID(),
            name: "Осмотреть / Вскрыть",
            skill: "survival",
            dc: 10,
            reqTool: "",
            toolRequired: false,
            bonusTool: ""
        }];
        // Мы не сохраняем сразу, чтобы не спамить базу, сохраним при первом изменении
    }
    context.actions = actions;

    // Результаты (Outcomes)
    context.outcomes = flags.outcomes || {
        success: { text: "Успех!", noise: 0 },
        fail: { text: "Провал.", noise: 0 },
        critFail: { text: "Катастрофа!", noise: 10 }
    };

    // Инвентарь
    this._prepareItems(context);

    // Списки для выпадающих меню
    context.skillsList = { 
        survival: "Выживание", 
        mechanical: "Механика", 
        science: "Наука", 
        medical: "Медицина", 
        lockpick: "Взлом", 
        athletics: "Атлетика",
        melee: "Ближний бой",
        stealth: "Скрытность"
    };

    // Проверка дистанции
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
    // Копируем предметы в массив для удобства шаблона
    context.inventory = this.actor.items.map(i => i);
  }

  activateListeners(html) {
    super.activateListeners(html);

    // --- DRAG & DROP ДЛЯ ИНСТРУМЕНТОВ ---
    // Это позволяет перетащить предмет из компендиума прямо в инпут "Нужен предмет"
    html.find('.tool-drop').on('drop', async ev => {
        ev.preventDefault();
        try {
            const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
            if (data.type !== "Item") return;
            
            // Получаем предмет (асинхронно, т.к. может быть из пака)
            const item = await Item.fromDropData(data); 
            if (item) {
                // Находим инпут и ставим значение
                $(ev.target).val(item.name);
                // Триггерим событие change, чтобы сработал слушатель сохранения
                $(ev.target).trigger('change');
            }
        } catch (e) { console.error(e); }
    });

    if (!this.isEditable) return;

    // --- УПРАВЛЕНИЕ ДЕЙСТВИЯМИ (GM) ---
    
    // Добавить действие
    html.find('.add-action').click(async () => {
        const actions = this.actor.getFlag("zsystem", "actions") || [];
        actions.push({
            id: foundry.utils.randomID(),
            name: "Новый метод",
            skill: "survival",
            dc: 10
        });
        await this.actor.setFlag("zsystem", "actions", actions);
    });

    // Удалить действие
    html.find('.delete-action').click(async ev => {
        const idx = ev.currentTarget.dataset.idx;
        const actions = duplicate(this.actor.getFlag("zsystem", "actions"));
        actions.splice(idx, 1);
        await this.actor.setFlag("zsystem", "actions", actions);
    });

    // Изменение полей действия
    html.find('.action-input').change(async ev => {
        const idx = ev.target.closest('.action-config').dataset.idx;
        const field = ev.target.dataset.field; // name, skill, dc, toolRequired...
        
        // Читаем значение (чекбокс или текст)
        const val = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        
        const actions = duplicate(this.actor.getFlag("zsystem", "actions") || []);
        
        // Защита от undefined
        if (!actions[idx]) return;
        
        actions[idx][field] = val;
        await this.actor.setFlag("zsystem", "actions", actions);
    });

    // Изменение Outcomes (результатов)
    html.find('.outcome-input').change(async ev => {
        const field = ev.target.dataset.field; // outcomes.success.text
        // Используем update для вложенных флагов
        await this.actor.update({[`flags.zsystem.${field}`]: ev.target.value});
    });

    // Изменение описания
    html.find('.harvest-desc-input').change(async ev => {
        await this.actor.setFlag("zsystem", "description", ev.target.value);
    });

    // Сброс (Reset)
    html.find('.reset-btn').click(async () => {
        await this.actor.setFlag("zsystem", "isHarvested", false);
        await this.actor.setFlag("zsystem", "isBroken", false);
        await this.actor.update({img: "icons/svg/padlock.svg"}); 
        // Не нужно вызывать render(true), Foundry сделает это сама после update
    });

    // --- ДЕЙСТВИЯ ИГРОКА ---
    html.find('.harvest-action-btn').click(this._onHarvestAttempt.bind(this));

    // --- ЛУТАНИЕ (Взять предмет) ---
    html.find('.item-take').click(async ev => {
        ev.preventDefault();
        const li = $(ev.currentTarget).closest("[data-item-id]");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        
        const tokens = canvas.tokens.controlled;
        if (tokens.length === 0) return ui.notifications.warn("Выберите, кто забирает!");
        const taker = tokens[0].actor;

        if (item && taker) {
            await taker.createEmbeddedDocuments("Item", [item.toObject()]);
            ui.notifications.info(`${taker.name} забрал ${item.name}`);
            await item.delete();
        }
    });

    // Стандартные кнопки предметов (для ГМа)
    html.find('.item-create').click(async () => await Item.create({name:"Loot", type:"misc"}, {parent:this.actor}));
    
    html.find('.item-delete').click(async ev => {
        const li = $(ev.currentTarget).closest("[data-item-id]");
        const item = this.actor.items.get(li.data("itemId"));
        if (item) await item.delete();
    });
    
    html.find('.item-edit').click(ev => {
        const li = $(ev.currentTarget).closest("[data-item-id]");
        const item = this.actor.items.get(li.data("itemId"));
        item.sheet.render(true);
    });
  }

  async _onHarvestAttempt(event) {
      event.preventDefault();
      const idx = event.currentTarget.dataset.idx;
      const actions = this.actor.getFlag("zsystem", "actions");
      const action = actions[idx];

      const tokens = canvas.tokens.controlled;
      if (!tokens.length) return ui.notifications.warn("Выберите токен!");
      const character = tokens[0].actor;
      
      // Защита
      if (character.id === this.actor.id || ["harvest_spot", "container"].includes(character.type)) {
          return ui.notifications.warn("Этот объект не может действовать.");
      }

      // 1. Проверка Инструмента
      if (action.toolRequired && action.reqTool) {
          // Ищем частичное совпадение (Lockpick подходит для Lockpick Set)
          const hasTool = character.items.find(i => i.name.toLowerCase().includes(action.reqTool.toLowerCase()));
          if (!hasTool) return ui.notifications.error(`Для этого действия нужен: ${action.reqTool}`);
      }

      // 2. Расчет Шанса
      const skillVal = character.system.skills[action.skill]?.value || 0;
      let chance = skillVal - (Number(action.dc) || 0);
      let bonusText = "";

      const bonusVal = Number(action.bonusMod) || 0;
      if (bonusVal !== 0) {
          chance += bonusVal;
          bonusText = ` (+${bonusVal} Бонус)`;
      }

      chance = Math.max(5, Math.min(95, chance));

      // Бонусный инструмент
      if (action.bonusTool) {
          const hasBonus = character.items.find(i => i.name.toLowerCase().includes(action.bonusTool.toLowerCase()));
          if (hasBonus) {
              chance += 10;
              bonusText = ` (+10% ${action.bonusTool})`;
          }
      }

      chance = Math.max(5, Math.min(95, chance));

      // 3. Бросок
      const roll = new Roll("1d100");
      await roll.evaluate();
      
      const outcomes = this.actor.flags.zsystem.outcomes || {};
      
      // Определяем результат (используем нашу функцию из dice.js логики, но тут локально для простоты)
      let resultType = "";
      let flavor = "";
      
      if (roll.total <= 5) { 
          resultType = "crit-success"; 
          flavor = outcomes.success?.text || "Критический успех!";
          await this._openContainer();
      } 
      else if (roll.total <= chance) { 
          resultType = "success"; 
          flavor = outcomes.success?.text || "Успех!";
          await this._openContainer();
      } 
      else if (roll.total >= 96) { 
          resultType = "crit-fail"; 
          flavor = outcomes.critFail?.text || "Критический провал!";
          await this.actor.setFlag("zsystem", "isBroken", true);
          await this.actor.update({img: "icons/svg/hazard.svg"});
          
          if (outcomes.critFail?.noise) NoiseManager.add(Number(outcomes.critFail.noise));
      } 
      else { 
          resultType = "fail"; 
          flavor = outcomes.fail?.text || "Неудачно.";
          if (outcomes.fail?.noise) NoiseManager.add(Number(outcomes.fail.noise));
      }

      // Генерируем HTML для чата
      // Импортируем функцию генерации HTML или пишем свою
      const statusClass = (resultType.includes("success")) ? "success" : "failure";
      const statusLabel = (resultType === "crit-success") ? "КРИТ. УСПЕХ" : (resultType === "success" ? "УСПЕХ" : (resultType === "crit-fail" ? "КРИТ. ПРОВАЛ" : "ПРОВАЛ"));

      let content = `
        <div class="z-chat-card">
          <div class="z-card-header">${character.name}: ${action.name}</div>
          <div class="z-card-sub">Навык: ${action.skill} (${skillVal}) ${bonusText} - DC ${action.dc} = <b>${chance}%</b></div>
          <div class="z-slot-machine">
             <div class="z-reel-window"><div class="z-reel-spin ${statusClass}">${roll.total}</div></div>
          </div>
          <div class="z-result-label ${statusClass}">${statusLabel}</div>
          <div style="font-size:0.9em; margin-top:5px; padding:5px; background:rgba(0,0,0,0.2); border-radius:3px; color:#fff;">
            ${flavor}
          </div>
        </div>`;
      
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: character}), content });
  }

  async _openContainer() {
      await this.actor.setFlag("zsystem", "isHarvested", true);
      await this.actor.update({img: "icons/svg/chest.svg"});
  }
}