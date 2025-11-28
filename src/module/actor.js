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
    
    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {}; 

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
    
    if (!system.secondary.xp) system.secondary.xp = { value: 0 };
  }

  prepareDerivedData() {
    const system = this.system;
    if (this.type === 'shelter' || this.type === 'zombie') return;
    if (!system.attributes) return;

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

  async onTurnStart() {
      let maxAP = this.system.resources.ap.max;
      
      if (this.hasStatusEffect("immolated")) {
          const fireRoll = new Roll("1d6");
          await fireRoll.evaluate();
          const fireDmg = fireRoll.total;

          let newHP = this.system.resources.hp.value - fireDmg;
          const updates = { "system.resources.hp.value": newHP };

          const limbs = ["head", "torso", "lArm", "rArm", "lLeg", "rLeg"];
          for (let limb of limbs) {
              const currentLimbHP = this.system.limbs[limb].value;
              updates[`system.limbs.${limb}.value`] = Math.max(0, currentLimbHP - fireDmg);
          }
          await this.update(updates);

          ChatMessage.create({ 
              speaker: ChatMessage.getSpeaker({actor: this}), 
              content: `<div style="color:orange; font-weight:bold;">🔥 ГОРИТ ЗАЖИВО! 🔥</div><div>Урон: ${fireDmg} по всем частям тела.</div>` 
          });

          if (this.type !== 'zombie') {
              maxAP = Math.max(0, maxAP - 4);
          }
      }

      await this.update({ "system.resources.ap.value": maxAP });

      if (this.hasStatusEffect("bleeding")) {
          const roll = new Roll("1d5"); await roll.evaluate();
          await this.applyDamage(roll.total, "true", "torso"); 
          ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `Кровотечение: -${roll.total} HP` });
      }

      if (this.hasStatusEffect("poisoned")) {
          const roll = new Roll("1d6"); await roll.evaluate();
          await this.applyDamage(roll.total, "true", "torso");
          ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `Отравление: -${roll.total} HP` });
      }

      if (this.hasStatusEffect("panic")) {
          const bravery = this.system.secondary.bravery?.value || 0;
          const target = bravery * 5;
          const roll = new Roll("1d100");
          await roll.evaluate();
          
          if (roll.total <= target) {
              const panicEffect = this.effects.find(e => e.statuses.has("panic"));
              if (panicEffect) await panicEffect.delete();
              ChatMessage.create({ 
                  speaker: ChatMessage.getSpeaker({actor: this}), 
                  content: `<div style="color:green; font-weight:bold;">Персонаж берет себя в руки! Паника прошла. (${roll.total} <= ${target})</div>` 
              });
          } else {
              ChatMessage.create({ 
                  speaker: ChatMessage.getSpeaker({actor: this}), 
                  content: `<div style="color:red;">Персонаж все еще в панике! (${roll.total} > ${target})</div>` 
              });
              await Dice.rollPanicTable(this);
          }
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
        const newHP = this.system.resources.hp.value - dmg;
        const updateData = { "system.resources.hp.value": newHP };
        
        if (this.system.limbs && this.system.limbs[limb]) {
            const newLimbHP = this.system.limbs[limb].value - dmg;
            updateData[`system.limbs.${limb}.value`] = newLimbHP;
            if (this.system.limbs[limb].value > 0 && newLimbHP <= 0) await this._applyInjury(limb);
        }
        
        const vig = this.system.attributes.vig.value || 1;
        const deathThreshold = -(vig * 5);

        // --- ИСПРАВЛЕНИЕ ОШИБКИ СМЕРТИ ---
        if (newHP <= deathThreshold) {
             if (!this.hasStatusEffect("dead")) {
                 // Важно: name обязательно для ActiveEffect
                 await this.createEmbeddedDocuments("ActiveEffect", [{
                     id: "dead", name: "Мертв", icon: "icons/svg/skull.svg", statuses: ["dead"]
                 }]);
                 ui.notifications.error(`${this.name} ПОГИБАЕТ!`);
             }
        } else if (this.system.resources.hp.value > 0 && newHP <= 0) {
             if (!this.hasStatusEffect("status-unconscious")) {
                 await this.createEmbeddedDocuments("ActiveEffect", [INJURY_EFFECTS.unconscious, GLOBAL_STATUSES.bleeding]);
             }
        }
        
        await this.update(updateData);

        if (this.type !== 'zombie' && this.type !== 'shelter' && newHP > deathThreshold) {
            await this.checkPanic(dmg);
        }
    }

    // --- ОБНОВЛЕННЫЙ ЛОГ ДЛЯ GM (Стойкость/Храбрость) ---
    const tenacity = this.system.secondary.tenacity?.value || 0;
    const bravery = this.system.secondary.bravery?.value || 0;

    const speaker = ChatMessage.getSpeaker({ actor: this });
    ChatMessage.create({ 
        user: game.user.id, 
        speaker, 
        content: `<div class="z-damage-result" style="border-left: 5px solid darkred; font-size: 0.9em;">
                    <b>(GM) Результат урона:</b><br>
                    Входящий: ${amount} (${type})<br>
                    Броня: -${totalAC} (Resist ${totalResist}%)<br>
                    <b>Итог: -${dmg} HP</b> (${_getLimbName(limb)})<br>
                    <hr style="margin: 2px 0;">
                    <div style="font-size: 0.85em; color: #555;">
                       🛡️ Стойкость: <b>${tenacity}</b> (vs Эффекты)<br>
                       🦁 Храбрость: <b>${bravery}</b> (vs Паника)
                    </div>
                  </div>`,
        whisper: ChatMessage.getWhisperRecipients("GM")
    });
  }

   /** @override */
  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);
    
    // Работаем только если обновление инициировал текущий пользователь (чтобы не было циклов у всех)
    if (userId !== game.user.id) return;

    // 1. Проверка конечностей на 0 ХП (при ручном изменении)
    if (changed.system?.limbs) {
        for (const [key, limbData] of Object.entries(changed.system.limbs)) {
            // Если значение изменилось и стало <= 0
            if (limbData.value !== undefined && limbData.value <= 0) {
                // Проверяем, есть ли уже травма, чтобы не спамить
                const statusId = `injury-${key}`;
                if (!this.hasStatusEffect(statusId)) {
                    await this._applyInjury(key);
                    ui.notifications.warn(`${this.name}: Конечность ${key} повреждена вручную!`);
                }
            }
        }
    }

    // 2. Проверка выхода из KO (Если ХП стало > 0, а был в KO)
    // Механика Wounded: Если вышел из KO -> получает Wounded
    if (changed.system?.resources?.hp?.value) {
        const newHP = changed.system.resources.hp.value;
        // Если был в бессознании, а теперь ХП > 0
        if (this.hasStatusEffect("status-unconscious") && newHP > 0) {
            // Снимаем KO и Кровотечение
            const koEffect = this.effects.find(e => e.statuses.has("status-unconscious"));
            const bleedEffect = this.effects.find(e => e.statuses.has("bleeding"));
            if (koEffect) await koEffect.delete();
            if (bleedEffect) await bleedEffect.delete();

            // Накладываем Wounded (Ранен)
            if (!this.hasStatusEffect("wounded")) {
                await this.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.wounded]);
                ui.notifications.info(`${this.name} приходит в себя, но он Ранен (Wounded).`);
            }
        }
    }
  }

  // --- ПОЛНОЕ ЛЕЧЕНИЕ (GM) ---
  async fullHeal() {
      const updates = {
          "system.resources.hp.value": this.system.resources.hp.max,
          "system.resources.hp.penalty": 0,
          "system.resources.ap.value": this.system.resources.ap.max
      };

      // Восстанавливаем конечности
      if (this.system.limbs) {
          for (const key of Object.keys(this.system.limbs)) {
              updates[`system.limbs.${key}.value`] = this.system.limbs[key].max;
          }
      }

      // Удаляем все негативные эффекты (Травмы, Кровь, KO, и т.д.)
      // Фильтруем эффекты, которые есть в наших списках негативных статусов
      const effectsToDelete = this.effects.filter(e => {
          const isInjury = Object.values(INJURY_EFFECTS).some(ie => e.statuses.has(ie.id));
          const isGlobal = Object.values(GLOBAL_STATUSES).some(gs => e.statuses.has(gs.id));
          return isInjury || isGlobal || e.statuses.has("dead");
      }).map(e => e.id);

      if (effectsToDelete.length > 0) {
          await this.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
      }

      await this.update(updates);
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: this}), content: `<span style="color:green; font-weight:bold;">Божественное исцеление!</span>` });
  }

  async checkPanic(damageAmount) {
      if (this.hasStatusEffect("panic")) return;

      const bravery = this.system.secondary.bravery.value || 0;
      const isLowHP = (this.system.resources.hp.value / this.system.resources.hp.max) < 0.3;
      const isHighDamage = damageAmount > bravery;

      if (isLowHP || isHighDamage) {
          // Формула: 50 - (Bravery * 2)
          const panicChance = Math.max(5, 50 - (bravery * 2)); 
          const panicRoll = new Roll("1d100");
          await panicRoll.evaluate();
          
          const speaker = ChatMessage.getSpeaker({ actor: this });
          
          if (panicRoll.total <= panicChance) {
               await this.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.panic]);
               ChatMessage.create({
                   speaker,
                   content: `<span style="color:orange; font-weight:bold;">ПРОВАЛ ВОЛИ! (${panicRoll.total} <= ${panicChance}%)</span>`,
                   whisper: ChatMessage.getWhisperRecipients("GM") // Лог броска только ГМу, чтобы игроки не видели математику
               });
               await Dice.rollPanicTable(this);
          } else {
               ChatMessage.create({
                   speaker,
                   content: `<span style="color:green;">Воля: Персонаж сдержал панику. (${panicRoll.total} > ${panicChance}%)</span>`,
                   whisper: ChatMessage.getWhisperRecipients("GM")
               });
          }
      }
  }

  async longRest() {
      const vig = this.system.attributes.vig.value;
      const recovery = 10 + vig;
      const curPenalty = this.system.resources.hp.penalty || 0;
      const newPenalty = Math.max(0, curPenalty - recovery);
      const baseMax = 70 + (vig-1)*10;
      const newMax = baseMax - newPenalty;
      const healedHP = Math.min(newMax, this.system.resources.hp.value + recovery);

      const infection = this.system.resources.infection;
      if (infection && infection.active) {
          const currentStage = infection.stage || 1;
          
          if (currentStage >= 3) {
              const deathThreshold = -(vig * 5);
              await this.update({"system.resources.hp.value": deathThreshold});
              
              if (!this.hasStatusEffect("dead")) {
                  await this.createEmbeddedDocuments("ActiveEffect", [{
                     id: "dead", name: "Мертв", icon: "icons/svg/skull.svg", statuses: ["dead"]
                  }]);
              }
              
              new Dialog({
                  title: "Смерть от Инфекции",
                  content: `<p style="color:red; font-weight:bold;">${this.name} погибает от вируса!</p><p>Восстать как зомби?</p>`,
                  buttons: {
                      yes: { label: "Восстать (Зомби)", callback: () => this.riseAsZombie() },
                      no: { label: "Оставить трупом" }
                  }
              }).render(true);
              return; 
          }
          
           await this.update({"system.resources.infection.stage": currentStage + 1});
           ChatMessage.create({
               content: `<span style="color:purple; font-weight:bold;">(GM INFO) ${this.name}: Инфекция прогрессирует до стадии ${currentStage + 1}.</span>`,
               whisper: ChatMessage.getWhisperRecipients("GM")
           });
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

  async _applyInjury(limb) {
      let effectData = null;
      if (limb === 'head') effectData = INJURY_EFFECTS.head;
      else if (limb === 'torso') effectData = INJURY_EFFECTS.torso;
      else if (limb.includes('Arm')) effectData = INJURY_EFFECTS.arm;
      else if (limb.includes('Leg')) effectData = INJURY_EFFECTS.leg;
      if (effectData) {
        const statusId = effectData.id || `injury-${limb}`;
        if (!this.hasStatusEffect(statusId)) {
            const eff = foundry.utils.deepClone(effectData);
            eff.name += ` (${_getLimbName(limb)})`;
            await this.createEmbeddedDocuments("ActiveEffect", [eff]);
        }
      }
  }

  getRollData() { return { ...super.getRollData(), ...this.system }; }
  async rollSkill(skillId) { return Dice.rollSkill(this, skillId); }
  async performAttack(itemId) { return Dice.performAttack(this, itemId); }
}

function _getLimbName(key) { return { head:"Голова", torso:"Торс", lArm:"Л.Рука", rArm:"П.Рука", lLeg:"Л.Нога", rLeg:"П.Нога" }[key] || key; }