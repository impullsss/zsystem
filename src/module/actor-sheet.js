import { ZActor } from "./actor.js";

export class ZActorSheet extends ActorSheet {
  
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['zsystem', 'sheet', 'actor'],
      template: 'systems/zsystem/sheets/actor-sheet.hbs', 
      width: 800,
      height: 750,
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.sheet-body', initial: 'attributes' }]
    });
  }

  getData() {
    const context = super.getData();
    // Защита: если system нет, берем пустой объект
    context.system = this.actor.system || {};
    
    context.isGM = game.user.isGM; 
    
    // ЗАЩИТА ОТ ОШИБОК ЗДЕСЬ: используем ?. (optional chaining)
    // Если effects нет, вернет false.
    context.isProne = this.actor.effects?.some(e => e.statuses.has("prone")) || false;
    
    // ЗАЩИТА ОТ ОШИБОК ЗДЕСЬ:
    // Проверяем resources?.hp?.value. Если чего-то нет, считаем HP = 0 (мертв) или 1 (жив) по ситуации.
    // Используем (val ?? 0), чтобы null/undefined стали 0.
    const currentHP = this.actor.system.resources?.hp?.value ?? 0;
    context.isDead = currentHP <= 0;

    this._prepareInventory(context);
    
    // Защита для эффектов
    context.effects = (this.actor.effects || []).map(e => ({
      id: e.id,
      name: e.name,
      img: e.img,
      disabled: e.disabled,
      duration: e.duration?.label || "",
      isTemporary: e.isTemporary 
    }));

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
      misc: { label: "Разное", items: [] }
    };

    // Защита: если items нет
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

    // Кнопка Встать
    html.find('.stand-up-btn').click(ev => this.actor.standUp());
    
    // Кнопка Отдых
    html.find('.rest-btn').click(ev => {
        Dialog.confirm({
            title: "Ночной отдых",
            content: "Отдохнуть и восстановить силы (снимает штрафы ХП)?",
            yes: () => this.actor.longRest()
        });
    });

    // Кнопка Зомбификация (GM)
    html.find('.zombie-rise-btn').click(ev => {
        Dialog.confirm({
            title: "Восстать из мертвых?",
            content: "Персонаж станет зомби-NPC.",
            yes: () => this.actor.riseAsZombie()
        });
    });
    
    // Использование медицины
    html.find('.item-use').click(ev => {
        const li = $(ev.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("itemId"));
        if (item.type === "medicine") this.actor.useMedicine(item);
    });

    html.find('.ap-reset').click(async ev => { 
        const max = this.actor.system.resources?.ap?.max || 0;
        await this.actor.update({"system.resources.ap.value": max}); 
    });

    html.find('.skill-roll').click(ev => {
      const skillKey = $(ev.currentTarget).closest('.skill-row').data('skill');
      this.actor.rollSkill(skillKey);
    });

    // --- Inventory ---
    html.find('.item-create').click(this._onItemCreate.bind(this));
    
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    html.find('.item-delete').click(async ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      Dialog.confirm({
        title: "Удалить?",
        content: `<p>Удалить <strong>${item.name}</strong>?</p>`,
        yes: () => item.delete()
      });
    });

    html.find('.item-roll').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.performAttack(li.data("itemId"));
    });

    html.find('.item-toggle').click(async ev => {
      ev.preventDefault();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      await item.update({ "system.equipped": !item.system.equipped });
    });
    
    html.find('.item-reload').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      this.actor.reloadWeapon(item);
    });

     // Кнопка Полного лечения (GM)
    html.find('.full-heal-btn').click(async ev => {
        Dialog.confirm({
            title: "Полное исцеление",
            content: "Восстановить всё ХП, конечности и снять все травмы?",
            yes: () => this.actor.fullHeal()
        });
    });

    html.find('.effect-control').click(ev => this._onManageEffect(ev));
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    
    let cat = "misc";
    if (type === "weapon") cat = "weapon";
    if (type === "ammo") cat = "ammo";
    if (type === "armor") cat = "armor";
    if (type === "food") cat = "food";

    const typeNames = {
        weapon: "Оружие", armor: "Броня", ammo: "Патроны",
        medicine: "Медицина", food: "Еда", misc: "Предмет"
    };

    const itemData = {
      name: `Новое ${typeNames[type] || "Предмет"}`,
      type: type,
      system: { category: cat }
    };
    return await Item.create(itemData, {parent: this.actor});
  }

  async _onManageEffect(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const li = a.closest(".effect-item");
    const effectId = li?.dataset.effectId;

    switch ( a.dataset.action ) {
      case "create":
        return this.actor.createEmbeddedDocuments("ActiveEffect", [{
          name: "Новый эффект", img: "icons/svg/aura.svg", origin: this.actor.uuid, disabled: false
        }]);
      case "edit":
        return this.actor.effects.get(effectId).sheet.render(true);
      case "delete":
        return this.actor.effects.get(effectId).delete();
      case "toggle":
        const eff = this.actor.effects.get(effectId);
        return eff.update({disabled: !eff.disabled});
    }
  }
}