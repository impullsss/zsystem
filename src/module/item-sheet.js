/**
 * Класс Листа Предмета (Item Sheet)
 */
export class ZItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "item"],
      template: "systems/zsystem/sheets/item-sheet.hbs",
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    context.system = this.item.system;
    
    // Флаг редактирования категории
    const lockedTypes = ["weapon", "armor"];
    context.isCategoryEditable = !lockedTypes.includes(this.item.type);
    context.weaponTypes = { melee: "Ближнее", ranged: "Дальнее" };
    context.handsOptions = { "1h": "Одноручное", "2h": "Двуручное" };

    // --- СПИСКИ ОПЦИЙ ДЛЯ ВЫПАДАЮЩИХ МЕНЮ ---
        // НОВОЕ: Типы урона

    context.damageTypes = {
      blunt: "Дробящий (Blunt)",
      slashing: "Режущий (Slashing)",
      piercing: "Колющий (Piercing)",
      ballistic: "Пулевой (Ballistic)",
      fire: "Огонь (Fire)"
    };
    
    // 1. Категории (для consumable, misc и т.д.)
    context.categoryOptions = {
      medicine: "Медицина",
      food: "Еда",
      materials: "Материалы",
      luxury: "Роскошь",
      misc: "Разное"
    };

    // 2. Подтипы оружия
    context.weaponSubtypes = {
      melee_blunt: "Ближнее (Дробящее)",
      melee_blade: "Ближнее (Режущее)",
      pistol: "Пистолет",
      rifle: "Винтовка",
      shotgun: "Дробовик",
      special: "Особое"
    };

    // 3. Части тела (для брони)
    context.armorLocations = {
      head: "Голова",
      torso: "Торс",
      arms: "Руки",
      legs: "Ноги",
      full: "Полный костюм"
    };
    
    return context;
  }
   activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // === УПРАВЛЕНИЕ АТАКАМИ ===
    
    // Добавить атаку
    html.find('.attack-create').click(async ev => {
      ev.preventDefault();
      // Генерируем случайный ID
      const newKey = foundry.utils.randomID();
      // Создаем новую пустую атаку
      const newAttack = {
        name: "Новая атака",
        ap: 4,
        dmg: "1d6",
        noise: 5,
        mod: 0
      };
      // Записываем в system.attacks.[ID]
      await this.item.update({ [`system.attacks.${newKey}`]: newAttack });
    });

    // Удалить атаку
    html.find('.attack-delete').click(async ev => {
      ev.preventDefault();
      const key = ev.currentTarget.dataset.key;
      // Удаляем ключ (специальный синтаксис -=key для удаления ключа в MongoDB/Foundry)
      await this.item.update({ [`system.attacks.-=${key}`]: null });
    });
  }
}