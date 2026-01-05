import * as Dice from "./dice.js";
import { INJURY_EFFECTS, GLOBAL_STATUSES, INFECTION_STAGES } from "./constants.js";

export class ZActor extends Actor {

  async _onCreate(data, options, userId) {
     await super._onCreate(data, options, userId);
    if (userId !== game.user.id) return;

    // --- ДОБАВЛЕНО: Транспорт ---
    if (this.type === "vehicle") {
        await this.update({
            name: "Новый Транспорт",
            img: "icons/svg/target.svg", // Можешь заменить на иконку машины
            "prototypeToken.actorLink": true // Машины обычно уникальны и связаны
        });
    }

    // Зомби: авто-статы и оружие
    if (this.type === "zombie") {
      const updates = {};
      const system = this.system;
      if (!system.attributes.str || system.attributes.str.value <= 1) {
        updates["system.attributes"] = {
          str: { base: 8, value: 8 },
          agi: { base: 4, value: 4 },
          vig: { base: 10, value: 10 },
          per: { base: 5, value: 5 },
          int: { base: 1, value: 1 },
          cha: { base: 1, value: 1 },
        };
      }
      if (!system.resources.hp || system.resources.hp.max <= 10) {
        updates["system.resources.hp"] = { value: 80, max: 80 };
        updates["system.resources.ap"] = { value: 9, max: 9 };
        updates["system.limbs"] = {
          head: { value: 16, max: 16 },
          torso: { value: 36, max: 36 },
          lArm: { value: 12, max: 12 },
          rArm: { value: 12, max: 12 },
          lLeg: { value: 16, max: 16 },
          rLeg: { value: 16, max: 16 },
        };
      }
      if (Object.keys(updates).length > 0) await this.update(updates);

      const hasWeapons = this.items.some((i) => i.type === "weapon");
      if (!hasWeapons)
        await this.createEmbeddedDocuments(
          "Item",
          this._getZombieNaturalWeapons()
        );
    }

    // Лут: отключение зрения и привязки
    if (["container", "harvest_spot"].includes(this.type)) {
      await this.update({
        "prototypeToken.sight.enabled": false,
        "prototypeToken.actorLink": false, // ВАЖНО: false = Unlinked (уникальные копии)
        "prototypeToken.disposition": 0,   // Neutral
        "prototypeToken.displayBars": 0
        // УБРАНО: "ownership.default": 0 - это ломало права на токены!
      });
    }
  }

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Если меняется кол-во потраченного опыта
    if (foundry.utils.hasProperty(changed, "system.secondary.xp.spent")) {
        const oldSpent = this.system.secondary.xp.spent || 0;
        const newSpent = foundry.utils.getProperty(changed, "system.secondary.xp.spent");

        // Порог: каждые 25 очков
        const oldThreshold = Math.floor(oldSpent / 25);
        const newThreshold = Math.floor(newSpent / 25);

        if (newThreshold > oldThreshold) {
            const earnedPP = newThreshold - oldThreshold;
            const currentPP = this.system.secondary.perkPoints.value || 0;
            
            // Начисляем PP
            changed["system.secondary.perkPoints.value"] = currentPP + earnedPP;
            
            // Выведем сообщение для ГМа/Игрока
            options.zsystem_pp_earned = earnedPP; // Передадим инфо в options, чтобы вывести тост позже
        }
    }
  }

  async _onUpdate(data, options, userId) {
    await super._onUpdate(data, options, userId);
    if (userId !== game.user.id) return;

    // Проверка перегруза при изменении предметов или статов
    // Мы проверяем вычисляемое свойство, которое настроили в prepareDerivedData
    const isOverburdened = this.system.secondary?.isOverburdened;
    const hasEffect = this.hasStatusEffect("overburdened");

    if (isOverburdened && !hasEffect) {
        // Накладываем эффект без изменений статов (чисто иконка), т.к. статы режем в prepareData
        const effectData = GLOBAL_STATUSES.overburdened;
        await this.createEmbeddedDocuments("ActiveEffect", [effectData]);
        ui.notifications.warn(`${this.name}: Перегруз! (-2 AP)`);
    } else if (!isOverburdened && hasEffect) {
        const effect = this.effects.find(e => e.statuses.has("overburdened"));
        if (effect) await effect.delete();
    }
  }

  // Ежедневное обновление (Убежище)
  async applyDailyUpdate({ hasFood = true, isSheltered = true, antibioticGiven = false } = {}) {
      if (this.type === 'zombie' || this.type === 'container' || this.type === 'harvest_spot') return null;

      const report = {
          name: this.name,
          healed: 0,
          infectionChange: null,
          died: false,
          msg: []
      };

      // 1. ПРОВЕРКА ИНФЕКЦИИ
      const inf = this.system.resources.infection;
      if (inf.active || inf.stage > 0) {
          if (antibioticGiven) {
              const currentStage = Number(inf.stage) || 1;
              const newStage = Math.max(1, currentStage - 1);
              report.infectionChange = newStage;
              
              await this.update({ 
                  "system.resources.infection.stage": newStage,
                  "system.resources.infection.active": true 
              });
              await this._updateInfectionStatus(newStage);
              
              if (currentStage === newStage) {
                   report.msg.push(`<span style="color:#1e88e5; font-weight:bold;">💊 Вирус сдержан (Ст. ${newStage})</span>`);
              } else {
                   report.msg.push(`<span style="color:#1e88e5; font-weight:bold;">💊 Состояние улучшилось (Ст. ${newStage})</span>`);
              }
          } else {
              const vig = this.system.attributes.vig.value;
              const dc = 10 + (inf.stage * 2);
              const roll = new Roll("1d10 + @vig", { vig });
              await roll.evaluate();
              
              if (roll.total >= dc) {
                  report.msg.push(`<span style="color:green">Иммунитет сдержал вирус (Roll ${roll.total} vs ${dc})</span>`);
              } else {
                  const newStage = inf.stage + 1;
                  report.infectionChange = newStage;
                  
                  if (newStage >= 4) {
                      report.died = true;
                      report.msg.push(`<span style="color:red; font-weight:bold;">УМЕР ОТ ИНФЕКЦИИ!</span>`);
                      await this.update({
                          "system.resources.infection.stage": 4,
                          "system.resources.hp.value": -100
                      });
                      await this.riseAsZombie(); 
                  } else {
                      await this.update({ "system.resources.infection.stage": newStage });
                      await this._updateInfectionStatus(newStage);
                      report.msg.push(`<span style="color:orange">Инфекция прогрессирует! Стадия ${newStage} (Roll ${roll.total} vs ${dc})</span>`);
                  }
              }
          }
      }

      if (report.died) return report;

      // 2. ЛЕЧЕНИЕ
      if (hasFood) {
          const vig = this.system.attributes.vig.value;
          let healAmount = vig + 5; 
          if (isSheltered) healAmount += 5;
          
          const curHP = this.system.resources.hp.value;
          const maxHP = this.system.resources.hp.max;
          const healed = Math.min(maxHP - curHP, healAmount);
          
          if (healed > 0) {
              await this.update({ "system.resources.hp.value": curHP + healed });
              report.healed = healed;
          }
          
          const curPenalty = this.system.resources.hp.penalty || 0;
          if (curPenalty > 0) {
              await this.update({ "system.resources.hp.penalty": Math.max(0, curPenalty - 2) });
          }
          
          const limbUpdates = {};
          let hasLimbHeal = false;
          for(const [key, limb] of Object.entries(this.system.limbs)) {
              if (limb.value < limb.max) {
                  limbUpdates[`system.limbs.${key}.value`] = Math.min(limb.max, limb.value + Math.ceil(healAmount / 2));
                  hasLimbHeal = true;
              }
          }
          if(hasLimbHeal) await this.update(limbUpdates);

      } else {
          report.msg.push(`<span style="color:red">ГОЛОДАЕТ (-5 Морали)</span>`);
          if (!this.hasStatusEffect("fatigued")) {
              await this.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.fatigued]);
          }
      }
      return report;
  }

  async _updateInfectionStatus(stage) {
      const existing = this.effects.filter(e => e.flags?.zsystem?.isInfection);
      if (existing.length) await this.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      if (stage > 0) {
          const stageData = INFECTION_STAGES[stage];
          if (stageData) {
              const effectData = foundry.utils.deepClone(stageData);
              effectData.flags = { zsystem: { isInfection: true } };
              await this.createEmbeddedDocuments("ActiveEffect", [effectData]);
          }
      }
  }

  _getZombieNaturalWeapons() {
    return [
      {
        name: "Гнилые Зубы",
        type: "weapon",
        img: "icons/creatures/abilities/mouth-teeth-rows-red.webp",
        system: {
          weaponType: "melee",
          damageType: "piercing",
          damage: "4d6 + 11",
          apCost: 5,
          equipped: true,
          attacks: {
            default: { name: "Укус", ap: 5, dmg: "4d6 + 11", mod: 28, effect: "infected", chance: 40 },
          },
        },
      },
      {
        name: "Когти",
        type: "weapon",
        img: "icons/creatures/claws/claw-talons-yellow-red.webp",
        system: {
          weaponType: "melee",
          damageType: "slashing",
          damage: "3d4 + 7",
          apCost: 4,
          equipped: true,
          attacks: {
            default: { name: "Раздирание", ap: 4, dmg: "3d4 + 7", mod: 38, effect: "bleeding", chance: 25 },
          },
        },
      },
    ];
  }

  prepareBaseData() {
    const system = this.system;
    
    // --- ЗАЩИТА ДЛЯ КОНТЕЙНЕРА ---
    if (this.type === "container") {
        if (!system.attributes) system.attributes = {};
        const attr = system.attributes;
        
        // Замок
        if (!attr.isLocked) attr.isLocked = { value: false };
        if (!attr.keyName) attr.keyName = { value: "" };
        if (!attr.lockDC) attr.lockDC = { value: 15 };
        if (!attr.canPick) attr.canPick = { value: true }; 
        if (!attr.canBash) attr.canBash = { value: true }; 
        if (!attr.bashDC) attr.bashDC = { value: 18 };
        if (!attr.noiseFormula) attr.noiseFormula = { value: "2d6" };
        
        // --- ЛОВУШКА (V3) ---
        if (!attr.isTrapped) attr.isTrapped = { value: false };
        if (!attr.trapActive) attr.trapActive = { value: true };
        
        // Урон
        if (!attr.trapDmg) attr.trapDmg = { value: "2d6" }; 
        
        // НОВОЕ: Объект с конечностями (вместо одной строки)
        if (!attr.trapLimbs) attr.trapLimbs = { 
            head: false, torso: true, // По дефолту торс
            lArm: false, rArm: false, 
            lLeg: false, rLeg: false 
        };
        
        // Радиусы
        if (!attr.trapTriggerRadius) attr.trapTriggerRadius = { value: 1 };
        if (!attr.trapDamageRadius) attr.trapDamageRadius = { value: 0 };
        
        // Обезвреживание
        if (!attr.disarmDC) attr.disarmDC = { value: 15 };
        if (!attr.disarmNoise) attr.disarmNoise = { value: "2" };
        // НОВОЕ: Навык для обезвреживания
        if (!attr.disarmSkill) attr.disarmSkill = { value: "mechanical" };
        
        // Схрон
        if (!attr.isHidden) attr.isHidden = { value: false };
        if (!attr.spotDC) attr.spotDC = { value: 15 };
        if (!attr.spotRadius) attr.spotRadius = { value: 3 }; 
        
        return; 
    }

    if (this.type === "vehicle") {
        if (!system.attributes) system.attributes = {};
        if (!system.attributes.speed) system.attributes.speed = { value: 0 };
        if (!system.attributes.handling) system.attributes.handling = { value: 0 };
        if (!system.attributes.mpg) system.attributes.mpg = { value: 5 };

        if (!system.resources) system.resources = {};
        if (!system.resources.fuel) system.resources.fuel = { value: 0, max: 60 };
        if (!system.resources.hp) system.resources.hp = { value: 100, max: 100 };

        // Вот из-за отсутствия этого падала ошибка (cargo undefined)
        if (!system.cargo) system.cargo = { value: 0, max: 500 };
        
        // Пассажиры
        if (!system.passengers) system.passengers = [];
        
        return; // Выходим, чтобы не применять логику людей
    }

    
    if (this.type === "shelter" || this.type === "container") return;
    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.limbs) system.limbs = {};

    const limbKeys = ["head", "torso", "lArm", "rArm", "lLeg", "rLeg"];
    limbKeys.forEach((k) => {
      if (!system.limbs[k])
        system.limbs[k] = { value: 10, max: 10, penalty: 0 };
    });

    const attrKeys = ["str", "agi", "vig", "per", "int", "cha"];
    attrKeys.forEach((key) => {
  if (!system.attributes[key]) system.attributes[key] = { base: 1, value: 1, mod: 0 };
  const attr = system.attributes[key];
  
  // Инициализируем mod только если его еще нет (не обнуляем при каждой перерисовке!)
  attr.mod = attr.mod ?? 0; 
  if (attr.base === undefined) attr.base = attr.value || 1;
});

    if (!system.resources.ap)
      system.resources.ap = { value: 7, max: 7, bonus: 0, effect: 0 };
    if (!system.resources.infection)
      system.resources.infection = { value: 0, stage: 0, active: false };
    if (!system.secondary.xp) system.secondary.xp = { value: 0 };
  }

  prepareDerivedData() {
    const system = this.system;
    if (["shelter", "container", "vehicle"].includes(this.type)) return;

    const getNum = (val) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    // 1. АТРИБУТЫ (Hard Cap 1)
    const attrKeys = ["str", "agi", "vig", "per", "int", "cha"];
    let spentStats = 0;
    attrKeys.forEach(key => {
        const attr = system.attributes[key];
        attr.base = Math.max(1, Math.min(10, getNum(attr.base)));
        attr.value = Math.max(1, attr.base + getNum(attr.mod));
        spentStats += (attr.base - 1);
    });
    system.secondary.spentStats = { value: spentStats };

    // 2. НАВЫКИ (Исправленный цикл)
    let spentSkills = 0;
    const skillConfig = {
        melee: ["str", "agi"],
        ranged: ["agi", "per"],
        science: "int4", // специальный ключ для int * 4
        mechanical: ["int", "max_str_agi"],
        medical: ["int", "per"],
        diplomacy: ["cha", "per"],
        leadership: ["cha", "int"],
        survival: ["per", "max_vig_int"],
        athletics: ["str", "agi"],
        stealth: ["agi", "per"]
    };

    for (let [key, skill] of Object.entries(system.skills)) {
        const s = system.attributes;
        const cfg = skillConfig[key];

        // Расчет базы
        if (cfg === "int4") {
            skill.base = s.int.value * 4;
        } else if (cfg[1] === "max_str_agi") {
            skill.base = s.int.value + Math.max(s.str.value, s.agi.value);
        } else if (cfg[1] === "max_vig_int") {
            skill.base = s.per.value + Math.max(s.vig.value, s.int.value);
        } else {
            skill.base = s[cfg[0]].value + s[cfg[1]].value;
        }

        const invested = getNum(skill.points);
        const modifier = getNum(skill.mod);
        spentSkills += invested;

        // Итог
        skill.value = Math.max(0, Math.min(100, skill.base + invested + modifier));
    }
    system.secondary.spentSkills = { value: spentSkills };

    // 3. HP / AP (Hard Cap 0)
    const baseMaxHP = 70 + (system.attributes.vig.value - 1) * 10;
    system.resources.hp.max = Math.max(10, baseMaxHP - getNum(system.resources.hp.penalty));
    
    const baseAP = 7 + Math.ceil((system.attributes.agi.value - 1) / 2);
    const encumbrance = (system.secondary.isOverburdened) ? 2 : 0;
    system.resources.ap.max = Math.max(0, baseAP + getNum(system.resources.ap.bonus) + getNum(system.resources.ap.effect) - encumbrance);
}

  hasStatusEffect(statusId) {
    return this.effects.some(
      (e) => e.statuses.has(statusId) || e.flags?.core?.statusId === statusId
    );
  }

  async onTurnStart() {
    let maxAP = this.system.resources.ap.max;
    if (this.hasStatusEffect("immolated")) {
      const fireRoll = new Roll("1d6");
      await fireRoll.evaluate();
      const fireDmg = fireRoll.total;
      await this.applyDamage(fireDmg, "true", "torso"); 
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div style="color:orange; font-weight:bold;">🔥 ГОРИТ ЗАЖИВО! 🔥</div><div>Урон: ${fireDmg}</div>`,
      });
      if (this.type !== "zombie") maxAP = Math.max(0, maxAP - 4);
    }
    await this.update({ "system.resources.ap.value": maxAP });
    
    if (this.hasStatusEffect("bleeding")) {
      const roll = new Roll("1d5");
      await roll.evaluate();
      await this.applyDamage(roll.total, "true", "torso");
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `Кровотечение: -${roll.total} HP`,
      });
    }
    if (this.hasStatusEffect("poisoned")) {
      const roll = new Roll("1d6");
      await roll.evaluate();
      await this.applyDamage(roll.total, "true", "torso");
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `Отравление: -${roll.total} HP`,
      });
    }
    if (this.hasStatusEffect("panic")) await Dice.rollPanicTable(this);
  }

  // --- APPLY DAMAGE ---
  async applyDamage(amount, type = "blunt", limb = "torso") {
    const undoData = {
        uuid: this.uuid, // <--- ФИКС 1: Используем UUID вместо ID для поддержки Токенов
        updates: {},
        createdEffectIds: []
    };

    let originalAmount = amount;
    if (this.type === "zombie" && type === "fire") amount *= 2;

    let totalResist = 0;
    let totalAC = 0;

    if (type !== "true") {
      const naturalAC = this.system.secondary?.naturalAC?.value || 0;
      totalAC += naturalAC;
      const armors = this.items.filter(
        (i) => i.type === "armor" && i.system.equipped && i.system.coverage && i.system.coverage[limb]
      );
      for (let armor of armors) {
        totalResist += Number(armor.system.dr[type]) || 0;
        totalAC += Number(armor.system.ac) || 0;
      }
      totalResist = Math.min(100, totalResist);
    }

    const dmg = Math.max(0, Math.floor(amount * (1 - totalResist / 100) - totalAC));

    // ДЕТАЛИЗАЦИЯ ПОГЛОЩЕНИЯ (Лог для ГМа)
    // ФИКС 2: blind: true скрывает сообщение от игрока-отправителя
    ChatMessage.create({
        content: `<div style="font-size:0.85em; color:#555; background:#eee; padding:3px; border:1px solid #ccc;">
                    <b>Absorb Log (${this.name})</b><br>
                    Raw: ${originalAmount} (${type})<br>
                    Armor AC: -${totalAC}<br>
                    Resist: -${totalResist}%<br>
                    <b>Final: ${dmg}</b>
                  </div>`,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        blind: true, // <--- ВАЖНО
        speaker: { alias: "System" }
    });

    if (dmg > 0) {
      const currentHP = this.system.resources.hp.value;
      const newHP = currentHP - dmg;
      
      undoData.updates["system.resources.hp.value"] = currentHP;
      const updateData = { "system.resources.hp.value": newHP };

      if (this.system.limbs && this.system.limbs[limb]) {
        const currentLimbVal = this.system.limbs[limb].value;
        const newLimbHP = Math.max(0, currentLimbVal - dmg);
        
        undoData.updates[`system.limbs.${limb}.value`] = currentLimbVal;
        updateData[`system.limbs.${limb}.value`] = newLimbHP;
        
        if (currentLimbVal > 0 && newLimbHP <= 0) {
          const addedIds = await this._applyInjury(limb);
          if(addedIds) undoData.createdEffectIds.push(...addedIds);
        }
      }

      await this.update(updateData);

      const vig = this.system.attributes?.vig?.value || 1;
      const deathThreshold = -(vig * 5);

      if (newHP <= deathThreshold && !this.hasStatusEffect("dead")) {
          const eff = await this.createEmbeddedDocuments("ActiveEffect", [{id:"dead", name:"Мертв", icon:"icons/svg/skull.svg", statuses:["dead"]}]);
          undoData.createdEffectIds.push(eff[0].id);
      } 
      else if (currentHP > 0 && newHP <= 0 && !this.hasStatusEffect("status-unconscious")) {
          const eff1 = await this.createEmbeddedDocuments("ActiveEffect", [INJURY_EFFECTS.unconscious]);
          undoData.createdEffectIds.push(eff1[0].id);
          
          const eff2 = await this._applyBleeding("torso"); 
          if(eff2) undoData.createdEffectIds.push(eff2);
      }

      if (this.type !== "zombie" && this.type !== "shelter" && newHP > deathThreshold) {
        await this.checkPanic(dmg);
      }
      
      const _limbNames = {head:"Голова", torso:"Торс", lArm:"Л.Рука", rArm:"П.Рука", lLeg:"Л.Нога", rLeg:"П.Нога"};
      ui.notifications.info(`${this.name}: -${dmg} HP (${_limbNames[limb] || limb})`);
      
      return undoData;

    } else {
        ui.notifications.info(`${this.name}: Урон поглощен броней!`);
        return null;
    }
  }

  async _applyBleeding(limb) {
      const base = GLOBAL_STATUSES.bleeding;
      const uniqueId = `bleeding-${limb}`;
      
      // Проверка на дубликаты
      const exists = this.effects.some(e => e.id === uniqueId);
      if (exists) return null; // Возвращаем null, если эффект уже есть

      const eff = foundry.utils.deepClone(base);
      eff.id = uniqueId;
      eff.name = `Кровотечение (${limb})`;
      eff.statuses = ["bleeding", uniqueId]; 

      const created = await this.createEmbeddedDocuments("ActiveEffect", [eff]);
      return created[0].id;
  }

  async checkPanic(damageAmount) {
    if (this.hasStatusEffect("panic") || this.hasStatusEffect("dead") || this.hasStatusEffect("status-unconscious")) return;
    const bravery = this.system.secondary.bravery.value || 0;
    const tenacity = this.system.secondary.tenacity.value || 0;
    if (damageAmount > tenacity) {
      const roll = new Roll("1d100"); await roll.evaluate();
      const saveTarget = bravery * 5;
      if (roll.total > saveTarget) await Dice.rollPanicTable(this);
    }
  }

  // --- ЛЕЧЕНИЕ ---
  async useMedicine(item) {
    const targets = Array.from(game.user.targets);
    if (targets.length === 0) return ui.notifications.warn("Выберите цель!");
    const targetActor = targets[0].actor;

    const limbs = {
      torso: "Торс (ОБЩ)", head: "Голова", lArm: "Л.Рука", rArm: "П.Рука", lLeg: "Л.Нога", rLeg: "П.Нога",
    };
    let options = "";
    for (let [k, v] of Object.entries(limbs)) {
      const lData = targetActor.system.limbs[k];
      options += `<option value="${k}">${v} (${lData.value}/${lData.max})</option>`;
    }

    new Dialog({
      title: `Лечение: ${item.name}`,
      content: `<form><div class="form-group"><label>Лечить зону:</label><select id="limb-select">${options}</select></div></form>`,
      buttons: {
        heal: {
          label: "Применить",
          callback: async (html) => {
            const limbKey = html.find("#limb-select").val();
            await this._applyMedicineLogic(targetActor, item, limbKey);
          },
        },
      },
    }).render(true);
  }

  async _applyMedicineLogic(targetActor, item, limbKey) {
      if (item.system.isAntibiotic) {
          const inf = targetActor.system.resources.infection;
          if (inf.active || inf.stage > 0) {
               await targetActor.update({
                  "system.resources.infection.active": false,
                  "system.resources.infection.stage": Math.max(0, inf.stage - 1)
              });
              ui.notifications.info("Инфекция снижена.");
              await this._consumeItem(item);
              return;
          }
      }

      const medSkill = this.system.skills.medical.value || 0;
      const skillBonus = Math.floor(medSkill / 5); 
      const baseHeal = Number(item.system.healAmount) || 0;
      const totalHeal = baseHeal + skillBonus;
      const penaltyIncrease = Math.max(5, baseHeal - skillBonus); 

      const updates = {};
      const res = targetActor.system.resources.hp;
      const newHP = Math.min(res.max, res.value + totalHeal);
      const newPenalty = (res.penalty || 0) + penaltyIncrease;
      
      updates["system.resources.hp.value"] = newHP;
      updates["system.resources.hp.penalty"] = newPenalty;

      if (targetActor.system.limbs && targetActor.system.limbs[limbKey]) {
          const lData = targetActor.system.limbs[limbKey];
          const newLimbPenalty = (lData.penalty || 0) + penaltyIncrease;
          updates[`system.limbs.${limbKey}.penalty`] = newLimbPenalty;
          updates[`system.limbs.${limbKey}.value`] = lData.value + totalHeal;
      }

      await targetActor.update(updates);
      await this._consumeItem(item);

      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this}),
          content: `<div class="z-chat-card">
                      <div class="z-card-header">ЛЕЧЕНИЕ (${limbKey})</div>
                      <div>${this.name} лечит ${targetActor.name}.</div>
                      <div style="color:green; font-weight:bold;">+${totalHeal} HP</div>
                      ${penaltyIncrease > 0 ? `<div style="color:red; font-size:0.8em;">-${penaltyIncrease} Max HP (Штраф)</div>` : ""}
                    </div>`
      });
  }

  // ОТДЫХ
  async longRest() {
    if (this.type === "zombie") return;
    const vig = this.system.attributes.vig.value;
    const hpRecovery = 10 + vig;
    const penRecovery = 10;
    const curHP = this.system.resources.hp.value;
    const curPenalty = this.system.resources.hp.penalty || 0;
    const newPenalty = Math.max(0, curPenalty - penRecovery);
    const baseMaxHP = 70 + (vig - 1) * 10;
    const newMaxHP = baseMaxHP - newPenalty;
    const newHP = Math.min(newMaxHP, curHP + hpRecovery);

    const updates = {
      "system.resources.hp.penalty": newPenalty,
      "system.resources.hp.value": newHP,
      "system.resources.ap.value": this.system.resources.ap.max,
    };

    const limbRecovery = 5 + Math.floor(vig / 2);
    const limbPenRecovery = 5;

    for (const key of Object.keys(this.system.limbs)) {
      const l = this.system.limbs[key];
      const lNewPenalty = Math.max(0, (l.penalty || 0) - limbPenRecovery);
      updates[`system.limbs.${key}.penalty`] = lNewPenalty;
      updates[`system.limbs.${key}.value`] = l.value + limbRecovery;
    }
    await this.update(updates);
    ui.notifications.info(`${this.name}: Отдых завершен.`);
  }

  async _applyInjury(limb) {
    let effectData = null;
    if (limb === "head") effectData = INJURY_EFFECTS.head;
    else if (limb === "torso") effectData = INJURY_EFFECTS.torso;
    else if (limb.includes("Arm")) effectData = INJURY_EFFECTS.arm;
    else if (limb.includes("Leg")) effectData = INJURY_EFFECTS.leg;

    if (effectData) {
      const exists = this.effects.some((e) => e.statuses.has(effectData.id));
      let finalId = effectData.id;
      if (limb.includes("Arm") || limb.includes("Leg")) {
          finalId = `${effectData.id}-${limb}`; 
      }
      const realExists = this.effects.some(e => e.id === finalId || (e.statuses && e.statuses.has(finalId)));
      
      if (!realExists) {
        const eff = foundry.utils.deepClone(effectData);
        eff.id = finalId; 
        eff.name += ` (${limb})`;
        eff.statuses = [finalId]; 
        const created = await this.createEmbeddedDocuments("ActiveEffect", [eff]);
        return created.map(c => c.id);
      }
    }
    return [];
  }

  async _consumeItem(item) {
    const qty = item.system.quantity;
    if (qty > 1) await item.update({ "system.quantity": qty - 1 });
    else await item.delete();
  }

  getRollData() {
    return { ...super.getRollData(), ...this.system };
  }

  async rollAttribute(attrKey) {
      const attr = this.system.attributes[attrKey];
      const label = { str: "СИЛА", agi: "ЛОВКОСТЬ", vig: "ЖИВУЧЕСТЬ", per: "ВОСПРИЯТИЕ", int: "ИНТЕЛЛЕКТ", cha: "ХАРИЗМА" }[attrKey] || attrKey;

      Dice.showRollDialog(label, async (modifier, rollMode) => {
          const formula = `1d10 + @attr + @mod`;
          const rollData = { attr: attr.value, mod: modifier };
          const roll = new Roll(formula, rollData);
          await roll.evaluate();

          await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: this }),
              flavor: `Проверка характеристики: <b>${label}</b>${modifier!==0 ? ` (Mod: ${modifier})` : ""}`,
              flags: { zsystem: { type: "attribute", key: attrKey } }
          }, { rollMode: rollMode });
      });
  }

  async rollSkill(skillId) {
    return Dice.rollSkill(this, skillId);
  }

  async performAttack(itemId) {
    return Dice.performAttack(this, itemId);
  }

  async reloadWeapon(item) {
    if (item.type !== "weapon") return;
    const ammoType = item.system.ammoType;
    if (!ammoType) return ui.notifications.warn("Этому оружию не нужны патроны.");

    const maxMag = Number(item.system.mag.max) || 0;
    const currentMag = Number(item.system.mag.value) || 0;
    if (currentMag >= maxMag) return ui.notifications.info("Магазин полон.");

    const apCost = Number(item.system.reloadAP) || 0;
    if (this.system.resources.ap.value < apCost)
      return ui.notifications.warn(`Нужно ${apCost} AP для перезарядки.`);

    const ammoItem = this.items.find((i) => i.type === "ammo" && i.system.calibre === ammoType);
    if (!ammoItem) return ui.notifications.warn(`Нет патронов калибра "${ammoType}".`);

    const needed = maxMag - currentMag;
    const available = ammoItem.system.quantity;
    const toLoad = Math.min(needed, available);

    await this.update({ "system.resources.ap.value": this.system.resources.ap.value - apCost });
    await item.update({ "system.mag.value": currentMag + toLoad });

    if (available - toLoad <= 0) await ammoItem.delete();
    else await ammoItem.update({ "system.quantity": available - toLoad });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `${this.name} перезаряжает ${item.name} (${toLoad} пт.).` });
  }

  async standUp() {
    const proneEffect = this.effects.find((e) => e.statuses.has("prone"));
    if (!proneEffect) return ui.notifications.info("Персонаж уже стоит.");
    const cost = 3;
    const curAP = this.system.resources.ap.value;
    if (curAP < cost) return ui.notifications.warn(`Недостаточно AP (${cost}).`);
    await proneEffect.delete();
    await this.update({ "system.resources.ap.value": curAP - cost });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<b>${this.name}</b> встает (-${cost} AP).` });
  }

  async riseAsZombie() {
    if (this.type !== "survivor" && this.type !== "npc") return;
    const tokens = this.getActiveTokens();
    const pos = tokens.length > 0 ? { x: tokens[0].x, y: tokens[0].y } : { x: 0, y: 0 };
    const zombieData = { name: `Zombie (${this.name})`, type: "zombie", img: "icons/svg/skull.svg" };
    const newZombie = await Actor.create(zombieData);
    const itemsToCopy = this.items.map((i) => i.toObject());
    if (itemsToCopy.length > 0) await newZombie.createEmbeddedDocuments("Item", itemsToCopy);
    const allowedStatuses = ["immolated", "bleeding"];
    const effectsToCopy = this.effects.filter((e) => e.statuses.some((s) => allowedStatuses.includes(s))).map((e) => e.toObject());
    if (effectsToCopy.length > 0) await newZombie.createEmbeddedDocuments("ActiveEffect", effectsToCopy);
    if (tokens.length > 0) {
      const scene = game.scenes.current;
      await scene.createEmbeddedDocuments("Token", [{ name: newZombie.name, actorId: newZombie.id, img: this.img, x: pos.x, y: pos.y }]);
      await tokens[0].document.delete();
    }
    ui.notifications.notify(`${this.name} восстает из мертвых!`);
  }

  async fullHeal() {
    const updates = {
      "system.resources.hp.value": this.system.resources.hp.max,
      "system.resources.hp.penalty": 0,
      "system.resources.ap.value": this.system.resources.ap.max,
    };
    if (this.system.limbs) {
      for (const key of Object.keys(this.system.limbs)) {
        updates[`system.limbs.${key}.value`] = this.system.limbs[key].max;
      }
    }
    const effectsToDelete = this.effects.filter((e) => {
        const isInjury = Object.values(INJURY_EFFECTS).some((ie) => e.statuses.has(ie.id));
        const isGlobal = Object.values(GLOBAL_STATUSES).some((gs) => e.statuses.has(gs.id));
        return isInjury || isGlobal || e.statuses.has("dead");
    }).map((e) => e.id);
    if (effectsToDelete.length > 0) await this.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    await this.update(updates);
  }
}