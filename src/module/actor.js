// --- START OF FILE src/module/actor.js ---

import * as Dice from "./dice.js";
import { INJURY_EFFECTS, GLOBAL_STATUSES } from "./constants.js"; 

export class ZActor extends Actor {
  
  /** @override */
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    if (this.type === "zombie" && userId === game.user.id) {
        await this.createEmbeddedDocuments("Item", this._getZombieNaturalWeapons());
    }
  }

  _getZombieNaturalWeapons() {
      return [
          {
              name: "Гнилой Укус", type: "weapon", img: "icons/creatures/abilities/mouth-teeth-humanoid.webp",
              system: {
                  weaponType: "melee", damageType: "piercing", damage: "2d6 + 4", apCost: 4, equipped: true,
                  attacks: { default: { name: "Укус", ap: 4, dmg: "2d6 + 4", mod: 40, effect: "infected", chance: 25 } },
                  description: "Опасный укус. Может вызвать инфекцию."
              }
          },
          {
              name: "Удар Когтями", type: "weapon", img: "icons/creatures/abilities/paw-claw-feline.webp",
              system: {
                  weaponType: "melee", damageType: "slashing", damage: "2d4+2", apCost: 2, equipped: true,
                  attacks: { default: { name: "Царапина", ap: 2, dmg: "2d4+2", mod: 40, effect: "bleeding", chance: 15 } }
              }
          }
      ];
  }

  prepareBaseData() {
    const system = this.system;
    if (this.type === 'shelter' || this.type === 'zombie') return;
    
    // --- ИСПРАВЛЕНИЕ ИНИЦИАЛИЗАЦИИ ---
    // Сначала гарантируем существование основных объектов
    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {}; // Важно! Создаем объект, если его нет

    const attrKeys = ['str', 'agi', 'vig', 'per', 'int', 'cha'];
    attrKeys.forEach(key => {
        if (!system.attributes[key]) system.attributes[key] = { base: 1, value: 1, mod: 0 };
        const attr = system.attributes[key];
        if (attr.base === undefined) attr.base = attr.value || 1;
        attr.value = Number(attr.base) || 1;
        attr.mod = 0; 
    });

    if (!system.resources.ap) system.resources.ap = { value: 7, max: 7, bonus: 0, effect: 0 };
    if (!system.resources.infection) system.resources.infection = { value: 0, stage: 0, active: false };
    system.resources.ap.effect = 0;
    
    // Теперь безопасно обращаемся к secondary
    if (!system.secondary.xp) system.secondary.xp = { value: 0 };
  }

  prepareDerivedData() {
    const system = this.system;
    if (this.type === 'shelter' || this.type === 'zombie') return;
    if (!system.attributes) return;

    // Еще раз проверяем структуру для надежности
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.skills) system.skills = {};
    if (!system.limbs) system.limbs = {};

    const getNum = (val) => { const n = Number(val); return isNaN(n) ? 0 : n; };
    const s = {}; 

    let spentStats = 0;
    const attrKeys = ['str', 'agi', 'vig', 'per', 'int', 'cha'];
    attrKeys.forEach(key => {
        if (!system.attributes[key]) system.attributes[key] = { base: 1, value: 1, mod: 0 };
        const attr = system.attributes[key];
        attr.base = Math.max(1, Math.min(10, attr.base));
        attr.value = Math.max(1, attr.value);
        attr.mod = attr.value - attr.base;
        
        spentStats += (attr.base - 1);
        s[key] = attr.value; 
    });
    
    if (!system.secondary.spentStats) system.secondary.spentStats = { value: 0 };
    system.secondary.spentStats.value = spentStats;

    system.secondary.bravery = { value: Math.floor((s.cha + s.per) / 2) };
    system.secondary.tenacity = { value: s.vig };

    if (!system.resources.hp) system.resources.hp = { value: 70, max: 70, penalty: 0 };
    const baseMaxHP = 70 + (s.vig - 1) * 10;
    const hpPenalty = getNum(system.resources.hp.penalty);
    system.resources.hp.max = Math.max(10, baseMaxHP - hpPenalty);
    if (system.resources.hp.value > system.resources.hp.max) system.resources.hp.value = system.resources.hp.max;

    const baseAP = 7 + Math.ceil((s.agi - 1) / 2);
    const userBonus = getNum(system.resources.ap.bonus);
    const effectBonus = getNum(system.resources.ap.effect);
    system.resources.ap.max = Math.max(0, baseAP + userBonus + effectBonus);

    if (!system.secondary.carryWeight) system.secondary.carryWeight = { value: 0, max: 0 };
    system.secondary.carryWeight.max = 40 + (s.str - 1) * 10;
    let totalWeight = 0;
    if (this.items) {
        this.items.forEach(item => { 
            totalWeight += (getNum(item.system.weight) * getNum(item.system.quantity)); 
        });
    }
    system.secondary.carryWeight.value = Math.round(totalWeight * 100) / 100;

    let naturalAC = Math.floor(s.vig / 2);
    if (!system.secondary.naturalAC) system.secondary.naturalAC = { value: 0 };
    system.secondary.naturalAC.value = naturalAC;

    if (!system.secondary.evasion) system.secondary.evasion = { value: 0 };
    system.secondary.evasion.value = s.agi;

    // XP
    if (!system.secondary.xp) system.secondary.xp = { value: 0 };

    let spentSkills = 0;
    const skillConfig = {
      melee:      { a1: 'str', a2: 'agi' },
      ranged:     { a1: 'agi', a2: 'per' },
      science:    { a1: 'int', mult: 4 },
      mechanical: { a1: 'int', altA2: ['str', 'agi'] },
      medical:    { a1: 'int', a2: 'per' },
      diplomacy:  { a1: 'cha', a2: 'per' },
      leadership: { a1: 'cha', a2: 'int' },
      survival:   { a1: 'per', altA2: ['vig', 'int'] },
      athletics:  { a1: 'str', a2: 'agi' },
      stealth:    { a1: 'agi', a2: 'per' }
    };

    for (let [key, conf] of Object.entries(skillConfig)) {
      if (!system.skills[key]) system.skills[key] = { base: 0, value: 0, points: 0 };
      const skill = system.skills[key];
      if (key === 'science') skill.base = s.int * 4;
      else if (key === 'mechanical') skill.base = s.int + Math.max(s.str, s.agi);
      else if (key === 'survival') skill.base = s.per + Math.max(s.vig, s.int);
      else skill.base = s[conf.a1] + s[conf.a2];

      const invested = getNum(skill.points);
      spentSkills += invested;
      skill.value = Math.min(100, skill.base + invested);
    }
    
    if (!system.secondary.spentSkills) system.secondary.spentSkills = { value: 0 };
    system.secondary.spentSkills.value = spentSkills;

    const totalHP = system.resources.hp.max;
    const setLimb = (part, percent) => {
        if (!system.limbs[part]) system.limbs[part] = { value: 0, max: 0 };
        system.limbs[part].max = Math.floor(totalHP * percent);
        if (system.limbs[part].value === null || system.limbs[part].value === undefined) {
            system.limbs[part].value = system.limbs[part].max;
        }
    };
    setLimb('head', 0.20); setLimb('torso', 0.45);
    setLimb('lArm', 0.15); setLimb('rArm', 0.15);
    setLimb('lLeg', 0.20); setLimb('rLeg', 0.20);
  }

  hasStatusEffect(statusId) {
      return this.effects.some(e => e.statuses.has(statusId) || e.flags?.core?.statusId === statusId);
  }

  async useMedicine(item) {
      if (this.system.resources.ap.value < 4) return ui.notifications.warn("Нужно 4 AP.");
      const medSkill = this.system.skills.medical?.value || 0;
      const itemHeal = item.system.healAmount || 10;
      const healAmount = itemHeal + Math.floor(medSkill / 2);
      const penalty = Math.ceil(healAmount * 0.2) || 1;

      const curPenalty = this.system.resources.hp.penalty || 0;
      const curHP = this.system.resources.hp.value;
      const maxHP = this.system.resources.hp.max;

      await this.update({
          "system.resources.ap.value": this.system.resources.ap.value - 4,
          "system.resources.hp.penalty": curPenalty + penalty,
          "system.resources.hp.value": Math.min(maxHP - penalty, curHP + healAmount)
      });
      await item.update({"system.quantity": item.system.quantity - 1});
      if (item.system.quantity <= 0) item.delete();

      // Лечение может снимать кровотечение
      const bleeding = this.effects.find(e => e.statuses.has("bleeding") || e.name === "Кровотечение");
      if (bleeding) await bleeding.delete();

      ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `Лечение: +${healAmount} HP. (Штраф: ${penalty})` });
  }

  async standUp() {
      const prone = this.effects.find(e => e.statuses.has("prone"));
      if (!prone) return;
      const cost = Math.ceil(this.system.resources.ap.max / 2);
      if (this.system.resources.ap.value < cost) return ui.notifications.warn(`Нужно ${cost} AP.`);
      await this.update({"system.resources.ap.value": this.system.resources.ap.value - cost});
      await prone.delete();
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `${this.name} встает.` });
  }

  async longRest() {
      const vig = this.system.attributes.vig.value;
      const recovery = 10 + vig;
      const curPenalty = this.system.resources.hp.penalty || 0;
      const newPenalty = Math.max(0, curPenalty - recovery);
      const baseMax = 70 + (vig-1)*10;
      const newMax = baseMax - newPenalty;
      const healedHP = Math.min(newMax, this.system.resources.hp.value + recovery);

      // Логика Инфекции при отдыхе
      const infected = this.effects.find(e => e.statuses.has("infected"));
      if (infected) {
          const currentStage = this.system.resources.infection?.stage || 1;
          // Если стадия 3 - смерть (999 урона в голову)
          if (currentStage >= 3) {
              return this.applyDamage(999, "true", "head"); 
          }
           await this.update({"system.resources.infection.stage": currentStage + 1});
           ui.notifications.warn(`${this.name}: Инфекция прогрессирует (Стадия ${currentStage + 1})!`);
      }

      await this.update({
          "system.resources.hp.penalty": newPenalty,
          "system.resources.hp.value": healedHP,
          "system.resources.ap.value": this.system.resources.ap.max
      });
      ui.notifications.info("Отдых завершен.");
  }

  async reloadWeapon(item) {
      if (item.type !== 'weapon') return;
      const ammoType = item.system.ammoType;
      if (!ammoType) return ui.notifications.warn("Этому оружию не нужны патроны.");
      const maxMag = Number(item.system.mag.max) || 0;
      const currentMag = Number(item.system.mag.value) || 0;
      if (currentMag >= maxMag) return ui.notifications.info("Магазин полон.");
      const apCost = Number(item.system.reloadAP) || 0;
      if (this.system.resources.ap.value < apCost) return ui.notifications.warn(`Нужно ${apCost} AP для перезарядки.`);
      const ammoItem = this.items.find(i => i.type === 'ammo' && i.system.calibre === ammoType);
      if (!ammoItem) return ui.notifications.warn(`Нет патронов калибра "${ammoType}".`);
      const needed = maxMag - currentMag;
      const available = ammoItem.system.quantity;
      const toLoad = Math.min(needed, available);
      await this.update({"system.resources.ap.value": this.system.resources.ap.value - apCost});
      await item.update({"system.mag.value": currentMag + toLoad});
      if (available - toLoad <= 0) await ammoItem.delete();
      else await ammoItem.update({"system.quantity": available - toLoad});
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `${this.name} перезаряжает ${item.name} (${toLoad} пт.).` });
  }

  async riseAsZombie() {
      if (this.type !== 'survivor') return;
      const tokens = this.getActiveTokens();
      const pos = tokens[0] ? {x: tokens[0].x, y: tokens[0].y} : {x:0, y:0};
      const zombieData = {
          name: `Zombie (${this.name})`, type: "zombie", img: this.img,
          system: { resources: { hp: {value:50, max:50}, ap:{value:4, max:4} }, attributes: { str:{base:6, value:6}, agi:{base:2, value:2}, vig:{base:10, value:10} } }
      };
      const newZombie = await Actor.create(zombieData);
      const items = this.items.map(i => i.toObject());
      await newZombie.createEmbeddedDocuments("Item", items);
      if (tokens[0]) {
          const scene = game.scenes.current;
          await scene.createEmbeddedDocuments("Token", [{ name: newZombie.name, actorId: newZombie.id, img: this.img, x: pos.x, y: pos.y }]);
          await tokens[0].delete();
      }
      ui.notifications.notify(`${this.name} восстает!`);
  }

  async onTurnStart() {
      const maxAP = this.system.resources.ap.max;
      await this.update({ "system.resources.ap.value": maxAP });
      const isBleeding = this.effects.some(e => e.statuses?.has("bleeding") || e.name === "Кровотечение");
      if (isBleeding) {
          const roll = new Roll("1d5"); await roll.evaluate();
          await this.applyDamage(roll.total, "true", "torso");
          ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `Кровотечение: -${roll.total} HP` });
      }
  }

  async applyDamage(amount, type = "blunt", limb = "torso") {
    if (this.type === 'zombie' && type === 'fire') amount *= 2;
    
    let totalResist = 0;
    let totalAC = 0; 

    if (type !== "true") {
        const naturalAC = this.system.secondary?.naturalAC?.value || 0;
        totalAC += naturalAC; 
        const armors = this.items.filter(i => i.type === "armor" && i.system.equipped && i.system.coverage && i.system.coverage[limb]);
        for (let armor of armors) {
            totalResist += (Number(armor.system.dr[type]) || 0);
            totalAC += (Number(armor.system.ac) || 0);
        }
        totalResist = Math.min(100, totalResist);
    }

    const dmg = Math.max(0, Math.floor((amount * (1 - totalResist/100)) - totalAC));

    if (dmg > 0) {
        // Вычитаем урон (может уйти в минус)
        const newHP = this.system.resources.hp.value - dmg;
        const updateData = { "system.resources.hp.value": newHP };
        
        // Лимбы
        if (this.system.limbs && this.system.limbs[limb]) {
            const newLimbHP = this.system.limbs[limb].value - dmg;
            updateData[`system.limbs.${limb}.value`] = newLimbHP;
            if (this.system.limbs[limb].value > 0 && newLimbHP <= 0) await this._applyInjury(limb);
        }
        
        // Логика KO (0 HP) и Смерти ( -5 * Vig)
        const vig = this.system.attributes.vig.value || 1;
        const deathThreshold = -(vig * 5);

        if (newHP <= deathThreshold) {
             // СМЕРТЬ
             await this.createEmbeddedDocuments("ActiveEffect", [{
                 id: "dead", label: "Мертв", icon: "icons/svg/skull.svg", statuses: ["dead"]
             }]);
             ui.notifications.error(`${this.name} ПОГИБАЕТ!`);
        } else if (this.system.resources.hp.value > 0 && newHP <= 0) {
             // KO (только если еще жив, но упал в 0)
             await this.createEmbeddedDocuments("ActiveEffect", [INJURY_EFFECTS.unconscious, GLOBAL_STATUSES.bleeding]);
        }
        
        await this.update(updateData);

        // ПРОВЕРКА ПАНИКИ (только если жив)
        if (this.type !== 'zombie' && this.type !== 'shelter' && newHP > deathThreshold) {
            await this.checkPanic(dmg);
        }
    }
    const speaker = ChatMessage.getSpeaker({ actor: this });
    ChatMessage.create({ user: game.user.id, speaker, content: `<div class="z-damage-result">Урон: <b>${amount}</b> (${type}) -> <b>-${dmg} HP</b> (${_getLimbName(limb)})</div>` });
  }

  async checkPanic(damageAmount) {
      if (this.hasStatusEffect("panic")) return;
      const bravery = this.system.secondary.bravery.value || 0;
      const isLowHP = (this.system.resources.hp.value / this.system.resources.hp.max) < 0.3;
      const isHighDamage = damageAmount > bravery;

      if (isLowHP || isHighDamage) {
          const panicRoll = new Roll("1d100");
          await panicRoll.evaluate();
          if (panicRoll.total <= 50) {
               await this.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.panic]);
               await Dice.rollPanicTable(this);
          }
      }
  }

  async _applyInjury(limb) {
      let effectData = null;
      if (limb === 'head') effectData = INJURY_EFFECTS.head;
      else if (limb === 'torso') effectData = INJURY_EFFECTS.torso;
      else if (limb.includes('Arm')) effectData = INJURY_EFFECTS.arm;
      else if (limb.includes('Leg')) effectData = INJURY_EFFECTS.leg;
      if (effectData) {
        const eff = foundry.utils.deepClone(effectData);
        eff.name += ` (${_getLimbName(limb)})`;
        await this.createEmbeddedDocuments("ActiveEffect", [eff]);
      }
  }

  getRollData() { return { ...super.getRollData(), ...this.system }; }
  async rollSkill(skillId) { return Dice.rollSkill(this, skillId); }
  async performAttack(itemId) { return Dice.performAttack(this, itemId); }
}

function _getLimbName(key) { return { head:"Голова", torso:"Торс", lArm:"Л.Рука", rArm:"П.Рука", lLeg:"Л.Нога", rLeg:"П.Нога" }[key] || key; }