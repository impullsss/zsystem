import * as Dice from "./dice.js";
import { INJURY_EFFECTS } from "./constants.js"; 

export class ZActor extends Actor {
  
  /** 
   * Шаг 1: Подготовка базовых данных (ДО Эффектов)
   * Сбрасываем временные поля, чтобы эффекты могли наложиться чисто.
   */
  prepareBaseData() {
    const system = this.system;
    if (!system.attributes) return;

    // 1. Атрибуты: Сбрасываем Итог к Базе
    const attrKeys = ['str', 'agi', 'vig', 'per', 'int', 'cha'];
    attrKeys.forEach(key => {
        const attr = system.attributes[key];
        if (!attr) return;
        if (attr.base === undefined) attr.base = attr.value || 1;
        attr.value = Number(attr.base) || 1;
        attr.mod = 0; 
    });

    // 2. AP: Сбрасываем накопитель эффектов в 0
    // Если у актера еще нет этого поля (старая версия), создаем его
    if (!system.resources.ap) system.resources.ap = { value: 7, max: 7, bonus: 0, effect: 0 };
    if (system.resources.ap.effect === undefined) system.resources.ap.effect = 0;
    
    // Мы принудительно ставим 0. 
    // Потом Foundry наложит Active Effects (например -2), и в этом поле станет -2.
    system.resources.ap.effect = 0;
  }

  prepareData() {
    super.prepareData();
  }

  /** 
   * Шаг 3: Расчет производных данных (ПОСЛЕ Эффектов)
   */
  prepareDerivedData() {
    const actorData = this;
    const system = actorData.system;

    // --- АВТО-ПОЧИНКА ---
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.skills) system.skills = {};
    if (!system.limbs) system.limbs = {};

    const getNum = (val) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    // 1. Атрибуты (Модификаторы)
    let spentStats = 0;
    const s = {}; 

    const attrKeys = ['str', 'agi', 'vig', 'per', 'int', 'cha'];
    attrKeys.forEach(key => {
        const attr = system.attributes[key];
        if (!attr) return;
        attr.value = Math.max(1, Math.min(10, attr.value));
        attr.mod = attr.value - attr.base;
        spentStats += (attr.base - 1);
        s[key] = attr.value; 
    });

    if (!system.secondary.spentStats) system.secondary.spentStats = { value: 0 };
    system.secondary.spentStats.value = spentStats;


    // --- 2. ВТОРИЧНЫЕ ХАРАКТЕРИСТИКИ ---
    
    // HP
    if (!system.resources.hp) system.resources.hp = { value: 70, max: 70 };
    system.resources.hp.max = 70 + (s.vig - 1) * 10;

    // AP (ОЧКИ ДЕЙСТВИЯ)
    // База от Ловкости
    const baseAP = 7 + Math.ceil((s.agi - 1) / 2);
    // Бонус от игрока
    const userBonus = getNum(system.resources.ap.bonus);
    // Бонус/Штраф от эффектов (он уже изменен Foundry между prepareBaseData и этой функцией)
    const effectBonus = getNum(system.resources.ap.effect);

    // ИТОГОВАЯ ФОРМУЛА
    system.resources.ap.max = Math.max(0, baseAP + userBonus + effectBonus);


    // Вес
    if (!system.secondary.carryWeight) system.secondary.carryWeight = { value: 0, max: 0 };
    system.secondary.carryWeight.max = 40 + (s.str - 1) * 10;
    let totalWeight = 0;
    if (this.items) {
        this.items.forEach(item => {
            totalWeight += (getNum(item.system.weight) * getNum(item.system.quantity));
        });
    }
    system.secondary.carryWeight.value = Math.round(totalWeight * 100) / 100;

    // Остальные статы
    let naturalAC = 0;
    if (s.vig >= 10) naturalAC = 5;
    else if (s.vig >= 9) naturalAC = 4;
    else if (s.vig >= 7) naturalAC = 3;
    else if (s.vig >= 5) naturalAC = 2;
    else if (s.vig >= 4) naturalAC = 1;
    
    if (!system.secondary.naturalAC) system.secondary.naturalAC = { value: 0 };
    system.secondary.naturalAC.value = naturalAC;

