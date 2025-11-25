export class ZItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "item"],
      template: "systems/zsystem/sheets/item-sheet.hbs",
      width: 520,
      height: 550,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }]
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    context.system = this.item.system;
    
    const lockedTypes = ["weapon", "armor"];
    context.isCategoryEditable = !lockedTypes.includes(this.item.type);
    context.weaponTypes = { melee: "Ближнее", ranged: "Дальнее" };
    context.handsOptions = { "1h": "Одноручное", "2h": "Двуручное" };

    context.damageTypes = {
      blunt: "Дробящий (Blunt)",
      slashing: "Режущий (Slashing)",
      piercing: "Колющий (Piercing)",
      ballistic: "Пулевой (Ballistic)",
      fire: "Огонь (Fire)"
    };
    
    context.categoryOptions = {
      medicine: "Медицина", food: "Еда", materials: "Материалы",
      luxury: "Роскошь", misc: "Разное"
    };

    context.weaponSubtypes = {
      melee_blunt: "Ближнее (Дробящее)", melee_blade: "Ближнее (Режущее)",
      pistol: "Пистолет", rifle: "Винтовка", shotgun: "Дробовик", special: "Особое"
    };

    context.armorLocations = {
      head: "Голова", torso: "Торс", arms: "Руки", legs: "Ноги", full: "Полный костюм"
    };
    
    context.skillsList = {
        mechanical: "Механика", science: "Наука", medical: "Медицина",
        survival: "Выживание", leadership: "Лидерство"
    };

    // Бонусы для построек
     context.bonusTypes = {
        none: "Нет эффекта",
        morale: "Мораль (Повышение)",
        food: "Еда (Производство)",
        fuel: "Топливо (Производство)",
        parts: "Детали (Производство)",
        defense: "Защита (Пассивный)",
        medicine: "Медицина (Крафт)"
    };
    
    return context;
  }
  
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find('.attack-create').click(async ev => {
      ev.preventDefault();
      const newKey = foundry.utils.randomID();
      const newAttack = { name: "Новая атака", ap: 4, dmg: "1d6", noise: 5, mod: 0 };
      await this.item.update({ [`system.attacks.${newKey}`]: newAttack });
    });

    html.find('.attack-delete').click(async ev => {
      ev.preventDefault();
      const key = ev.currentTarget.dataset.key;
      await this.item.update({ [`system.attacks.-=${key}`]: null });
    });
  }
}