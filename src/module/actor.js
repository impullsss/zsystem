import * as Dice from "./dice.js";
import { INJURY_EFFECTS, GLOBAL_STATUSES } from "./constants.js";

export class ZActor extends Actor {
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    if (userId !== game.user.id) return;

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

    // Лут: отключение зрения
    if (["container", "harvest_spot"].includes(this.type)) {
      await this.update({
        "prototypeToken.sight.enabled": false,
        "prototypeToken.actorLink": false,
        "ownership.default": 0,
      });
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
            default: {
              name: "Укус",
              ap: 5,
              dmg: "4d6 + 11",
              mod: 10,
              effect: "infected",
              chance: 40,
            },
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
            default: {
              name: "Раздирание",
              ap: 4,
              dmg: "3d4 + 7",
              mod: 0,
              effect: "bleeding",
              chance: 25,
            },
          },
        },
      },
    ];
  }

  prepareBaseData() {
    const system = this.system;
    if (this.type === "shelter" || this.type === "container") return;

    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.limbs) system.limbs = {};

    const limbKeys = ["head", "torso", "lArm", "rArm", "lLeg", "rLeg"];
    limbKeys.forEach((k) => {
      if (!system.limbs[k])
        system.limbs[k] = { value: 10, max: 10, penalty: 0 };
      if (typeof system.limbs[k].penalty === "undefined")
        system.limbs[k].penalty = 0;
    });

    const attrKeys = ["str", "agi", "vig", "per", "int", "cha"];
    attrKeys.forEach((key) => {
      if (!system.attributes[key])
        system.attributes[key] = { base: 1, value: 1, mod: 0 };
      const attr = system.attributes[key];
      if (attr.base === undefined) attr.base = attr.value || 1;
      attr.value = Number(attr.base) || 1;
      attr.mod = 0;
    });

    if (!system.resources.ap)
      system.resources.ap = { value: 7, max: 7, bonus: 0, effect: 0 };
    if (!system.resources.infection)
      system.resources.infection = { value: 0, stage: 0, active: false };
    system.resources.ap.effect = 0;
    if (!system.secondary.xp) system.secondary.xp = { value: 0 };
  }

  prepareDerivedData() {
    const system = this.system;
    if (this.type === "shelter" || this.type === "container") return;
    if (!system.attributes) return;

    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};
    if (!system.skills) system.skills = {};

    const getNum = (val) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };
    const s = {};

    let spentStats = 0;
    const attrKeys = ["str", "agi", "vig", "per", "int", "cha"];
    attrKeys.forEach((key) => {
      const attr = system.attributes[key];
      attr.base = Math.max(1, Math.min(10, attr.base));
      attr.value = Math.max(1, attr.value);
      attr.mod = attr.value - attr.base;
      spentStats += attr.base - 1;
      s[key] = attr.value;
    });

    if (!system.secondary.spentStats)
      system.secondary.spentStats = { value: 0 };
    system.secondary.spentStats.value = spentStats;

    system.secondary.bravery = { value: Math.floor((s.cha + s.per) / 2) };
    system.secondary.tenacity = { value: s.vig };

    // HP (General)
    if (this.type !== "zombie") {
      if (!system.resources.hp)
        system.resources.hp = { value: 70, max: 70, penalty: 0 };
      const baseMaxHP = 70 + (s.vig - 1) * 10;
      const hpPenalty = getNum(system.resources.hp.penalty);
      system.resources.hp.max = Math.max(10, baseMaxHP - hpPenalty);
      if (system.resources.hp.value > system.resources.hp.max)
        system.resources.hp.value = system.resources.hp.max;
    }

    // AP
    if (this.type !== "zombie") {
      const baseAP = 7 + Math.ceil((s.agi - 1) / 2);
      const userBonus = getNum(system.resources.ap.bonus);
      const effectBonus = getNum(system.resources.ap.effect);
      system.resources.ap.max = Math.max(0, baseAP + userBonus + effectBonus);
    }

    if (!system.secondary.carryWeight)
      system.secondary.carryWeight = { value: 0, max: 0 };
    system.secondary.carryWeight.max = 40 + (s.str - 1) * 10;
    let totalWeight = 0;
    if (this.items) {
      this.items.forEach((item) => {
        totalWeight +=
          getNum(item.system.weight) * getNum(item.system.quantity);
      });
    }
    system.secondary.carryWeight.value = Math.round(totalWeight * 100) / 100;

    let naturalAC = Math.floor(s.vig / 2);
    if (!system.secondary.naturalAC) system.secondary.naturalAC = { value: 0 };
    system.secondary.naturalAC.value = naturalAC;

    if (!system.secondary.evasion) system.secondary.evasion = { value: 0 };
    system.secondary.evasion.value = s.agi;

    let spentSkills = 0;
    const skillConfig = {
      melee: { a1: "str", a2: "agi" },
      ranged: { a1: "agi", a2: "per" },
      science: { a1: "int", mult: 4 },
      mechanical: { a1: "int", altA2: ["str", "agi"] },
      medical: { a1: "int", a2: "per" },
      diplomacy: { a1: "cha", a2: "per" },
      leadership: { a1: "cha", a2: "int" },
      survival: { a1: "per", altA2: ["vig", "int"] },
      athletics: { a1: "str", a2: "agi" },
      stealth: { a1: "agi", a2: "per" },
    };

    for (let [key, conf] of Object.entries(skillConfig)) {
      if (!system.skills[key])
        system.skills[key] = { base: 0, value: 0, points: 0 };
      const skill = system.skills[key];
      if (this.type === "zombie" && skill.base > 0) {
      } else {
        if (key === "science") skill.base = s.int * 4;
        else if (key === "mechanical")
          skill.base = s.int + Math.max(s.str, s.agi);
        else if (key === "survival")
          skill.base = s.per + Math.max(s.vig, s.int);
        else skill.base = s[conf.a1] + s[conf.a2];
      }
      const invested = getNum(skill.points);
      spentSkills += invested;
      skill.value = Math.min(100, skill.base + invested);
    }
    if (!system.secondary.spentSkills)
      system.secondary.spentSkills = { value: 0 };
    system.secondary.spentSkills.value = spentSkills;

    // --- LIMBS CALCULATION (С учетом пенальти) ---
    if (this.type !== "zombie") {
      const totalHP = system.resources.hp.max; // Это уже макс с учетом общего штрафа

      const setLimb = (part, percent) => {
        const limb = system.limbs[part];
        // Базовый макс от текущего общего Макс ХП
        const baseMax = Math.floor(totalHP * percent);
        // Вычитаем пенальти конечности
        limb.max = Math.max(1, baseMax - (limb.penalty || 0));

        // Кап (чтобы текущее не было больше макса)
        if (limb.value > limb.max) limb.value = limb.max;
      };

      setLimb("head", 0.2);
      setLimb("torso", 0.45);
      setLimb("lArm", 0.15);
      setLimb("rArm", 0.15);
      setLimb("lLeg", 0.2);
      setLimb("rLeg", 0.2);
    }
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
      let newHP = this.system.resources.hp.value - fireDmg;
      const updates = { "system.resources.hp.value": newHP };
      const limbs = ["head", "torso", "lArm", "rArm", "lLeg", "rLeg"];
      for (let limb of limbs) {
        if (this.system.limbs && this.system.limbs[limb]) {
          const currentLimbHP = this.system.limbs[limb].value;
          updates[`system.limbs.${limb}.value`] = Math.max(
            0,
            currentLimbHP - fireDmg
          );
        }
      }
      await this.update(updates);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div style="color:orange; font-weight:bold;">🔥 ГОРИТ ЗАЖИВО! 🔥</div><div>Урон: ${fireDmg} по всем частям тела.</div>`,
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

  // --- APPLY DAMAGE (С GM LOG И ПАНИКОЙ) ---
  async applyDamage(amount, type = "blunt", limb = "torso") {
    if (this.type === "zombie" && type === "fire") amount *= 2;

    let totalResist = 0;
    let totalAC = 0;

    if (type !== "true") {
      const naturalAC = this.system.secondary?.naturalAC?.value || 0;
      totalAC += naturalAC;
      const armors = this.items.filter(
        (i) =>
          i.type === "armor" &&
          i.system.equipped &&
          i.system.coverage &&
          i.system.coverage[limb]
      );
      for (let armor of armors) {
        totalResist += Number(armor.system.dr[type]) || 0;
        totalAC += Number(armor.system.ac) || 0;
      }
      totalResist = Math.min(100, totalResist);
    }

    const dmg = Math.max(
      0,
      Math.floor(amount * (1 - totalResist / 100) - totalAC)
    );

    if (dmg > 0) {
      const newHP = this.system.resources.hp.value - dmg;
      const updateData = { "system.resources.hp.value": newHP };

      if (this.system.limbs && this.system.limbs[limb]) {
        const currentLimbVal = this.system.limbs[limb].value;
        const newLimbHP = currentLimbVal - dmg;
        updateData[`system.limbs.${limb}.value`] = newLimbHP;

        // Авто-Травма
        if (currentLimbVal > 0 && newLimbHP <= 0) {
          await this._applyInjury(limb);
          ui.notifications.error(
            `${this.name}: ${limb.toUpperCase()} повреждена!`
          );
        }
      }

      const vig = this.system.attributes?.vig?.value || 1;
      const deathThreshold = -(vig * 5);

      if (newHP <= deathThreshold) {
        if (!this.hasStatusEffect("dead")) {
          await this.createEmbeddedDocuments("ActiveEffect", [
            {
              id: "dead",
              name: "Мертв",
              icon: "icons/svg/skull.svg",
              statuses: ["dead"],
            },
          ]);
          ui.notifications.error(`${this.name} ПОГИБАЕТ!`);
        }
      } else if (this.system.resources.hp.value > 0 && newHP <= 0) {
        if (!this.hasStatusEffect("status-unconscious")) {
          await this.createEmbeddedDocuments("ActiveEffect", [
            INJURY_EFFECTS.unconscious,
            GLOBAL_STATUSES.bleeding,
          ]);
        }
      }

      await this.update(updateData);

      // ПАНИКА (Восстановлено)
      if (
        this.type !== "zombie" &&
        this.type !== "shelter" &&
        newHP > deathThreshold
      ) {
        await this.checkPanic(dmg);
      }
    }

    // GM LOG
    const _getLimbName = (k) =>
      ({
        head: "Голова",
        torso: "Торс",
        lArm: "Л.Рука",
        rArm: "П.Рука",
        lLeg: "Л.Нога",
        rLeg: "П.Нога",
      }[k] || k);
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="z-damage-result" style="border-left: 5px solid darkred; padding-left:5px; font-size:0.8em; background:#eee; color:#000;">
                    <b>(GM) Результат урона:</b><br>
                    Входящий: ${amount} (${type})<br>
                    Броня: -${totalAC} (Resist ${totalResist}%)<br>
                    <b>Итог: -${dmg} HP</b> (${_getLimbName(limb)})
                  </div>`,
      whisper: ChatMessage.getWhisperRecipients("GM"),
    });
  }

  // ПРОВЕРКА ПАНИКИ
  async checkPanic(damageAmount) {
    if (this.hasStatusEffect("panic")) return;

    const bravery = this.system.secondary.bravery.value || 0;
    const tenacity = this.system.secondary.tenacity.value || 0;

    if (damageAmount > tenacity) {
      const roll = new Roll("1d100");
      await roll.evaluate();
      const saveTarget = bravery * 5;

      if (roll.total > saveTarget) {
        await Dice.rollPanicTable(this);
      }
    }
  }

  // --- ЛЕЧЕНИЕ (С GM LOG) ---
  async useMedicine(item) {
    const targets = Array.from(game.user.targets);
    if (targets.length === 0) return ui.notifications.warn("Выберите цель!");
    const targetActor = targets[0].actor;

    const limbs = {
      torso: "Торс (ОБЩ)",
      head: "Голова",
      lArm: "Л.Рука",
      rArm: "П.Рука",
      lLeg: "Л.Нога",
      rLeg: "П.Нога",
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
      
      // --- ИСПРАВЛЕНА ФОРМУЛА ШТРАФА (Минимум 5) ---
      const penaltyIncrease = Math.max(5, baseHeal - skillBonus); 
      // --------------------------------------------------

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

      ChatMessage.create({
          content: `<div style="background:#eee; padding:5px; border:1px solid #999; font-size:0.8em;">
            <b>(GM) Medicine Info:</b><br>
            Skill: ${medSkill} (Bonus ${skillBonus})<br>
            Item Base: ${baseHeal}<br>
            <b>Penalty Added: ${penaltyIncrease}</b> (Limb: ${limbKey})
          </div>`,
          whisper: ChatMessage.getWhisperRecipients("GM")
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
      const lPenalty = l.penalty || 0;
      const lNewPenalty = Math.max(0, lPenalty - limbPenRecovery);

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
      if (!exists) {
        const eff = foundry.utils.deepClone(effectData);
        eff.name += ` (${limb})`;
        await this.createEmbeddedDocuments("ActiveEffect", [eff]);
      }
    }
  }

  async _consumeItem(item) {
    const qty = item.system.quantity;
    if (qty > 1) await item.update({ "system.quantity": qty - 1 });
    else await item.delete();
  }

  getRollData() {
    return { ...super.getRollData(), ...this.system };
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
    if (!ammoType)
      return ui.notifications.warn("Этому оружию не нужны патроны.");

    const maxMag = Number(item.system.mag.max) || 0;
    const currentMag = Number(item.system.mag.value) || 0;
    if (currentMag >= maxMag) return ui.notifications.info("Магазин полон.");

    const apCost = Number(item.system.reloadAP) || 0;
    if (this.system.resources.ap.value < apCost)
      return ui.notifications.warn(`Нужно ${apCost} AP для перезарядки.`);

    const ammoItem = this.items.find(
      (i) => i.type === "ammo" && i.system.calibre === ammoType
    );
    if (!ammoItem)
      return ui.notifications.warn(`Нет патронов калибра "${ammoType}".`);

    const needed = maxMag - currentMag;
    const available = ammoItem.system.quantity;
    const toLoad = Math.min(needed, available);

    await this.update({
      "system.resources.ap.value": this.system.resources.ap.value - apCost,
    });
    await item.update({ "system.mag.value": currentMag + toLoad });

    if (available - toLoad <= 0) await ammoItem.delete();
    else await ammoItem.update({ "system.quantity": available - toLoad });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `${this.name} перезаряжает ${item.name} (${toLoad} пт.).`,
    });
  }

  async standUp() {
    const proneEffect = this.effects.find((e) => e.statuses.has("prone"));
    if (!proneEffect) return ui.notifications.info("Персонаж уже стоит.");
    const cost = 3;
    const curAP = this.system.resources.ap.value;
    if (curAP < cost)
      return ui.notifications.warn(`Недостаточно AP (${cost}).`);
    await proneEffect.delete();
    await this.update({ "system.resources.ap.value": curAP - cost });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<b>${this.name}</b> встает (-${cost} AP).`,
    });
  }

  async riseAsZombie() {
    if (this.type !== "survivor" && this.type !== "npc") return;
    const tokens = this.getActiveTokens();
    const pos =
      tokens.length > 0 ? { x: tokens[0].x, y: tokens[0].y } : { x: 0, y: 0 };
    const zombieData = {
      name: `Zombie (${this.name})`,
      type: "zombie",
      img: "icons/svg/skull.svg",
    };
    const newZombie = await Actor.create(zombieData);
    const itemsToCopy = this.items.map((i) => i.toObject());
    if (itemsToCopy.length > 0)
      await newZombie.createEmbeddedDocuments("Item", itemsToCopy);
    const allowedStatuses = ["immolated", "bleeding"];
    const effectsToCopy = this.effects
      .filter((e) => e.statuses.some((s) => allowedStatuses.includes(s)))
      .map((e) => e.toObject());
    if (effectsToCopy.length > 0)
      await newZombie.createEmbeddedDocuments("ActiveEffect", effectsToCopy);
    if (tokens.length > 0) {
      const scene = game.scenes.current;
      await scene.createEmbeddedDocuments("Token", [
        {
          name: newZombie.name,
          actorId: newZombie.id,
          img: this.img,
          x: pos.x,
          y: pos.y,
        },
      ]);
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
    const effectsToDelete = this.effects
      .filter((e) => {
        const isInjury = Object.values(INJURY_EFFECTS).some((ie) =>
          e.statuses.has(ie.id)
        );
        const isGlobal = Object.values(GLOBAL_STATUSES).some((gs) =>
          e.statuses.has(gs.id)
        );
        return isInjury || isGlobal || e.statuses.has("dead");
      })
      .map((e) => e.id);
    if (effectsToDelete.length > 0)
      await this.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    await this.update(updates);
  }
}

function _getLimbName(key) {
  return (
    {
      head: "Голова",
      torso: "Торс",
      lArm: "Л.Рука",
      rArm: "П.Рука",
      lLeg: "Л.Нога",
      rLeg: "П.Нога",
    }[key] || key
  );
}
