// --- START OF FILE src/module/item-sheet.js ---

import { GLOBAL_STATUSES } from "./constants.js";

export class ZItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "item"],
      template: "systems/zsystem/sheets/item-sheet.hbs",
      width: 650,
      height: 600,
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

    context.bonusTypes = {
        none: "Нет эффекта",
        morale: "Мораль (Повышение)",
        food: "Еда (Производство)",
        fuel: "Топливо (Производство)",
        parts: "Детали (Производство)",
        defense: "Защита (Пассивный)",
        medicine: "Медицина (Крафт)"
    };

    // Статусы для dropdown
    context.statusOptions = { "": "Нет" };
    for (let [key, val] of Object.entries(GLOBAL_STATUSES)) {
        context.statusOptions[key] = val.label;
    }
    
    return context;
  }
  
  activateListeners(html) {
    // --- FIX V13 (FINAL): Чистка jQuery объекта ---
    // Foundry V13 ItemSheet (Legacy) ожидает jQuery.
    // Но если в HBS есть комментарии, html[0] может быть комментарием, вызывая краш.
    // Мы находим саму форму и передаем ЕЁ, обернутую в jQuery.
    
    let $form = null;
    
    // 1. Если это jQuery
    if (html instanceof jQuery) {
        if (html.is("form")) $form = html; // Это уже форма
        else $form = html.find("form");    // Ищем форму внутри
        
        // Если find ничего не дал, возможно html - это коллекция узлов (Top Level nodes)
        if (!$form || $form.length === 0) {
             // Фильтруем коллекцию, ищем узлы-элементы
             const found = html.filter((i, el) => el.nodeType === 1 && el.tagName === "FORM");
             if (found.length > 0) $form = found.eq(0);
        }
    } 
    // 2. Если это DOM (HTMLElement)
    else if (html instanceof HTMLElement) {
        $form = $(html);
    }

    // Если форму так и не нашли (что странно), используем исходный html, но это риск
    const target = ($form && $form.length > 0) ? $form : html;

    try {
        super.activateListeners(target);
    } catch (err) {
        console.error("ZSystem | Ошибка в super.activateListeners:", err);
    }
    // ----------------------------------------

    if (!this.isEditable) return;

    // Используем наш очищенный объект для поиска кнопок
    const $html = target;

    $html.find('.attack-create').click(async ev => {
      ev.preventDefault();
      const newKey = foundry.utils.randomID();
      // Инициализируем атаку с пустым эффектом и нулевым шансом
      const newAttack = { name: "Новая атака", ap: 4, dmg: "1d6", noise: 5, mod: 0, effect: "", chance: 0 };
      await this.item.update({ [`system.attacks.${newKey}`]: newAttack });
    });

    $html.find('.attack-delete').click(async ev => {
      ev.preventDefault();
      const key = ev.currentTarget.dataset.key;
      await this.item.update({ [`system.attacks.-=${key}`]: null });
    });
  }
}