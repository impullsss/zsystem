export class ZContainerSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "container"],
      template: "systems/zsystem/sheets/container-sheet.hbs",
      width: 500,
      height: 600,
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system;
    
    // Определяем, заблокирован ли контейнер (на будущее, для механики взлома)
    context.isLocked = this.actor.getFlag("zsystem", "isLocked") || false;

    this._prepareItems(context);
    return context;
  }

  _prepareItems(context) {
    const inventory = {
      weapon: { label: "Оружие", items: [] },
      ammo: { label: "Патроны", items: [] },
      armor: { label: "Броня", items: [] },
      medicine: { label: "Медицина", items: [] },
      food: { label: "Еда", items: [] },
      materials: { label: "Материалы", items: [] },
      misc: { label: "Разное", items: [] }
    };

    for (let i of this.actor.items) {
      // Используем логику категорий из предмета или 'misc'
      let cat = i.system.category || "misc";
      
      // Небольшой фоллбек, если категория не прописана
      if (i.type === "weapon") cat = "weapon";
      if (i.type === "ammo") cat = "ammo";
      if (i.type === "armor") cat = "armor";
      if (i.type === "food") cat = "food";
      if (i.type === "medicine") cat = "medicine";
      if (i.type === "resource") cat = "materials";

      if (inventory[cat]) inventory[cat].items.push(i);
      else inventory.misc.items.push(i);
    }
    context.inventory = inventory;
  }

  activateListeners(html) {
    // V13 Strict: Получаем чистый DOM элемент или jQuery wrapper
    let rootElement = html;
    if (html instanceof jQuery) rootElement = html[0];

    super.activateListeners(html);

    if (!this.isEditable) return;

    // Используем jQuery для удобства навешивания событий, так как V13 это допускает,
    // главное - правильно передать контекст выше.
    const $html = $(rootElement);

    // Удаление предмета
    $html.find('.item-delete').click(async ev => {
        const li = $(ev.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("itemId"));
        if (item) {
             Dialog.confirm({
                title: "Выбросить/Удалить?",
                content: `<p>Удалить <strong>${item.name}</strong> из контейнера?</p>`,
                yes: () => item.delete()
            });
        }
    });

    // Редактирование предмета (просмотр)
    $html.find('.item-edit').click(ev => {
        const li = $(ev.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("itemId"));
        item.sheet.render(true);
    });

    // Создание предмета (для GM, чтобы быстро наполнять лут)
    $html.find('.item-create').click(async ev => {
        const type = ev.currentTarget.dataset.type || "misc";
        await Item.create({ name: `New ${type}`, type: type }, { parent: this.actor });
    });
  }
}