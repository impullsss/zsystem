export class ZShelterSheet extends ActorSheet {
  
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
        const newWorkers = item.system.workers.filter(id => id !== workerId);
        await item.update({"system.workers": newWorkers});
    });
    
    html.find('.remove-resident').click(async ev => {
        const workerId = ev.currentTarget.dataset.id;
        const newResidents = this.actor.system.residents.filter(id => id !== workerId);
        await this.actor.update({"system.residents": newResidents});
    });

    html.find('.progress-control').click(async ev => {
        const action = ev.currentTarget.dataset.action;
        const li = $(ev.currentTarget).closest(".item");
        const item = this.actor.items.get(li.data("itemId"));
        
        if (!item.system.workers || item.system.workers.length === 0) {
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
      const residents = this.actor.system.residents || [];
      const busyMap = {}; 
      this.actor.items.filter(i => (i.type === 'upgrade' || i.type === 'project') && !i.system.isCompleted).forEach(p => {
          (p.system.workers || []).forEach(wid => {
              busyMap[wid] = p.name;
          });
      });

      let optionsHtml = "";
      for (let rid of residents) {
          const actor = game.actors.get(rid);
          if (!actor) continue;
          const isBusy = busyMap[rid];
          const disabled = isBusy ? "disabled" : "";
          const label = actor.name + (isBusy ? ` (Занят: ${isBusy})` : "");
          const currentWorkers = projectItem.system.workers || [];
          if (currentWorkers.includes(rid)) continue;
          optionsHtml += `<option value="${rid}" ${disabled}>${label}</option>`;
      }

      if (!optionsHtml) return ui.notifications.warn("Нет свободных жителей.");

      new Dialog({
          title: `Назначить на: ${projectItem.name}`,
          content: `<form><div class="form-group"><label>Житель:</label><select id="worker-select">${optionsHtml}</select></div></form>`,
          buttons: {
              assign: {
                  label: "Назначить",
                  callback: async (html) => {
                      const workerId = html.find("#worker-select").val();
                      if (workerId) {
                          const currentWorkers = projectItem.system.workers || [];
                          currentWorkers.push(workerId);
                          await projectItem.update({"system.workers": currentWorkers});
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
      const system = this.actor.system;
      const residentIds = system.residents || [];
      const pop = residentIds.length;
      
      // Защита при чтении
      const res = system.resources || {};
      let food = res.food?.value || 0;
      let fuel = res.fuel?.value || 0;
      let parts = res.parts?.value || 0;
      let antibiotics = res.antibiotics?.value || 0;
      
      let morale = system.morale?.value || 50;
      let trend = system.morale?.trend || 0;

      const foodNeed = pop;
      const fuelNeed = res.fuel?.daily || 5;

      let msg = "<h3>Отчет за день</h3><ul>";

      if (food >= foodNeed) {
          food -= foodNeed;
          msg += `<li>Потреблено еды: ${foodNeed} (Жителей: ${pop})</li>`;
      } else {
          food = 0;
          msg += `<li style="color:red">ГОЛОД! (-5 Морали)</li>`;
          morale -= 5;
          trend -= 5;
      }

      if (fuel >= fuelNeed) {
          fuel -= fuelNeed;
          msg += `<li>Потреблено топлива: ${fuelNeed}</li>`;
      } else {
          fuel = 0;
          msg += `<li style="color:red">Нет топлива! (-5 Морали)</li>`;
          morale -= 5;
          trend -= 5;
      }

      const completedItems = this.actor.items.filter(i => (i.type === 'upgrade' || i.type === 'project') && i.system.isCompleted);
      let totalDefense = 0;

      if (completedItems.length > 0) {
          msg += "<li><b>Бонусы:</b></li><ul>";
          for (let item of completedItems) {
              const bVal = Number(item.system.bonusValue) || 0;
              const bType = item.system.bonusType;

              if (bType === 'food') { food += bVal; msg += `<li>${item.name}: +${bVal} Еды</li>`; }
              if (bType === 'fuel') { fuel += bVal; msg += `<li>${item.name}: +${bVal} Топлива</li>`; }
              if (bType === 'parts') { parts += bVal; msg += `<li>${item.name}: +${bVal} Деталей</li>`; }
              if (bType === 'defense') { totalDefense += bVal; } 
              
              if (bType === 'morale') { 
                  morale += bVal; 
                  msg += `<li>${item.name}: +${bVal} Морали</li>`; 
              }

              if (bType === 'medicine' && item.system.outputItem) {
                  const newItemData = {
                      name: item.system.outputItem,
                      type: "medicine",
                      system: { quantity: bVal, category: "medicine" }
                  };
                  await Item.create(newItemData, { parent: this.actor });
                  msg += `<li>${item.name}: Создано ${bVal} шт. "${item.system.outputItem}"</li>`;
              }
          }
          msg += "</ul>";
      }

      morale = morale + trend;
      morale = Math.max(0, Math.min(100, morale));
      
      msg += `<li><b>Тренд:</b> ${trend > 0 ? '+' : ''}${trend}</li>`;
      msg += `<li><b>Итог Морали:</b> ${morale}</li></ul>`;

      await this.actor.update({
          "system.resources.food.value": food,
          "system.resources.fuel.value": fuel,
          "system.resources.parts.value": parts,
          "system.resources.defense.value": totalDefense,
          "system.morale.value": morale
      });

      ChatMessage.create({ content: msg });
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