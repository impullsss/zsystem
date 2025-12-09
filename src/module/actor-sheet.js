import { ZActor } from "./actor.js";

export class ZActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "actor"],
      template: "systems/zsystem/sheets/actor-sheet.hbs",
      width: 800,
      height: 750,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "attributes",
        },
      ],
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system || {};
    context.isGM = game.user.isGM;
    context.isProne =
      this.actor.effects?.some((e) => e.statuses.has("prone")) || false;

    const currentHP = this.actor.system.resources?.hp?.value ?? 0;

    // ПРАВИЛЬНАЯ ФОРМУЛА СМЕРТИ (Vig * 5)
    const vig = this.actor.system.attributes?.vig?.value || 1;
    const deathThreshold = -(vig * 5);
    context.isDead = currentHP <= deathThreshold;

    context.labels = {
      attributes: {
        str: "СИЛА",
        agi: "ЛОВКОСТЬ",
        vig: "ЖИВУЧЕСТЬ",
        per: "ВОСПРИЯТИЕ",
        int: "ИНТЕЛЛЕКТ",
        cha: "ХАРИЗМА",
      },
      skills: {
        melee: "Ближний бой",
        ranged: "Стрельба",
        science: "Наука",
        mechanical: "Механика",
        medical: "Медицина",
        diplomacy: "Дипломатия",
        leadership: "Лидерство",
        survival: "Выживание",
        athletics: "Атлетика",
        stealth: "Скрытность",
      },
    };

    this._prepareInventory(context);

    context.effects = (this.actor.effects || []).reduce((arr, e) => {
        // Если это инфекция И пользователь не ГМ -> пропускаем
        if (e.flags?.zsystem?.isInfection && !game.user.isGM) {
            return arr;
        }

        arr.push({
            id: e.id,
            name: e.name,
            img: e.img,
            disabled: e.disabled,
            duration: e.duration?.label || "",
            isTemporary: e.isTemporary,
            isHidden: e.flags?.zsystem?.isInfection // Флаг для шаблона, если захочешь подсветить ГМу
        });
        return arr;
    }, []);

    return context;
  }

  _prepareInventory(context) {
    const inventory = {
      weapon: { label: "Оружие", items: [] },
      ammo: { label: "Патроны", items: [] },
      armor: { label: "Броня", items: [] },
      medicine: { label: "Медицина", items: [] },
      food: { label: "Еда", items: [] },
      materials: { label: "Материалы", items: [] },
      luxury: { label: "Роскошь", items: [] },
      misc: { label: "Разное", items: [] },
    };

    const items = this.actor.items || [];
    for (let i of items) {
      let cat = i.system.category || "misc";
      if (i.type === "weapon") cat = "weapon";
      if (i.type === "ammo") cat = "ammo";
      if (i.type === "armor") cat = "armor";
      if (i.type === "food") cat = "food";
      if (i.type === "medicine") cat = "medicine";

      if (inventory[cat]) inventory[cat].items.push(i);
      else inventory.misc.items.push(i);
    }
    context.inventory = inventory;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // --- КНОПКИ УПРАВЛЕНИЯ ---
    html.find(".stand-up-btn").click((ev) => this.actor.standUp());

    html.find(".rest-btn").click((ev) => {
      Dialog.confirm({
        title: "Ночной отдых",
        content: "Отдохнуть и восстановить силы?",
        yes: () => this.actor.longRest(),
      });
    });

    html.find(".zombie-rise-btn").click((ev) => {
      Dialog.confirm({
        title: "Восстать из мертвых?",
        content: "Персонаж станет зомби-NPC.",
        yes: () => this.actor.riseAsZombie(),
      });
    });

    html.find(".ap-reset").click(async (ev) => {
      const max = this.actor.system.resources?.ap?.max || 0;
      await this.actor.update({ "system.resources.ap.value": max });
    });
    html.find(".attr-roll").click((ev) => {
        const key = ev.currentTarget.dataset.key;
        this.actor.rollAttribute(key);
    });
    
    html.find(".skill-roll").click((ev) => {
      const skillKey = $(ev.currentTarget).closest(".skill-row").data("skill");
      this.actor.rollSkill(skillKey);
    });

    // --- ИНВЕНТАРЬ (ЕДИНЫЙ БЛОК) ---

    // 1. Использование (Медицина / Оружие / Редактирование)
    // Мы вешаем один обработчик на .item-use и .inv-slot.item
    // Но чтобы не дублировать логику, разделим классы.

    // Кнопка сердца (Медицина)
    html.find(".item-use").click((ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // Важно, чтобы не всплывало
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item && item.type === "medicine") this.actor.useMedicine(item);
    });

    // Клик по слоту быстрого доступа (ЛКМ)
    html.find(".inv-slot.item").click((ev) => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;

      if (item.type === "weapon") this.actor.performAttack(itemId);
      else if (item.type === "medicine") this.actor.useMedicine(item);
      else item.sheet.render(true);
    });

    // ПКМ по слоту
    html.find(".inv-slot.item").contextmenu((ev) => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    // CRUD Предметов
    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    html.find(".item-delete").click(async (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      Dialog.confirm({
        title: "Удалить?",
        content: `<p>Удалить <strong>${item.name}</strong>?</p>`,
        yes: () => item.delete(),
      });
    });

    html.find(".item-roll").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.performAttack(li.data("itemId"));
    });

    html.find(".item-toggle").click(async (ev) => {
      ev.preventDefault();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      await item.update({ "system.equipped": !item.system.equipped });
    });

    html.find(".item-reload").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      this.actor.reloadWeapon(item);
    });

    html.find(".full-heal-btn").click(async (ev) => {
      Dialog.confirm({
        title: "Полное исцеление",
        content: "Восстановить всё?",
        yes: () => this.actor.fullHeal(),
      });
    });

    html.find(".item-create").click(this._onItemCreate.bind(this));
    html.find(".effect-control").click((ev) => this._onManageEffect(ev));
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;

    if (type === "select") {
      const types = {
        weapon: "Оружие",
        armor: "Броня",
        ammo: "Патроны",
        medicine: "Медицина",
        food: "Еда",
        misc: "Разное",
        resource: "Ресурс",
      };
      let options = "";
      for (let [k, v] of Object.entries(types))
        options += `<option value="${k}">${v}</option>`;

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
                system: { category: selectedType },
              };
              await Item.create(itemData, { parent: this.actor });
            },
          },
        },
        default: "create",
      }).render(true);
      return;
    }
    const itemData = {
      name: `Новый предмет`,
      type: type,
      system: { category: type === "misc" ? "misc" : type },
    };
    return await Item.create(itemData, { parent: this.actor });
  }

  async _onManageEffect(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const li = $(a).closest("[data-effect-id]");
    const effectId = li.data("effectId");

    switch (a.dataset.action) {
      case "create":
        return this.actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "Новый эффект",
            img: "icons/svg/aura.svg",
            origin: this.actor.uuid,
            disabled: false,
          },
        ]);
      case "edit":
        return this.actor.effects.get(effectId)?.sheet.render(true);
      case "delete":
        return this.actor.effects.get(effectId)?.delete();
      case "toggle":
        const effect = this.actor.effects.get(effectId);
        return effect?.update({ disabled: !effect.disabled });
    }
  }
}
