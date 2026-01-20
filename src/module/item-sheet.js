import { GLOBAL_STATUSES } from "./constants.js";
import { AMMO_CALIBRES } from "./constants.js";
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
    context.ammoCalibres = AMMO_CALIBRES;
    const currentAmmo = this.item.system.ammoType;
    const isStandard = Object.keys(AMMO_CALIBRES).includes(currentAmmo);
    context.ammoSelectorValue = isStandard ? currentAmmo : "other";
    context.showCustomAmmoInput = !isStandard || currentAmmo === "other";
    context.isCustomAmmo = currentAmmo && !Object.keys(AMMO_CALIBRES).includes(currentAmmo);

    // СТАНДАРТНЫЕ СПИСКИ
    context.weaponTypes = { melee: "Ближнее", ranged: "Дальнее" };
    context.handsOptions = { "1h": "Одноручное", "2h": "Двуручное" };
    context.damageTypes = {
      blunt: "Дробящий", slashing: "Режущий", piercing: "Колющий",
      ballistic: "Пулевой", fire: "Огонь"
    };
    context.categoryOptions = {
      medicine: "Медицина", food: "Еда", materials: "Материалы",
       fuel: "Топливо", luxury: "Роскошь", misc: "Разное"
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

    context.effects = this.item.effects.map(e => ({
        id: e.id,
        name: e.name,
        img: e.img,
        disabled: e.disabled,
        // Для удобства ГМа выведем список изменений в одну строку
        changes: e.changes.map(c => `${c.key} ${c.mode===2 ? '+' : '='} ${c.value}`).join(", ")
    }));

    context.bonusOptions = {
    "system.attributes.str.mod": "Сила (STR)",
    "system.attributes.agi.mod": "Ловкость (AGI)",
    "system.attributes.vig.mod": "Живучесть (VIG)",
    "system.attributes.per.mod": "Восприятие (PER)",
    "system.attributes.int.mod": "Интеллект (INT)",
    "system.attributes.cha.mod": "Харизма (CHA)",
    "system.resources.hp.max": "Макс. Здоровье (HP)",
    "system.resources.ap.bonus": "Доп. Очки Действия (AP)",
    "system.secondary.carryWeight.mod": "Лимит Веса (+кг)",
    "system.secondary.evasion.mod": "Уклонение (%)",
    "system.secondary.naturalAC.mod": "Природная Броня",
    "system.secondary.meleeDamage.mod": "Доп. урон (Ближний бой)", // НОВОЕ
    // ВСЕ НАВЫКИ
    "system.skills.melee.mod": "Навык: Ближний бой",
    "system.skills.ranged.mod": "Навык: Стрельба",
    "system.skills.science.mod": "Навык: Наука",
    "system.skills.mechanical.mod": "Навык: Механика",
    "system.skills.medical.mod": "Навык: Медицина",
    "system.skills.diplomacy.mod": "Навык: Дипломатия",
    "system.skills.leadership.mod": "Навык: Лидерство",
    "system.skills.survival.mod": "Навык: Выживание",
    "system.skills.athletics.mod": "Навык: Атлетика",
    "system.skills.stealth.mod": "Навык: Скрытность"
};
    const effect = this.item.effects.find(e => e.getFlag("zsystem", "isMainBonus"));
    context.perkBonuses = effect ? effect.changes : [];

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

    $html.find('.effect-control').click(ev => {
        ev.preventDefault();
        const a = ev.currentTarget;
        const effectId = $(a).closest('.effect-item').data('effectId');
        
        switch (a.dataset.action) {
            case "create":
                return this.item.createEmbeddedDocuments("ActiveEffect", [{
                    name: "Новый эффект: " + this.item.name,
                    icon: this.item.img,
                    origin: this.item.uuid,
                    disabled: false,
                    transfer: true
                }]);
            case "edit":
                return this.item.effects.get(effectId).sheet.render(true);
            case "delete":
                return this.item.effects.get(effectId).delete();
            case "toggle":
                const effect = this.item.effects.get(effectId);
                return effect.update({ disabled: !effect.disabled });
        }
    });

    // Добавить новый бонус в список
    $html.find('.perk-bonus-add').click(async ev => {
        let effect = this.item.effects.find(e => e.getFlag("zsystem", "isMainBonus"));
        
        // Если эффекта-контейнера еще нет - создаем
        if (!effect) {
            const created = await this.item.createEmbeddedDocuments("ActiveEffect", [{
                name: "Passive Bonuses: " + this.item.name,
                icon: this.item.img,
                transfer: true,
                "flags.zsystem.isMainBonus": true,
                changes: []
            }]);
            effect = created[0];
        }

        const newChanges = [...effect.changes, { key: "system.attributes.str.mod", mode: 2, value: "1" }];
        await effect.update({ changes: newChanges });
    });

    // Удалить бонус
    $html.find('.perk-bonus-delete').click(async ev => {
        const idx = ev.currentTarget.dataset.idx;
        const effect = this.item.effects.find(e => e.getFlag("zsystem", "isMainBonus"));
        if (!effect) return;

        const newChanges = effect.changes.filter((_, i) => i != idx);
        await effect.update({ changes: newChanges });
    });

    // Изменить ключ или значение
    $html.find('.perk-bonus-change').change(async ev => {
        const idx = ev.currentTarget.dataset.idx;
        const field = ev.currentTarget.dataset.field; // "key" или "value"
        let val = ev.currentTarget.value;
        
        const effect = this.item.effects.find(e => e.getFlag("zsystem", "isMainBonus"));
        const newChanges = effect.toObject().changes;

        newChanges[idx][field] = (field === "value") ? String(val) : val;
        
        await effect.update({ changes: newChanges });
    });

    html.find('.ammo-selector').change(async ev => {
    const val = ev.target.value;
    if (val === "other") {
        // Просто перерисовываем, чтобы появилось поле ввода
        await this.item.update({"system.ammoType": "other"});
    } else {
        // Записываем стандартное значение
        await this.item.update({"system.ammoType": val});
    }
});

  }
}