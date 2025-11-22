import * as Dice from "./dice.js";

export class ZActor extends Actor {
  
  prepareData() {
    super.prepareData();
  }

  prepareDerivedData() {
    const actorData = this;
    const system = actorData.system;

    // --- АВТО-ПОЧИНКА ДАННЫХ ---
    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.skills) system.skills = {};

    const getNum = (val) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    // Инициализация атрибутов
    const attrKeys = ['str', 'agi', 'vig', 'per', 'int', 'cha'];
    attrKeys.forEach(key => {
        if (!system.attributes[key]) system.attributes[key] = { value: 1 };
        system.attributes[key].value = Math.min(10, Math.max(1, getNum(system.attributes[key].value) || 1));
    });

    const s = {
      str: system.attributes.str.value,
      agi: system.attributes.agi.value,
      vig: system.attributes.vig.value,
      per: system.attributes.per.value,
      int: system.attributes.int.value,
      cha: system.attributes.cha.value
    };

    // --- ВТОРИЧНЫЕ ХАРАКТЕРИСТИКИ ---
    if (!system.resources.hp) system.resources.hp = { value: 10, max: 10 };
    system.resources.hp.max = 50 + (s.vig * 5);

    // --- РАСЧЕТ HP КОНЕЧНОСТЕЙ ---
    // Базируемся на Максимальном HP (Vigor based)
    const totalHP = system.resources.hp.max;
    
    // Если структура limbs не существует (старый актор), создаем её
    if (!system.limbs) {
        system.limbs = {
            head: { value: 0, max: 0 },
            torso: { value: 0, max: 0 },
            lArm: { value: 0, max: 0 },
            rArm: { value: 0, max: 0 },
            lLeg: { value: 0, max: 0 },
            rLeg: { value: 0, max: 0 }
        };
    }

    const setLimbMax = (part, percent) => {
        if (!system.limbs[part]) system.limbs[part] = { value: 0, max: 0 };
        system.limbs[part].max = Math.floor(totalHP * percent);
        // Опционально: Если текущее HP не задано (0), ставим макс. (для новых акторов)
        // Но лучше это делать при создании, чтобы не лечить раненых авто-расчетом.
        // Здесь мы просто обновляем Max.
    };

    setLimbMax('head', 0.20);  // 20%
    setLimbMax('torso', 0.45); // 45%
    setLimbMax('lArm', 0.15);  // 15%
    setLimbMax('rArm', 0.15);  // 15%
    setLimbMax('lLeg', 0.20);  // 20% (чуть крепче рук)
    setLimbMax('rLeg', 0.20);  // 20%



    // Формула AP: 7 + ceil((Agi - 1)/2)
    if (!system.resources.ap) system.resources.ap = { value: 7, max: 7 };
    system.resources.ap.max = 7 + Math.ceil((s.agi - 1) / 2);

    if (!system.secondary.carryWeight) system.secondary.carryWeight = { value: 0, max: 0 };
    system.secondary.carryWeight.max = 20 + (s.str * 5);
    
    let totalWeight = 0;
    if (this.items) {
        this.items.forEach(item => {
            totalWeight += (getNum(item.system.weight) * getNum(item.system.quantity));
        });
    }
    system.secondary.carryWeight.value = Math.round(totalWeight * 100) / 100;

    if (!system.secondary.evasion) system.secondary.evasion = { value: 0 };
    system.secondary.evasion.value = s.agi;
    if (!system.secondary.tenacity) system.secondary.tenacity = { value: 0 };
    system.secondary.tenacity.value = Math.floor(s.vig / 2);
    if (!system.secondary.bravery) system.secondary.bravery = { value: 0 };
    system.secondary.bravery.value = Math.floor((s.cha + s.per) / 2);
    if (!system.resources.learningPoints) system.resources.learningPoints = { value: 0 };
    system.resources.learningPoints.value = s.int * 2;

    // --- НАВЫКИ ---
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

      skill.value = Math.min(100, skill.base + getNum(skill.points));
    }


  }

  /** 
   * ВАЖНО: Этот метод позволяет использовать данные актера в формулах (например, в инициативе).
   * Foundry вызывает его автоматически перед броском.
   */
  getRollData() {
    const data = super.getRollData();
    // Копируем system в корень объекта, чтобы можно было писать @attributes...
    return { ...data, ...this.system };
  }

  // Делегирование в dice.js
  async rollSkill(skillId) {
    return Dice.rollSkill(this, skillId);
  }

  async performAttack(itemId) {
    return Dice.performAttack(this, itemId);
  }
}