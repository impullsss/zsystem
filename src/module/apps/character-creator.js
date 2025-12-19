export class ZCharacterCreator extends FormApplication {
  
  constructor(actor, options) {
    super(actor, options);
    this.actor = actor;
    
    // Определяем режим: Создание или Прокачка
    this.isCreation = !this.actor.getFlag("zsystem", "isCreated");

    // Инициализация данных
    const attr = actor.system.attributes;
    const skills = actor.system.skills;

    // Начальное состояние (Draft)
    this.state = {
      step: 1,
      selectedBackgrounds: [],
      selectedPerk: null,
      
      // Бюджеты
      startPP: this.isCreation ? 1 : (actor.system.secondary.perkPoints.value || 0),
      startSP: this.isCreation ? 100 : (actor.system.secondary.xp.value || 0),
      
      // Потрачено в сессии (для режима Прокачки)
      spentSP_Session: 0,
      spentPP_Session: 0,

      // Копия характеристик
      attributes: {
          str: attr.str.value,
          agi: attr.agi.value,
          vig: attr.vig.value,
          per: attr.per.value,
          int: attr.int.value,
          cha: attr.cha.value
      },
      
      // Копия навыков (ADDED points)
      skills: {} 
    };

    // Заполняем навыки
    for (let key of Object.keys(skills)) {
        // Если создание - начинаем с 0. Если прокачка - начинаем с 0 добавленных в ЭТОЙ сессии.
        // Мы не меняем points в базе напрямую, мы храним дельту (изменения).
        this.state.skills[key] = 0; 
    }
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "character-creator",
      title: "Менеджер Персонажа",
      template: "systems/zsystem/sheets/apps/character-creator.hbs",
      width: 950,
      height: 750,
      classes: ["zsystem", "character-creator"],
      resizable: true
    });
  }

  // --- МАТЕМАТИКА ---

  _getSkillConfig(attributes) {
      const s = attributes;
      return {
        melee: { base: s.str + s.agi, label: "Ближний бой" },
        ranged: { base: s.agi + s.per, label: "Стрельба" },
        science: { base: s.int * 4, label: "Наука" },
        mechanical: { base: s.int + Math.max(s.str, s.agi), label: "Механика" },
        medical: { base: s.int + s.per, label: "Медицина" },
        diplomacy: { base: s.cha + s.per, label: "Дипломатия" },
        leadership: { base: s.cha + s.int, label: "Лидерство" },
        survival: { base: s.per + Math.max(s.vig, s.int), label: "Выживание" },
        athletics: { base: s.str + s.agi, label: "Атлетика" },
        stealth: { base: s.agi + s.per, label: "Скрытность" }
      };
  }

  _getSkillCost(currentValue) {
      if (currentValue >= 90) return 5;
      if (currentValue >= 70) return 3;
      if (currentValue >= 40) return 2;
      return 1;
  }

  // --- ПОДГОТОВКА ДАННЫХ ---
  async getData() {
    const data = {
        actor: this.actor,
        isCreation: this.isCreation,
        step: this.state.step
    };

    // ======================================================
    // РЕЖИМ 1: СОЗДАНИЕ (Логика визарда 1-4)
    // ======================================================
    if (this.isCreation) {
        // ... (Тут код из предыдущего шага без изменений, я его сокращу для краткости) ...
        // (Оставляем ту же логику Backgrounds, Stats, Skills для создания)
        
        // 1. Backgrounds
        const bgItems = game.items.filter(i => i.type === 'perk' && i.system.subtype === 'background');
        data.availableBackgrounds = bgItems.map(i => ({
            id: i.id, name: i.name, img: i.img, system: i.system,
            selected: this.state.selectedBackgrounds.includes(i.id)
        }));
        data.bgCount = this.state.selectedBackgrounds.length;
        data.bgValid = (data.bgCount === 2);

        // 2. Stats
        let statsSum = 0;
        data.statsList = [];
        const labels = { str: "СИЛА", agi: "ЛОВКОСТЬ", vig: "ЖИВУЧЕСТЬ", per: "ВОСПРИЯТИЕ", int: "ИНТЕЛЛЕКТ", cha: "ХАРИЗМА" };
        for (let [key, val] of Object.entries(this.state.attributes)) {
            statsSum += val;
            data.statsList.push({ key, label: labels[key], value: val });
        }
        data.statsPointsLeft = 33 - statsSum;
        data.isStatsValid = (data.statsPointsLeft === 0);

        // 3. Skills
        const skillConfig = this._getSkillConfig(this.state.attributes);
        data.skillsList = [];
        let spentSP = 0;
        const checkData = { ...this.state.attributes };

        for (let [key, conf] of Object.entries(skillConfig)) {
            const added = this.state.skills[key];
            
            // Расчет стоимости для creation (простой или прогрессивный - мы решили прогрессивный)
            let cost = 0;
            for(let i=0; i<added; i++) cost += this._getSkillCost(conf.base + i);
            spentSP += cost;

            const total = conf.base + added;
            checkData[key] = total;
            
            data.skillsList.push({ 
                key, label: conf.label, base: conf.base, added, total,
                nextCost: this._getSkillCost(total)
            });
        }
        data.skillPointsLeft = 100 - spentSP;
        data.canProceedSkills = data.skillPointsLeft >= 0;

        // 4. Perks (Step 4)
        if (this.state.step === 4) {
            const perkItems = game.items.filter(i => i.type === 'perk' && ['general', 'skill'].includes(i.system.subtype));
            data.ppLeft = this.state.startPP - (this.state.selectedPerk ? 1 : 0);
            
            data.availablePerks = perkItems.map(i => {
                const reqMet = this._checkRequirements(i.system.requirements, checkData);
                const cost = i.system.xpCost || 1;
                const canAfford = cost <= this.state.startPP;
                return {
                    id: i.id, name: i.name, img: i.img, system: i.system, cost,
                    reqMet, canAfford, disabled: !reqMet || !canAfford,
                    selected: (this.state.selectedPerk === i.id)
                };
            });
        }
    } 
    
    // ======================================================
    // РЕЖИМ 2: ПРОКАЧКА (LEVEL UP DASHBOARD)
    // ======================================================
    else {
        // А. Бюджеты
        const currentSP = this.state.startSP - this.state.spentSP_Session;
        const currentPP = this.state.startPP - this.state.spentPP_Session;
        
        data.xpAvailable = currentSP;
        data.ppAvailable = currentPP;

        // Б. Навыки
        const skillConfig = this._getSkillConfig(this.actor.system.attributes); // База от реальных статов
        data.skillsList = [];
        
        // Данные для проверки требований перков (Реальные статы + Новые навыки)
        const checkData = { ...this.actor.system.attributes };
        for(let k in checkData) checkData[k] = checkData[k].value;

        for (let [key, conf] of Object.entries(skillConfig)) {
            const realSkillVal = this.actor.system.skills[key].value;
            const sessionAdded = this.state.skills[key] || 0;
            const projectedVal = realSkillVal + sessionAdded;
            
            // Цена следующего очка (для плюса)
            const nextCost = this._getSkillCost(projectedVal);
            const canAfford = currentSP >= nextCost && projectedVal < 100;
            
            // Цена возврата очка (для минуса) - берем цену текущего уровня
            // Если sessionAdded > 0, мы можем вернуть очко.
            const canMinus = sessionAdded > 0;

            checkData[key] = projectedVal;

            data.skillsList.push({
                key, 
                label: conf.label, 
                current: realSkillVal,
                added: sessionAdded,
                // Для UI показываем общую сумму
                total: projectedVal, 
                nextCost,
                canAfford,
                canMinus // <--- НОВОЕ: Флаг для кнопки минус
            });
        }

        // В. Перки (Магазин)
        // Фильтруем те, что уже есть у актора
        const actorPerkIds = this.actor.items.filter(i => i.type === 'perk').map(i => i.flags?.core?.sourceId || i.name); // Упрощенная проверка по имени
        
        const allPerks = game.items.filter(i => i.type === 'perk' && ['general', 'skill'].includes(i.system.subtype));
        
        data.shopPerks = allPerks.filter(i => !this.actor.items.some(ai => ai.name === i.name)) // Не показывать купленные
            .map(i => {
                const reqMet = this._checkRequirements(i.system.requirements, checkData);
                const cost = i.system.xpCost || 1;
                const canAfford = currentPP >= cost;
                
                // Проверяем, выбран ли он в этой сессии
                const isSelected = this.state.selectedPerk === i.id; // В LevelUp можно купить только 1 за раз (для простоты) или массив?
                // Давай пока сделаем покупку поштучно: нажал -> купил -> списалось -> окно обновилось.
                // Но лучше через "Корзину" (state.selectedPerks array).
                // Для простоты реализации сейчас: Список доступных. Кнопка "Купить".
                
                return {
                    id: i.id, name: i.name, img: i.img, system: i.system, cost,
                    reqMet, canAfford, disabled: !reqMet || !canAfford
                };
            });
            
        // Г. Характеристики (Тренировка)
        // Показываем текущие и кнопку повышения
        const labels = { str: "СИЛА", agi: "ЛОВКОСТЬ", vig: "ЖИВУЧЕСТЬ", per: "ВОСПРИЯТИЕ", int: "ИНТЕЛЛЕКТ", cha: "ХАРИЗМА" };
        data.statsTrain = [];
        const STAT_COST_PP = 2; // Цена повышения характеристики

        for (let [key, attr] of Object.entries(this.actor.system.attributes)) {
            const canAfford = currentPP >= STAT_COST_PP && attr.base < 10;
            data.statsTrain.push({
                key, 
                label: labels[key], 
                value: attr.base,
                cost: STAT_COST_PP,
                canAfford,
                disabled: !canAfford
            });
        }
    }

    return data;
  }

  // --- ЛИСТЕНЕРЫ ---
  activateListeners(html) {
    super.activateListeners(html);
    
    // --- ОБЩАЯ НАВИГАЦИЯ ---
    // Кнопки шагов (работают только в режиме создания)
    html.find(".step-btn").click(ev => { 
        if(this.isCreation) { 
            this.state.step = Number(ev.currentTarget.dataset.step); 
            this.render(true); 
        }
    });
    
    // Кнопки Далее/Назад/Завершить
    html.find("button[data-action='next']").click(() => { 
        if (this.state.step < 4) { this.state.step++; this.render(true); }
    });
    html.find("button[data-action='prev']").click(() => { 
        if (this.state.step > 1) { this.state.step--; this.render(true); }
    });
    html.find("button[data-action='finish']").click(this._onFinish.bind(this));

    // ======================================================
    // РЕЖИМ 1: СОЗДАНИЕ (CREATION MODE)
    // ======================================================
    if (this.isCreation) {

        // Функция синхронизации: сохраняет то, что вписано руками, в this.state
        const syncInputs = () => {
            html.find(".skill-input-creator").each((i, el) => {
                const key = el.dataset.key;
                let val = parseInt(el.value) || 0;
                if (val < 0) val = 0;
                this.state.skills[key] = val;
            });
        };

        // 1. Предыстории (Backgrounds) - Клик по карточке
        html.find(".bg-card").click(ev => {
            const id = ev.currentTarget.dataset.itemId;
            const idx = this.state.selectedBackgrounds.indexOf(id);
            if (idx > -1) this.state.selectedBackgrounds.splice(idx, 1);
            else {
                if (this.state.selectedBackgrounds.length >= 2) return ui.notifications.warn("Можно выбрать только 2.");
                this.state.selectedBackgrounds.push(id);
            }
            this.render(true);
        });

        // 2. Характеристики (Stats) - Кнопки +/-
        html.find(".stat-ctrl").click(ev => {
            const action = ev.currentTarget.dataset.action;
            const key = ev.currentTarget.dataset.key;
            let sum = Object.values(this.state.attributes).reduce((a,b)=>a+b,0);

            if (action === "plus") {
                if (this.state.attributes[key] >= 10 || sum >= 33) return;
                this.state.attributes[key]++;
            } else {
                if (this.state.attributes[key] <= 1) return;
                this.state.attributes[key]--;
            }
            this.render(true);
        });

        // 3. Навыки (Skills) - Ручной ввод (Enter/Blur)
        html.find(".skill-input-creator").change(ev => {
            syncInputs();
            this.render(true);
        });

        // 3. Навыки (Skills) - Кнопки +/-
        html.find(".skill-ctrl").click(ev => {
            syncInputs(); // Сначала читаем то, что вписано в инпуты

            const action = ev.currentTarget.dataset.action;
            const key = ev.currentTarget.dataset.key;
            const skillConf = this._getSkillConfig(this.state.attributes);
            const base = skillConf[key].base;
            const added = this.state.skills[key];

            // Вспомогательная функция расчета полной стоимости
            const calcTotal = () => {
                 let t = 0;
                 for (let [k, v] of Object.entries(this.state.skills)) {
                     const b = this._getSkillConfig(this.state.attributes)[k].base;
                     for(let i=0; i<v; i++) t += this._getSkillCost(b+i);
                 }
                 return t;
            };

            if (action === "plus") {
                const nextCost = this._getSkillCost(base + added);
                // Проверка лимита 100
                if (calcTotal() + nextCost > 100) return ui.notifications.warn("Лимит очков превышен!");
                if (base + added >= 100) return;

                this.state.skills[key]++;
            } else {
                if (added <= 0) return;
                this.state.skills[key]--;
            }
            this.render(true);
        });

        // 4. Перки (Perks) - Выбор стартового
        html.find(".perk-select-card").click(ev => {
            const li = $(ev.currentTarget);
            if (li.hasClass("disabled")) return;
            const id = li.data("itemId");
            if (this.state.selectedPerk === id) this.state.selectedPerk = null;
            else this.state.selectedPerk = id;
            this.render(true);
        });

    }
    // ======================================================
    // РЕЖИМ 2: ПРОКАЧКА (LEVEL UP MODE)
    // ======================================================
    else {

        // Функция синхронизации (Level Up)
        const syncLevelUpInputs = () => {
            html.find(".skill-input-levelup").each((i, el) => {
                const key = el.dataset.key;
                let val = parseInt(el.value) || 0;
                if (val < 0) val = 0;
                this.state.skills[key] = val;
            });
        };

        // 1. Навыки (Level Up) - Ручной ввод
        html.find(".skill-input-levelup").change(ev => {
            const key = ev.currentTarget.dataset.key;
            const newVal = parseInt(ev.currentTarget.value) || 0;
            const oldVal = this.state.skills[key] || 0;

            if (newVal < 0) { this.render(true); return; }
            if (newVal === oldVal) return;

            const diff = newVal - oldVal;
            const realVal = this.actor.system.skills[key].value; // Реальное значение у актора
            let currentSP = this.state.startSP - this.state.spentSP_Session;
            let costDelta = 0;

            // Если добавляем очки
            if (diff > 0) {
                for (let i = 0; i < diff; i++) {
                    const cost = this._getSkillCost(realVal + oldVal + i);
                    costDelta += cost;
                }
                if (costDelta > currentSP) {
                    ui.notifications.warn("Не хватает SP!");
                    this.render(true);
                    return;
                }
            } 
            // Если убираем (возвращаем) очки
            else {
                for (let i = 0; i < Math.abs(diff); i++) {
                    const level = realVal + oldVal - 1 - i;
                    costDelta -= this._getSkillCost(level);
                }
            }

            this.state.skills[key] = newVal;
            this.state.spentSP_Session += costDelta;
            this.render(true);
        });

        // 1. Навыки (Level Up) - Кнопки +/-
        html.find(".levelup-skill-ctrl").click(ev => {
            syncLevelUpInputs(); // Сохраняем текущий ввод перед кликом

            const action = ev.currentTarget.dataset.action;
            const key = ev.currentTarget.dataset.key;
            
            const realVal = this.actor.system.skills[key].value;
            const added = this.state.skills[key] || 0;
            const currentSP = this.state.startSP - this.state.spentSP_Session;

            if (action === "plus") {
                const cost = this._getSkillCost(realVal + added);
                
                if (currentSP < cost) return ui.notifications.warn("Не хватает SP!");
                if (realVal + added >= 100) return;

                this.state.skills[key]++;
                this.state.spentSP_Session += cost;
            } 
            else if (action === "minus") {
                if (added <= 0) return; // Нельзя уйти в минус от начала сессии
                
                // Возвращаем стоимость последнего купленного уровня
                const refund = this._getSkillCost(realVal + added - 1);
                
                this.state.skills[key]--;
                this.state.spentSP_Session -= refund;
            }
            this.render(true);
        });

        // 2. Тренировка Характеристик (Stats)
        html.find(".train-stat-btn").click(ev => {
            const key = ev.currentTarget.dataset.key;
            const cost = 2; // Цена тренировки (2 PP)
            const currentPP = this.state.startPP - this.state.spentPP_Session;
            
            if (currentPP < cost) return ui.notifications.warn("Не хватает PP!");

            if (!this.state.statIncreases) this.state.statIncreases = {};
            this.state.statIncreases[key] = (this.state.statIncreases[key] || 0) + 1;
            
            this.state.spentPP_Session += cost;
            this.render(true);
        });

        // 3. Покупка Перков (Perks)
        html.find(".buy-perk-btn").click(ev => {
            const id = ev.currentTarget.dataset.id;
            const cost = parseInt(ev.currentTarget.dataset.cost);
            const currentPP = this.state.startPP - this.state.spentPP_Session;

            if (currentPP < cost) return ui.notifications.warn("Не хватает PP!");

            if (!this.state.cartPerks) this.state.cartPerks = [];
            this.state.cartPerks.push(id);
            
            this.state.spentPP_Session += cost;
            this.render(true);
            ui.notifications.info("Перк добавлен в корзину.");
        });
    }
  }

  // --- СОХРАНЕНИЕ ---
  async _onFinish(event) {
      event.preventDefault();
      
      const updates = {};
      const itemsToCreate = [];

      if (this.isCreation) {
          // ЛОГИКА СОЗДАНИЯ (Старая)
          updates["system.secondary.xp.value"] = 0;
          updates["system.secondary.xp.spent"] = 0;
          updates["system.secondary.perkPoints.value"] = this.state.startPP - (this.state.selectedPerk ? 1 : 0);
          updates["flags.zsystem.isCreated"] = true;

          for (let [k, v] of Object.entries(this.state.attributes)) updates[`system.attributes.${k}.base`] = v;
          for (let [k, v] of Object.entries(this.state.skills)) updates[`system.skills.${k}.points`] = v;

          for (let id of this.state.selectedBackgrounds) {
              const item = game.items.get(id);
              if (item) itemsToCreate.push(item.toObject());
          }
          if (this.state.selectedPerk) {
              const item = game.items.get(this.state.selectedPerk);
              if (item) itemsToCreate.push(item.toObject());
          }

      } else {
          // ЛОГИКА ПРОКАЧКИ (Новая)
          
          // 1. Списание валюты
          const finalSP = this.state.startSP - this.state.spentSP_Session;
          const finalPP = this.state.startPP - this.state.spentPP_Session;
          
          updates["system.secondary.xp.value"] = finalSP;
          // Увеличиваем потраченный XP (для истории)
          const oldSpent = this.actor.system.secondary.xp.spent || 0;
          updates["system.secondary.xp.spent"] = oldSpent + this.state.spentSP_Session;
          
          updates["system.secondary.perkPoints.value"] = finalPP;
          
          // 2. Навыки (Добавляем к существующим очкам)
          for (let [k, added] of Object.entries(this.state.skills)) {
              if (added > 0) {
                  const currentPoints = this.actor.system.skills[k].points;
                  updates[`system.skills.${k}.points`] = currentPoints + added;
              }
          }

          // 3. Характеристики (Добавляем к базе)
          if (this.state.statIncreases) {
              for (let [k, added] of Object.entries(this.state.statIncreases)) {
                  const currentBase = this.actor.system.attributes[k].base;
                  updates[`system.attributes.${k}.base`] = currentBase + added;
              }
          }

          // 4. Перки (Из корзины)
          if (this.state.cartPerks) {
              for (let id of this.state.cartPerks) {
                  const item = game.items.get(id);
                  if (item) itemsToCreate.push(item.toObject());
              }
          }
      }

      await this.actor.update(updates);
      if (itemsToCreate.length > 0) {
          await this.actor.createEmbeddedDocuments("Item", itemsToCreate);
      }

      ui.notifications.info(`${this.actor.name}: Данные обновлены!`);
      this.close();
  }

  // Парсер требований (Тот же)
  _checkRequirements(reqString, data) {
      if (!reqString || typeof reqString !== 'string') return true;
      const map = {
          "сила": "str", "str": "str", "strength": "str",
          "ловкость": "agi", "agi": "agi", "agility": "agi",
          "живучесть": "vig", "vig": "vig",
          "восприятие": "per", "per": "per",
          "интеллект": "int", "int": "int",
          "харизма": "cha", "cha": "cha",
          "ближний": "melee", "melee": "melee",
          "стрельба": "ranged", "ranged": "ranged",
          "наука": "science",
          "механика": "mechanical", "mech": "mechanical",
          "медицина": "medical", "med": "medical",
          "дипломатия": "diplomacy",
          "лидерство": "leadership",
          "выживание": "survival",
          "атлетика": "athletics",
          "скрытность": "stealth"
      };
      const parts = reqString.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(p => p);
      for (let i = 0; i < parts.length - 1; i++) {
          const keyRaw = parts[i];
          const valRaw = parseInt(parts[i+1]);
          if (!isNaN(valRaw)) {
              let dataKey = null;
              for (let [syn, k] of Object.entries(map)) { if (keyRaw === syn) { dataKey = k; break; } }
              if (dataKey && typeof data[dataKey] !== 'undefined') {
                  if (data[dataKey] < valRaw) return false;
                  i++; 
              }
          }
      }
      return true;
  }

  async _updateObject(event, formData) { return; }
}