import * as Dice from "./dice.js";

export class ZActor extends Actor {
  
  prepareData() {
    super.prepareData();
  }

  prepareDerivedData() {
    const actorData = this;
    const system = actorData.system;

    // УБРАЛ: if (!system.attributes...) return; 
    // Мы должны идти дальше, чтобы СОЗДАТЬ эти атрибуты, если их нет!

    const getNum = (val) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    // --- 1. АВТО-ПОЧИНКА И ИНИЦИАЛИЗАЦИЯ ---
    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.skills) system.skills = {};
    if (!system.limbs) system.limbs = {}; // Важно для схемы тела

    // Инициализация Атрибутов
    const attrKeys = ['str', 'agi', 'vig', 'per', 'int', 'cha'];
    let spentStats = 0;

    attrKeys.forEach(key => {
        if (!system.attributes[key]) system.attributes[key] = { value: 1 };
        // Ограничиваем 1-10
        const val = Math.min(10, Math.max(1, getNum(system.attributes[key].value) || 1));
        system.attributes[key].value = val;
        spentStats += (val - 1);
    });

    // Сохраняем потраченные очки
    if (!system.secondary.spentStats) system.secondary.spentStats = { value: 0 };
    system.secondary.spentStats.value = spentStats;

    // Удобные ссылки
    const s = {
      str: system.attributes.str.value,
      agi: system.attributes.agi.value,
      vig: system.attributes.vig.value,
      per: system.attributes.per.value,
      int: system.attributes.int.value,
      cha: system.attributes.cha.value
    };

    // --- 2. ВТОРИЧНЫЕ ХАРАКТЕРИСТИКИ ---
    
    // HP: 70 + (Vig-1)*10
    if (!system.resources.hp) system.resources.hp = { value: 70, max: 70 };
    system.resources.hp.max = 70 + (s.vig - 1) * 10;

    // AP: 7 + ceil((Agi-1)/2)
    if (!system.resources.ap) system.resources.ap = { value: 7, max: 7 };
    system.resources.ap.max = 7 + Math.ceil((s.agi - 1) / 2);

    // Вес: 40 + (Str-1)*10
    if (!system.secondary.carryWeight) system.secondary.carryWeight = { value: 0, max: 0 };
    system.secondary.carryWeight.max = 40 + (s.str - 1) * 10;
    
    // Текущий вес
    let totalWeight = 0;
    if (this.items) {
        this.items.forEach(item => {
            totalWeight += (getNum(item.system.weight) * getNum(item.system.quantity));
        });
    }
    system.secondary.carryWeight.value = Math.round(totalWeight * 100) / 100;

    // Natural AC
    let naturalAC = 0;
    if (s.vig >= 10) naturalAC = 5;
    else if (s.vig >= 9) naturalAC = 4;
    else if (s.vig >= 7) naturalAC = 3;
    else if (s.vig >= 5) naturalAC = 2;
    else if (s.vig >= 4) naturalAC = 1;
    
    if (!system.secondary.naturalAC) system.secondary.naturalAC = { value: 0 };
    system.secondary.naturalAC.value = naturalAC;

    // Прочие вторичные
    if (!system.secondary.evasion) system.secondary.evasion = { value: 0 };
    system.secondary.evasion.value = s.agi;
    if (!system.secondary.tenacity) system.secondary.tenacity = { value: 0 };
    system.secondary.tenacity.value = Math.floor(s.vig / 2);
    if (!system.secondary.bravery) system.secondary.bravery = { value: 0 };
    system.secondary.bravery.value = Math.floor((s.cha + s.per) / 2);
    if (!system.resources.learningPoints) system.resources.learningPoints = { value: 0 };

    // --- 3. КОНЕЧНОСТИ (Limbs) ---
    const totalHP = system.resources.hp.max;
    const setLimb = (part, percent) => {
        if (!system.limbs[part]) system.limbs[part] = { value: 0, max: 0 };
        system.limbs[part].max = Math.floor(totalHP * percent);
        // Если текущее значение пустое (новый актор) - лечим его
        if (system.limbs[part].value === undefined || system.limbs[part].value === null) {
            system.limbs[part].value = system.limbs[part].max;
        }
    };
    setLimb('head', 0.20);
    setLimb('torso', 0.45);
    setLimb('lArm', 0.15);
    setLimb('rArm', 0.15);
    setLimb('lLeg', 0.20);
    setLimb('rLeg', 0.20);

    // --- 4. НАВЫКИ ---
    let spentSkills = 0;
    const skillConfig = {
      melee:      { a1: 'str', a2: 'agi' },
      ranged:     { a1: 'agi', a2: 'per' },
      science:    { a1: 'int', a2: 'int', mult: 4 },
      mechanical: { a1: 'agi', a2: 'int' },
      medical:    { a1: 'int', a2: 'per' },
      diplomacy:  { a1: 'cha', a2: 'per' },
      leadership: { a1: 'cha', a2: 'int' },
      survival:   { a1: 'per', a2: 'vig' },
      athletics:  { a1: 'str', a2: 'agi' },
      stealth:    { a1: 'agi', a2: 'per' }
    };