    if (!system.secondary.evasion) system.secondary.evasion = { value: 0 };
    system.secondary.evasion.value = s.agi;
    if (!system.secondary.tenacity) system.secondary.tenacity = { value: 0 };
    system.secondary.tenacity.value = Math.floor(s.vig / 2);
    if (!system.secondary.bravery) system.secondary.bravery = { value: 0 };
    system.secondary.bravery.value = Math.floor((s.cha + s.per) / 2);
    
    if (!system.resources.learningPoints) system.resources.learningPoints = { value: 0 };

    // --- 3. КОНЕЧНОСТИ ---
    const totalHP = system.resources.hp.max;
    const setLimb = (part, percent) => {
        if (!system.limbs[part]) system.limbs[part] = { value: 0, max: 0 };
        system.limbs[part].max = Math.floor(totalHP * percent);
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

  // --- Apply Damage ---
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

    // Логика Травм
    let injuryMsg = "";
    if (finalDamage > 0) {
        const currentHP = this.system.resources.hp.value;
        const newHP = Math.max(0, currentHP - finalDamage);
        const updateData = { "system.resources.hp.value": newHP };
        
        if (this.system.limbs && this.system.limbs[limb]) {
            const currentLimbHP = this.system.limbs[limb].value;
            const newLimbHP = currentLimbHP - finalDamage;
            updateData[`system.limbs.${limb}.value`] = newLimbHP;

            if (currentLimbHP > 0 && newLimbHP <= 0) {
                await this._applyInjury(limb);
                injuryMsg = `<div class="z-injury-alert">⚠️ КРИТИЧЕСКАЯ ТРАВМА: ${_getLimbName(limb)}!</div>`;
            }
        }
        if (currentHP > 0 && newHP <= 0) {
             await this.createEmbeddedDocuments("ActiveEffect", [INJURY_EFFECTS.unconscious]);
             injuryMsg += `<div class="z-injury-alert" style="background:black; color:red;">💀 ПЕРСОНАЖ БЕЗ СОЗНАНИЯ</div>`;
        }
        await this.update(updateData);
    }

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
        ${injuryMsg}
      </div>
    `;
    ChatMessage.create({ user: game.user.id, speaker, content });
  }

  async _applyInjury(limb) {
      let effectData = null;
      if (limb === 'head') effectData = INJURY_EFFECTS.head;
      else if (limb === 'torso') effectData = INJURY_EFFECTS.torso;
      else if (limb.includes('Arm')) effectData = INJURY_EFFECTS.arm;
      else if (limb.includes('Leg')) effectData = INJURY_EFFECTS.leg;

      if (!effectData) return;
      const specificEffect = foundry.utils.deepClone(effectData);
      specificEffect.name += ` (${_getLimbName(limb)})`;
      await this.createEmbeddedDocuments("ActiveEffect", [specificEffect]);
  }

  getRollData() {
    const data = super.getRollData();
    return { ...data, ...this.system };
  }

  async rollSkill(skillId) { return Dice.rollSkill(this, skillId); }
  async performAttack(itemId) { return Dice.performAttack(this, itemId); }
  
  async reloadWeapon(weapon) {
    const magMax = weapon.system.mag.max;
    const magCur = weapon.system.mag.value;
    const cal = weapon.system.ammoType;
    const apCost = weapon.system.reloadAP || 4; 

    if (magCur >= magMax) return ui.notifications.warn("Магазин полон.");
    if (!cal) return ui.notifications.warn("У оружия не указан калибр.");
    
    const curAP = this.system.resources.ap.value;
    if (curAP < apCost) return ui.notifications.warn("Недостаточно AP для перезарядки.");

    const ammoItem = this.items.find(i => 
        (i.type === "ammo" && i.system.calibre === cal) || 
        (i.name === cal)
    );

    if (!ammoItem || ammoItem.system.quantity <= 0) {
        return ui.notifications.warn(`Нет патронов калибра: ${cal}`);
    }

    const needed = magMax - magCur;
    const available = ammoItem.system.quantity;
    const amountToLoad = Math.min(needed, available);

    await this.update({"system.resources.ap.value": curAP - apCost});
    await weapon.update({"system.mag.value": magCur + amountToLoad});
    await ammoItem.update({"system.quantity": available - amountToLoad});

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: this}),
        content: `${this.name} перезаряжает <b>${weapon.name}</b> (${amountToLoad} пт.)`
    });
  }
}

function _getLimbName(key) {
    const map = { head: "Голова", torso: "Торс", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога" };
    return map[key] || key;
}