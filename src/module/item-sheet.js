import { GLOBAL_STATUSES } from "./constants.js";

export class ZItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "item"],
      template: "systems/zsystem/sheets/item-sheet.hbs",
      width: 650,
      height: 650,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "details",
        },
      ],
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.item.system;

    context.isHybrid =
      this.item.type === "weapon" &&
      this.item.system.weaponType === "melee" &&
      this.item.system.isThrowing;

    context.isCategoryEditable = !["weapon", "armor"].includes(this.item.type);
    
    // СТАНДАРТНЫЕ СПИСКИ
    context.weaponTypes = { melee: "Ближнее", ranged: "Дальнее" };
    context.handsOptions = { "1h": "Одноручное", "2h": "Двуручное" };
    context.damageTypes = {
      blunt: "Дробящий", slashing: "Режущий", piercing: "Колющий",
      ballistic: "Пулевой", fire: "Огонь"
    };
    context.categoryOptions = {
      medicine: "Медицина", food: "Еда", materials: "Материалы",
      luxury: "Роскошь", misc: "Разное"
    };

    // --- ИСПРАВЛЕНИЕ ОШИБКИ: ДОБАВЛЯЕМ СПИСКИ ДЛЯ ПОСТРОЕК ---
    context.skillsList = { 
        melee: "Ближний бой", ranged: "Стрельба", science: "Наука", 
        mechanical: "Механика", medical: "Медицина", diplomacy: "Дипломатия",
        leadership: "Лидерство", survival: "Выживание", athletics: "Атлетика",
        stealth: "Скрытность"
    };

    context.bonusTypes = {
        food: "Еда",
        fuel: "Топливо",
        parts: "Детали",
        morale: "Мораль",
        defense: "Защита",
        medicine: "Медицина (Крафт)"
    };
    // ---------------------------------------------------------

    context.statusOptions = { "": "Нет" };
    for (let [key, val] of Object.entries(GLOBAL_STATUSES))
      context.statusOptions[key] = val.label;

    return context;
  }

  activateListeners(html) {
    let $form = null;
    if (html instanceof jQuery) {
      if (html.is("form")) $form = html;
      else $form = html.find("form");
      if (!$form || $form.length === 0) {
        const found = html.filter(
          (i, el) => el.nodeType === 1 && el.tagName === "FORM"
        );
        if (found.length > 0) $form = found.eq(0);
      }
    } else if (html instanceof HTMLElement) {
      $form = $(html);
    }
    const target = $form && $form.length > 0 ? $form : html;

    super.activateListeners(target);
    if (!this.isEditable) return;
    const $html = target;

    $html.find(".generate-hybrid").click(async (ev) => {
      ev.preventDefault();
      const baseAP = this.item.system.apCost || 3;
      const baseDmg = this.item.system.damage || "1d6";
      const baseNoise = this.item.system.noise || 0;

      const attacks = {
        [foundry.utils.randomID()]: {
          name: "Удар", mode: "melee", ap: baseAP, dmg: baseDmg,
          mod: 0, noise: baseNoise, chance: 0,
        },
        [foundry.utils.randomID()]: {
          name: "Бросок", mode: "throw", ap: baseAP, dmg: baseDmg,
          mod: 0, noise: baseNoise, chance: 0,
        },
      };
      await this.item.update({ "system.attacks": attacks });
    });

    $html.find(".attack-create").click(async (ev) => {
      ev.preventDefault();
      const newKey = foundry.utils.randomID();
      const newAttack = {
        name: "Новая атака", ap: 4, dmg: "1d6", noise: 5,
        mod: 0, effect: "", chance: 0,
      };
      await this.item.update({ [`system.attacks.${newKey}`]: newAttack });
    });

    $html.find(".attack-delete").click(async (ev) => {
      ev.preventDefault();
      const key = ev.currentTarget.dataset.key;
      await this.item.update({ [`system.attacks.-=${key}`]: null });
    });
  }
}