    for (let [key, conf] of Object.entries(skillConfig)) {
      if (!system.skills[key]) system.skills[key] = { base: 0, value: 0, points: 0 };
      const skill = system.skills[key];
      
      if (key === 'science') skill.base = s.int * (conf.mult || 1);
      else skill.base = s[conf.a1] + s[conf.a2];

      const invested = getNum(skill.points);
      spentSkills += invested;
      
      skill.value = Math.min(100, skill.base + invested);
    }
    
    if (!system.secondary.spentSkills) system.secondary.spentSkills = { value: 0 };
    system.secondary.spentSkills.value = spentSkills;
  }

  /** Применение урона */
  async applyDamage(amount, type = "blunt", limb = "torso") {
    let totalResistPercent = 0;
    let totalAC = 0; 
    
    const naturalAC = this.system.secondary?.naturalAC?.value || 0;
    totalAC += naturalAC;

    const armors = this.items.filter(i => i.type === "armor" && i.system.equipped && i.system.coverage && i.system.coverage[limb]);
    
    for (let armor of armors) {
        const res = Number(armor.system.dr[type]) || 0;
        totalResistPercent += res;
        const itemAC = Number(armor.system.ac) || 0;
        totalAC += itemAC;
    }

    totalResistPercent = Math.min(100, totalResistPercent);
    let damageAfterResist = amount * (1 - (totalResistPercent / 100));
    const finalDamage = Math.max(0, Math.floor(damageAfterResist - totalAC));

    const speaker = ChatMessage.getSpeaker({ actor: this });
    let content = `
      <div class="z-damage-result">
        <div style="border-bottom:1px solid #ccc; margin-bottom:5px;">Получен урон: <b>${amount}</b> (${type})</div>
        <div style="font-size:0.9em; color:#444;">
           <div>Резист: ${totalResistPercent}% | AC: -${totalAC}</div>
        </div>
        <hr>
        <div style="font-size:1.3em; font-weight:bold; color:#d32f2f; text-align:center;">
          Потеряно HP: ${finalDamage}
        </div>
        <div style="text-align:center; font-size:0.8em; color:#555;">(${_getLimbName(limb)})</div>
      </div>
    `;
    ChatMessage.create({ user: game.user.id, speaker, content });

    if (finalDamage > 0) {
        const currentHP = this.system.resources.hp.value;
        const newHP = Math.max(0, currentHP - finalDamage);
        const updateData = { "system.resources.hp.value": newHP };
        if (this.system.limbs && this.system.limbs[limb]) {
            const currentLimbHP = this.system.limbs[limb].value;
            updateData[`system.limbs.${limb}.value`] = currentLimbHP - finalDamage;
        }
        await this.update(updateData);
    }
  }
  async reloadWeapon(weapon) {
    const magMax = weapon.system.mag.max;
    const magCur = weapon.system.mag.value;
    const cal = weapon.system.ammoType;
    const apCost = weapon.system.reloadAP || 4; // Дефолт 4 AP

    // 1. Проверки
    if (magCur >= magMax) return ui.notifications.warn("Магазин полон.");
    if (!cal) return ui.notifications.warn("У оружия не указан калибр.");
    
    // Проверка AP
    const curAP = this.system.resources.ap.value;
    if (curAP < apCost) return ui.notifications.warn("Недостаточно AP для перезарядки.");

    // 2. Поиск патронов (тип ammo, поле calibre совпадает)
    // ИЛИ (для простоты) ищем по имени предмета, как мы договаривались раньше, 
    // НО лучше искать по system.calibre, раз мы ввели новый тип.
    // Давай поддержим оба варианта для гибкости.
    const ammoItem = this.items.find(i => 
        (i.type === "ammo" && i.system.calibre === cal) || 
        (i.name === cal)
    );

    if (!ammoItem || ammoItem.system.quantity <= 0) {
        return ui.notifications.warn(`Нет патронов калибра: ${cal}`);
    }

    // 3. Расчет
    const needed = magMax - magCur;
    const available = ammoItem.system.quantity;
    const amountToLoad = Math.min(needed, available);

    // 4. Обновление
    await this.update({"system.resources.ap.value": curAP - apCost});
    await weapon.update({"system.mag.value": magCur + amountToLoad});
    await ammoItem.update({"system.quantity": available - amountToLoad});

    // 5. Сообщение
    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: this}),
        content: `${this.name} перезаряжает <b>${weapon.name}</b> (${amountToLoad} пт.)`
    });
  }

  getRollData() {
    const data = super.getRollData();
    return { ...data, ...this.system };
  }

  async rollSkill(skillId) { return Dice.rollSkill(this, skillId); }
  async performAttack(itemId) { return Dice.performAttack(this, itemId); }
}

function _getLimbName(key) {
    const map = { head: "Голова", torso: "Торс", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога" };
    return map[key] || key;
}