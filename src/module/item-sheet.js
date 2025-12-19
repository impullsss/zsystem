import { GLOBAL_STATUSES } from "./constants.js";

export class ZItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "item"],
      template: "systems/zsystem/sheets/item-sheet.hbs",
      width: 650,
      height: 650,
      tabs: [
        { navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" },
      ],
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.item.system;

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
    context.skillsList = { 
        melee: "Ближний бой", ranged: "Стрельба", science: "Наука", 
        mechanical: "Механика", medical: "Медицина", diplomacy: "Дипломатия",
        leadership: "Лидерство", survival: "Выживание", athletics: "Атлетика",
        stealth: "Скрытность"
    };
    context.bonusTypes = {
        food: "Еда", fuel: "Топливо", parts: "Детали", morale: "Мораль",
        defense: "Защита", medicine: "Медицина (Крафт)"
    };
    context.statusOptions = { "": "Нет" };
    for (let [key, val] of Object.entries(GLOBAL_STATUSES))
      context.statusOptions[key] = val.label;

    context.isHybrid =
      this.item.type === "weapon" &&
      this.item.system.weaponType === "melee" &&
      this.item.system.isThrowing;

    context.isCategoryEditable = !["weapon", "armor"].includes(this.item.type);
    
    // --- ЛОГИКА ДЛЯ ПЕРКОВ ---
    if (this.item.type === 'perk') {
        const reqRaw = context.system.requirements;
        // Гарантируем строку
        const reqString = (reqRaw === null || reqRaw === undefined) ? "" : String(reqRaw);
        
        context.reqList = this._parseReqString(reqString);
        
        context.reqOptions = {
            "str": "Сила", "agi": "Ловкость", "vig": "Живучесть",
            "per": "Восприятие", "int": "Интеллект", "cha": "Харизма",
            ...context.skillsList
        };
    }

    return context;
  }

  // --- ПАРСЕР (СТРОКА -> МАССИВ) ---
  _parseReqString(str) {
      if (!str || typeof str !== 'string') return [];
      
      return str.split(',').reduce((arr, chunk) => {
          let clean = chunk.trim();
          if (!clean) return arr;
          
          const lastSpaceIndex = clean.lastIndexOf(' ');
          if (lastSpaceIndex === -1) return arr;

          const key = clean.substring(0, lastSpaceIndex).trim();
          const valStr = clean.substring(lastSpaceIndex + 1).trim();
          const val = parseInt(valStr);

          if (key && !isNaN(val)) {
              arr.push({ key: key.toLowerCase(), val: val });
          }
          return arr;
      }, []);
  }

  // --- СОХРАНЕНИЕ (МАССИВ -> СТРОКА) ---
  async _saveReqList(list) {
      const str = list.map(r => `${r.key} ${r.val}`).join(", ");
      await this.item.update({"system.requirements": str});
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

    // --- ЛОГИКА ПЕРКОВ ---

    // 1. ДОБАВИТЬ (Через массив!)
    $html.find('.req-add').click(async ev => {
        ev.preventDefault();
        const reqRaw = this.item.system.requirements || "";
        const list = this._parseReqString(String(reqRaw));
        
        // Добавляем объект в массив
        list.push({ key: 'str', val: 1 });
        
        await this._saveReqList(list);
    });

    // 2. УДАЛИТЬ
    $html.find('.req-delete').click(async ev => {
        ev.preventDefault();
        const idx = ev.currentTarget.dataset.idx;
        const reqRaw = this.item.system.requirements || "";
        const list = this._parseReqString(String(reqRaw));
        
        list.splice(idx, 1);
        await this._saveReqList(list);
    });

    // 3. ИЗМЕНИТЬ
    $html.find('.req-change').change(async ev => {
        ev.preventDefault();
        ev.stopPropagation(); // Важно: не даем всплыть событию, чтобы форма не отправила старые данные

        const idx = ev.currentTarget.dataset.idx;
        const field = ev.currentTarget.dataset.field;
        const value = ev.currentTarget.value;
        
        const reqRaw = this.item.system.requirements || "";
        const list = this._parseReqString(String(reqRaw));
        
        if (list[idx]) {
            list[idx][field] = value;
            await this._saveReqList(list);
        }
    });

    // --- ОРУЖИЕ (Без изменений) ---
    $html.find(".generate-hybrid").click(async (ev) => {
      ev.preventDefault();
      const baseAP = this.item.system.apCost || 3;
      const baseDmg = this.item.system.damage || "1d6";
      const attacks = {
        [foundry.utils.randomID()]: { name: "Удар", mode: "melee", ap: baseAP, dmg: baseDmg, mod: 0, noise: 0, chance: 0 },
        [foundry.utils.randomID()]: { name: "Бросок", mode: "throw", ap: baseAP, dmg: baseDmg, mod: 0, noise: 0, chance: 0 },
      };
      await this.item.update({ "system.attacks": attacks });
    });

    $html.find(".attack-create").click(async (ev) => {
      ev.preventDefault();
      const newKey = foundry.utils.randomID();
      await this.item.update({ [`system.attacks.${newKey}`]: { name: "Новая атака", ap: 4, dmg: "1d6", noise: 5, mod: 0 } });
    });

    $html.find(".attack-delete").click(async (ev) => {
      ev.preventDefault();
      const key = ev.currentTarget.dataset.key;
      await this.item.update({ [`system.attacks.-=${key}`]: null });
    });
  }
}