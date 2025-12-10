import { ZBaseActorSheet } from "./base-sheet.js";
export class ZShelterSheet extends ZBaseActorSheet {
  
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['zsystem', 'sheet', 'shelter'],
      template: 'systems/zsystem/sheets/shelter-sheet.hbs',
      width: 800,
      height: 750,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
      dragDrop: [
          { dragSelector: ".resident-card", dropSelector: null },
          { dragSelector: ".item-list .item", dropSelector: null }
      ]
    });
  }

  async getData() {
    const context = super.getData();
    
    // --- 1. ЗАЩИТА ДАННЫХ (ИНИЦИАЛИЗАЦИЯ) ---
    // Если system нет, создаем пустой объект, чтобы не было ошибки
    context.system = this.actor.system || {};

    // Если нет resources, создаем
    if (!context.system.resources) {
        context.system.resources = {};
    }

    // Проверяем конкретные ресурсы, если их нет — ставим нули/дефолты
    const res = context.system.resources;
    if (!res.defense) res.defense = { value: 0 };
    if (!res.food) res.food = { value: 50, max: 500 };
    if (!res.fuel) res.fuel = { value: 20, max: 100, daily: 5 };
    if (!res.parts) res.parts = { value: 0 };
    if (!res.antibiotics) res.antibiotics = { value: 0 };

    // Проверяем мораль и население
    if (!context.system.morale) context.system.morale = { value: 50, trend: 0 };
    if (!context.system.residents) context.system.residents = [];
    
    // ----------------------------------------

    // --- 2. Подготовка Жителей ---
    const residentIds = context.system.residents;
    context.residentActors = [];
    for (let id of residentIds) {
        const actor = game.actors.get(id);
        if (actor) context.residentActors.push(actor);
    }
    context.populationCount = context.residentActors.length;

    // --- 3. Подготовка Предметов ---
    let totalDefense = 0;

    const items = this.actor.items.map(i => {
        const item = i.toObject();
        item.workersList = [];
        
        if (item.system.workers && item.system.workers.length > 0) {
            item.workersList = item.system.workers.map(id => game.actors.get(id)).filter(a => a);
        }
        
        const current = item.system.progress || 0;
        const max = item.system.hoursNeeded || 1;
        item.percentComplete = Math.min(100, Math.round((current / max) * 100));

        item.isBuilt = (current >= max);
        item.isFunded = (item.system.partsPaid >= item.system.partsCost);

        // Считаем защиту от завершенных построек
        if (item.system.isCompleted && item.system.bonusType === 'defense') {
            totalDefense += (Number(item.system.bonusValue) || 0);
        }

        return item;
    });

    // Обновляем защиту для отображения
    context.system.resources.defense.value = totalDefense;

    // Фильтрация по вкладкам
    context.activeUpgrades = items.filter(i => i.type === 'upgrade' && !i.system.isCompleted);
    context.activeProjects = items.filter(i => i.type === 'project' && !i.system.isCompleted);
    
    context.completedUpgrades = items.filter(i => i.type === 'upgrade' && i.system.isCompleted);
    context.completedProjects = items.filter(i => i.type === 'project' && i.system.isCompleted);
    
    // Инвентарь
    const inventory = {
      weapon: { label: "Оружие", items: [] },
      ammo: { label: "Патроны", items: [] },
      armor: { label: "Броня", items: [] },
      medicine: { label: "Медицина", items: [] },
      food: { label: "Еда", items: [] },
      materials: { label: "Материалы", items: [] },
      misc: { label: "Разное", items: [] }
    };

    for (let i of items) {
      if (i.type === 'upgrade' || i.type === 'project') continue;
      
      let cat = i.system.category || "misc";
      
      if (i.type === "resource") cat = "materials";
      if (i.type === "armor") cat = "armor";
      if (i.type === "weapon") cat = "weapon";
      if (i.type === "ammo") cat = "ammo";
      if (i.type === "food") cat = "food";
      if (i.type === "medicine") cat = "medicine";
      
      if (inventory[cat]) inventory[cat].items.push(i);
      else inventory.misc.items.push(i);
    }
    context.inventory = inventory;
    
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find('.end-day-btn').click(ev => this._onEndDay());
    
    html.find('.contribute-btn').click(async ev => {
        const li = $(ev.currentTarget).closest(".item");
        const item = this.actor.items.get(li.data("itemId"));
        this._contributeParts(item);
    });

    html.find('.add-worker-btn').click(ev => {
        const li = $(ev.currentTarget).closest(".item");
        const item = this.actor.items.get(li.data("itemId"));
        this._onAddWorker(item);
    });

    html.find('.remove-worker').click(async ev => {
        const li = $(ev.currentTarget).closest(".item");
        const workerId = ev.currentTarget.dataset.id;
        const item = this.actor.items.get(li.data("itemId"));
        // Безопасная фильтрация
        const current = item.system.workers || [];
        const newWorkers = current.filter(id => id !== workerId);
        await item.update({"system.workers": newWorkers});
    });
    
    html.find('.remove-resident').click(async ev => {
        const workerId = ev.currentTarget.dataset.id;
        const newResidents = this.actor.system.residents.filter(id => id !== workerId);
        await this.actor.update({"system.residents": newResidents});
    });

    html.find('.open-resident').click(ev => {
        const id = ev.currentTarget.dataset.id;
        const actor = game.actors.get(id);
        if (actor) actor.sheet.render(true);
    });

    html.find('.progress-control').click(async ev => {
        const action = ev.currentTarget.dataset.action;
        const li = $(ev.currentTarget).closest(".item");
        const item = this.actor.items.get(li.data("itemId"));
        
        // Безопасная проверка
        const workers = item.system.workers || [];
        if (workers.length === 0) {
            return ui.notifications.warn(`На "${item.name}" нет работников! Работа стоит.`);
        }

        let current = item.system.progress || 0;
        const max = item.system.hoursNeeded || 10;
        const isFunded = (item.system.partsPaid || 0) >= (item.system.partsCost || 0);

        if (action === "plus") {
            if (current + 1 >= max && !isFunded) {
                return ui.notifications.warn(`Нельзя завершить "${item.name}": не хватает деталей!`);
            }
            current = Math.min(max, current + 1);
        } else {
            current = Math.max(0, current - 1);
        }
        
        const updates = {"system.progress": current};
        if (current >= max && isFunded) {
            updates["system.isCompleted"] = true;
            ui.notifications.info(`Постройка "${item.name}" завершена!`);
        }
        await item.update(updates);
    });

    html.find('.item-create').click(this._onItemCreate.bind(this));
    
    html.find('.item-edit').click(ev => {
        const li = $(ev.currentTarget).closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (item) item.sheet.render(true);
    });
    
    html.find('.item-delete').click(async ev => {
        const li = $(ev.currentTarget).closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (item) {
             Dialog.confirm({
                title: "Удалить?",
                content: `<p>Удалить <strong>${item.name}</strong>?</p>`,
                yes: () => item.delete()
            });
        }
    });
  }

  async _onAddWorker(projectItem) {
      const residentIds = this.actor.system.residents || [];
      if (residentIds.length === 0) {
          return ui.notifications.warn("В убежище нет жителей!");
      }

      // 1. Собираем карту занятости СО ВСЕХ ПРОЕКТОВ (и активных, и готовых)
      const busyMap = {}; 
      
      // Фильтруем все предметы типа upgrade/project, у которых есть рабочие
      const allJobs = this.actor.items.filter(i => 
          (i.type === 'upgrade' || i.type === 'project') && i.system.workers && i.system.workers.length > 0
      );

      allJobs.forEach(p => {
          // Если это ТОТ ЖЕ проект, в который мы добавляем, не считаем его "занятым в другом месте"
          if (p.id === projectItem.id) return;

          p.system.workers.forEach(wid => {
              busyMap[wid] = p.name; // Запоминаем, где работает житель
          });
      });

      // 2. Формируем список опций
      let optionsHtml = "";
      let availableCount = 0;

      for (let rid of residentIds) {
          const actor = game.actors.get(rid);
          if (!actor) continue;

          // Если уже работает над ЭТИМ проектом - не показываем в списке (он уже там)
          const currentWorkers = projectItem.system.workers || [];
          if (currentWorkers.includes(rid)) continue;

          const isBusy = busyMap[rid];
          const disabled = isBusy ? "disabled" : "";
          const busyText = isBusy ? ` (Занят: ${isBusy})` : "";
          const style = isBusy ? "color:gray;" : "color:black; font-weight:bold;";

          optionsHtml += `<option value="${rid}" ${disabled} style="${style}">
                            ${actor.name}${busyText}
                          </option>`;
          
          if (!isBusy) availableCount++;
      }

      if (!optionsHtml) {
          return ui.notifications.warn("Все жители уже работают здесь или список пуст.");
      }
      
      new Dialog({
          title: `Назначить на: ${projectItem.name}`,
          content: `
            <form>
                <div class="form-group">
                    <label>Выберите жителя:</label>
                    <select id="worker-select" style="width:100%;">${optionsHtml}</select>
                </div>
                ${availableCount === 0 ? '<p style="color:red; font-size:0.8em;">Все жители заняты на других объектах!</p>' : ''}
            </form>
          `,
          buttons: {
              assign: {
                  label: "Назначить",
                  icon: '<i class="fas fa-check"></i>',
                  callback: async (html) => {
                      const workerId = html.find("#worker-select").val();
                      if (workerId) {
                          const currentWorkers = projectItem.system.workers || [];
                          const newWorkers = [...currentWorkers, workerId];
                          await projectItem.update({"system.workers": newWorkers});
                          ui.notifications.info("Работник назначен.");
                      }
                  }
              }
          }
      }).render(true);
  }

  async _onDrop(event) {
      const data = TextEditor.getDragEventData(event);
      if (data.type === "Actor") {
          const droppedActor = await Actor.fromDropData(data);
          if (!droppedActor) return;
          const residents = this.actor.system.residents || [];
          if (!residents.includes(droppedActor.id)) {
              residents.push(droppedActor.id);
              await this.actor.update({"system.residents": residents});
              ui.notifications.info(`${droppedActor.name} поселился в убежище.`);
          }
      } else {
          super._onDrop(event);
      }
  }

  async _contributeParts(item) {
      if (!item.system.workers || item.system.workers.length === 0) {
          return ui.notifications.warn("Нельзя вносить ресурсы: на проект не назначены работники!");
      }

      const needed = item.system.partsCost;
      const paid = item.system.partsPaid;
      const remaining = needed - paid;
      
      if (remaining <= 0) return ui.notifications.info("Все ресурсы уже внесены.");

      // Защита на чтение ресурсов
      const partsRes = this.actor.system.resources?.parts;
      const shelterParts = partsRes ? partsRes.value : 0;

      if (shelterParts <= 0) return ui.notifications.warn("На складе нет деталей.");

      new Dialog({
          title: "Вложить детали",
          content: `<p>На складе: ${shelterParts}</p><p>Нужно: ${remaining}</p><input type="number" id="amount" value="${Math.min(remaining, shelterParts)}">`,
          buttons: {
              ok: {
                  label: "Внести",
                  callback: async (html) => {
                      const amount = Number(html.find("#amount").val());
                      if (amount > 0 && amount <= shelterParts) {
                          await this.actor.update({"system.resources.parts.value": shelterParts - amount});
                          await item.update({"system.partsPaid": paid + amount});
                          ui.notifications.info(`Внесено ${amount} деталей.`);
                      }
                  }
              }
          }
      }).render(true);
  }

  async _onEndDay() {
      if (!game.user.isGM) return ui.notifications.warn("Только ГМ может завершить день.");
      Dialog.confirm({
          title: "Завершить день?",
          content: "<p>Будут списаны ресурсы и обновлены жители. Запустить?</p>",
          yes: async () => this._processEndDay()
      });
  }

  async _processEndDay() {
      const system = this.actor.system;
      const residentIds = system.residents || [];
      const pop = residentIds.length;
      
      // ЧТЕНИЕ РЕСУРСОВ
      const res = system.resources || {};
      let food = res.food?.value || 0;
      let fuel = res.fuel?.value || 0;
      let parts = res.parts?.value || 0;
      let antibiotics = res.antibiotics ? res.antibiotics.value : 0;
      
      let morale = system.morale?.value || 50;
      let trend = system.morale?.trend || 0;

      const foodNeed = pop * 3; 
      const fuelNeed = res.fuel?.daily || 5;

      // ====================================================
      // 1. ТРИПУНКТ (TRIAGE) - ДИАЛОГ
      // ====================================================
      const infectedResidents = [];
      for (let rid of residentIds) {
          const a = game.actors.get(rid);
          if (a && a.system.resources.infection.stage > 0) infectedResidents.push(a);
      }

      let distributionMap = {}; // ID -> Boolean
      let usedPills = 0;

      if (infectedResidents.length > 0) {
           await new Promise(resolve => {
               let html = `
               <div style="margin-bottom:10px;">
                   <p><b>На складе:</b> ${antibiotics} антибиотиков.</p>
                   <p>Выберите получателей (Вирус не уйдет ниже 1 стадии):</p>
                   <hr>
                   <div style="display:grid; grid-template-columns: 1fr 50px; gap:5px; max-height:200px; overflow-y:auto;">
               `;
               
               infectedResidents.forEach(res => {
                   const stage = res.system.resources.infection.stage;
                   const color = stage >= 3 ? "red" : (stage === 2 ? "orange" : "black");
                   const label = stage === 1 ? "Инкубация" : (stage === 2 ? "Симптомы" : "КРИЗИС");
                   
                   html += `
                       <div style="display:flex; align-items:center;">
                           <img src="${res.img}" width="24" height="24" style="margin-right:5px; border:1px solid #333;">
                           <span style="font-weight:bold; color:${color};">${res.name} (Ст. ${stage} - ${label})</span>
                       </div>
                       <input type="checkbox" name="pill_${res.id}" class="pill-check" ${antibiotics > 0 ? "" : "disabled"}>
                   `;
               });
               html += `</div></div>`;

               new Dialog({
                   title: "Медицинский Трипункт",
                   content: html,
                   buttons: {
                       ok: {
                           label: "Распределить",
                           icon: '<i class="fas fa-pills"></i>',
                           callback: (dlg) => {
                               dlg.find('.pill-check').each((i, el) => {
                                   if (el.checked) {
                                       const id = el.name.split('_')[1];
                                       distributionMap[id] = true;
                                       usedPills++;
                                   }
                               });
                               resolve();
                           }
                       }
                   },
                   default: "ok",
                   close: () => resolve()
               }).render(true);
           });
      }

      if (usedPills > 0) {
          antibiotics = Math.max(0, antibiotics - usedPills);
      }

      // ====================================================
      // 2. ПОДГОТОВКА СООБЩЕНИЙ (ПУБЛИЧНОЕ И ГМ)
      // ====================================================
      let publicHtml = `<div class="z-chat-card"><div class="z-card-header">📅 ДЕНЬ ЗАВЕРШЕН</div>`;
      publicHtml += `<div style="font-size:0.9em; margin-bottom:10px;">Население: ${pop}</div>`;

      let gmHtml = `<div class="z-chat-card" style="border:1px solid red;"><div class="z-card-header" style="color:red;">👮 GM REPORT (Секретно)</div>`;
      gmHtml += `<div>Антибиотиков выдано: ${usedPills}</div>`;

      // --- СПИСАНИЕ ЕДЫ И ТОПЛИВА ---
      let hasFood = true;
      let hasFuel = true;

      if (food >= foodNeed) {
          food -= foodNeed;
          publicHtml += `<div style="color:green">🍴 Еда: -${foodNeed} (Ост: ${food})</div>`;
      } else {
          food = 0;
          hasFood = false;
          trend -= 10; 
          publicHtml += `<div style="color:red; font-weight:bold;">🍴 ГОЛОД! Еды не хватило! (-10 Морали)</div>`;
      }

      if (fuel >= fuelNeed) {
          fuel -= fuelNeed;
          publicHtml += `<div style="color:green">⛽ Топливо: -${fuelNeed} (Ост: ${fuel})</div>`;
      } else {
          fuel = 0;
          hasFuel = false;
          trend -= 5; 
          publicHtml += `<div style="color:red;">⚠️ Нет топлива! (-5 Морали)</div>`;
      }

      // --- ПОСТРОЙКИ (С ПРОВЕРКОЙ РАБОЧИХ) ---
      const completedItems = this.actor.items.filter(i => (i.type === 'upgrade' || i.type === 'project') && i.system.isCompleted);
      
      if (completedItems.length > 0) {
          publicHtml += `<hr><div style="font-weight:bold;">Инфраструктура:</div><ul>`;
          
          for (let item of completedItems) {
              const bVal = Number(item.system.bonusValue) || 0;
              const bType = item.system.bonusType;

              // ПРОВЕРКА РАБОЧИХ
              const minWorkers = Number(item.system.minPeople) || 0;
              const currentWorkers = item.system.workers ? item.system.workers.length : 0;
              
              if (minWorkers > 0 && currentWorkers < minWorkers) {
                  publicHtml += `<li style="color:#777; text-decoration:line-through;">${item.name}: Не работает (нужно ${minWorkers} чел.)</li>`;
                  continue; // Пропускаем начисление бонуса
              }

              // Начисление бонусов
              let bonusText = "";
              if (bType === 'food') { food += bVal; bonusText = `+${bVal} Еды`; }
              else if (bType === 'fuel') { fuel += bVal; bonusText = `+${bVal} Топлива`; }
              else if (bType === 'parts') { parts += bVal; bonusText = `+${bVal} Деталей`; }
              else if (bType === 'morale') { morale += bVal; bonusText = `+${bVal} Морали`; }
              
              if (item.system.outputItem) {
                   const newItemType = bType === 'medicine' ? 'medicine' : 'misc';
                   const exist = this.actor.items.find(i => i.name === item.system.outputItem && i.type === newItemType);
                   if (exist) {
                       await exist.update({"system.quantity": exist.system.quantity + bVal});
                   } else {
                       await Item.create({
                          name: item.system.outputItem,
                          type: newItemType,
                          system: { quantity: bVal, category: newItemType }
                       }, { parent: this.actor });
                   }
                   bonusText = `+${bVal} ${item.system.outputItem}`;
              }

              if (!bonusText && bType === 'defense') bonusText = "Активно (Защита)";
              
              publicHtml += `<li>${item.name}: ${bonusText || "Активно"}</li>`;
          }
          publicHtml += `</ul>`;
      }

      // --- СОСТОЯНИЕ ЖИТЕЛЕЙ (ТОЛЬКО В GM REPORT) ---
      gmHtml += `<hr><div style="font-weight:bold;">Состояние выживших:</div><ul style="font-size:0.85em;">`;
      
      for (let rid of residentIds) {
          const actor = game.actors.get(rid);
          if (!actor) continue;

          const gotPill = distributionMap[actor.id] || false;

          const report = await actor.applyDailyUpdate({ 
              hasFood: hasFood, 
              isSheltered: true, 
              antibioticGiven: gotPill 
          });
          
          if (report) {
              let statuses = [];
              if (report.healed > 0) statuses.push(`<span style="color:green">+${report.healed} HP</span>`);
              if (report.msg.length > 0) statuses.push(report.msg.join(", "));
              
              gmHtml += `<li><b>${actor.name}</b>: ${statuses.length ? statuses.join(" | ") : "ОК"}</li>`;
          }
      }
      gmHtml += `</ul></div>`;

      // --- ФИНАЛИЗАЦИЯ ---
      morale = morale + trend;
      morale = Math.max(0, Math.min(100, morale));
      
      publicHtml += `<hr><div style="text-align:right; font-weight:bold;">Мораль: ${morale} (Тренд: ${trend})</div></div>`;

      await this.actor.update({
          "system.resources.food.value": food,
          "system.resources.fuel.value": fuel,
          "system.resources.parts.value": parts,
          "system.resources.antibiotics.value": antibiotics,
          "system.morale.value": morale
      });

      // ОТПРАВКА ДВУХ СООБЩЕНИЙ
      
      // 1. Публичное
      ChatMessage.create({
          user: game.user.id,
          content: publicHtml,
          speaker: ChatMessage.getSpeaker({ actor: this.actor })
      });

      // 2. ГМ (Whisper)
      ChatMessage.create({
          user: game.user.id,
          content: gmHtml,
          whisper: ChatMessage.getWhisperRecipients("GM"),
          speaker: { alias: "System" }
      });
  }

  async _onItemCreate(event) {
      event.preventDefault();
      const header = event.currentTarget;
      let type = header.dataset.type;

      if (type === "select") {
          const types = {
              weapon: "Оружие", armor: "Броня", ammo: "Патроны",
              medicine: "Медицина", food: "Еда", materials: "Материалы",
              luxury: "Роскошь", misc: "Разное", resource: "Ресурс"
          };
          let options = "";
          for (let [k, v] of Object.entries(types)) options += `<option value="${k}">${v}</option>`;

          new Dialog({
              title: "Создать предмет",
              content: `<form><div class="form-group"><label>Тип:</label><select id="type-select">${options}</select></div></form>`,
              buttons: {
                  create: {
                      label: "Создать",
                      callback: async (html) => {
                          const selectedType = html.find("#type-select").val();
                          const itemData = { 
                              name: `Новое ${types[selectedType]}`, 
                              type: selectedType, 
                              system: { 
                                  category: (selectedType==="materials"||selectedType==="resource")?"materials": (selectedType==="armor")?"armor":"misc" 
                              } 
                          };
                          await Item.create(itemData, { parent: this.actor });
                      }
                  }
              },
              default: "create"
          }).render(true);
          return;
      }

      const itemData = { name: `Новый ${type}`, type: type };
      return await Item.create(itemData, {parent: this.actor});
  }
}