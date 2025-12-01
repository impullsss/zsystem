import * as Dice from "./dice.js";
import { INJURY_EFFECTS, GLOBAL_STATUSES } from "./constants.js";

export class ZActor extends Actor {
  /** @override */
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    
    // Выполняем только на клиенте того, кто создал (обычно GM)
    if (userId !== game.user.id) return;

    // --- ЛОГИКА ДЛЯ ЗОМБИ ---
    if (this.type === "zombie") {
        const updates = {};
        const system = this.system;

        // Авто-статы, если пусто
        if (!system.attributes.str || system.attributes.str.value <= 1) {
            updates["system.attributes"] = {
                str: { base: 8, value: 8 }, 
                agi: { base: 4, value: 4 }, 
                vig: { base: 10, value: 10 }, 
                per: { base: 5, value: 5 }, 
                int: { base: 1, value: 1 }, 
                cha: { base: 1, value: 1 }
            };
        }
        // Авто-ресурсы
        if (!system.resources.hp || system.resources.hp.max <= 10) {
            updates["system.resources.hp"] = { value: 80, max: 80 };
            updates["system.resources.ap"] = { value: 9, max: 9 };
            updates["system.limbs"] = {
                head: { value: 16, max: 16 }, torso: { value: 36, max: 36 },
                lArm: { value: 12, max: 12 }, rArm: { value: 12, max: 12 },
                lLeg: { value: 16, max: 16 }, rLeg: { value: 16, max: 16 }
            };
        }
        
        if (Object.keys(updates).length > 0) await this.update(updates);

        // Выдача оружия
        const hasWeapons = this.items.some(i => i.type === "weapon");
        if (!hasWeapons) {
            await this.createEmbeddedDocuments("Item", this._getZombieNaturalWeapons());
        }
    }

    // --- ЛОГИКА ДЛЯ КОНТЕЙНЕРОВ И ТОЧЕК СБОРА ---
    if (["container", "harvest_spot"].includes(this.type)) {
        const updates = {};
        
        // 1. Отключаем Зрение и Связь (чтобы не перехватывал камеру)
        if (this.prototypeToken.sight?.enabled !== false) {
             updates["prototypeToken.sight.enabled"] = false;
             updates["prototypeToken.actorLink"] = false; 
             updates["prototypeToken.disposition"] = 0; 
        }

        // 2. ВЫДАЕМ ПРАВА ИГРОКАМ (OBSERVER)
        // 0 = None, 1 = Limited, 2 = Observer, 3 = Owner
        // Мы ставим default: 2. Это значит "Все игроки видят лист".
        updates["ownership.default"] = 0; 

        if (Object.keys(updates).length > 0) {
            await this.update(updates);
        }
    }
  }

  _getZombieNaturalWeapons() {
    return [
      {
        name: "Гнилые Зубы",
        type: "weapon",
        // ОБНОВЛЕННАЯ ИКОНКА
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
          description: "Смертельный укус. Может вызвать инфекцию.",
        },
      },
      {
        name: "Когти",
        type: "weapon",
        // ОБНОВЛЕННАЯ ИКОНКА
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

    // Игнорируем shelter/container, а для зомби данные теперь готовятся в _onCreate
    if (this.type === "shelter" || this.type === "container") return;

    if (!system.attributes) system.attributes = {};
    if (!system.resources) system.resources = {};
    if (!system.secondary) system.secondary = {};

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
    if (!system.limbs) system.limbs = {};

    const getNum = (val) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };
    const s = {};

    let spentStats = 0;
    const attrKeys = ["str", "agi", "vig", "per", "int", "cha"];
    attrKeys.forEach((key) => {
      if (!system.attributes[key])
        system.attributes[key] = { base: 1, value: 1, mod: 0 };
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

    // --- HP CALCULATION (Только для выживших и NPC, у зомби свои статы из _onCreate) ---
    if (this.type !== "zombie") {
      if (!system.resources.hp)
        system.resources.hp = { value: 70, max: 70, penalty: 0 };
      const baseMaxHP = 70 + (s.vig - 1) * 10;
      const hpPenalty = getNum(system.resources.hp.penalty);
      system.resources.hp.max = Math.max(10, baseMaxHP - hpPenalty);
      if (system.resources.hp.value > system.resources.hp.max)
        system.resources.hp.value = system.resources.hp.max;
    }

    // --- AP CALCULATION ---
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

    if (!system.secondary.xp) system.secondary.xp = { value: 0 };

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

      // Для зомби база уже задана в _onCreate, не перезаписываем если есть
      if (this.type === "zombie" && skill.base > 0) {
        // Zombie logic skip calculation
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

    // --- LIMBS INIT (Только для НЕ-ЗОМБИ, у зомби свои значения) ---
    if (this.type !== "zombie") {
      const totalHP = system.resources.hp.max;
      const setLimb = (part, percent) => {
        if (!system.limbs[part]) system.limbs[part] = { value: 0, max: 0 };
        system.limbs[part].max = Math.floor(totalHP * percent);
        if (
          system.limbs[part].value === null ||
          system.limbs[part].value === undefined
        ) {
          system.limbs[part].value = system.limbs[part].max;
        }
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
        // Защита от undefined у контейнеров
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

      if (this.type !== "zombie") {
        maxAP = Math.max(0, maxAP - 4);
      }
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

    if (this.hasStatusEffect("panic")) {
      // ... panic logic ...
      await Dice.rollPanicTable(this);
    }
  }

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
        const newLimbHP = this.system.limbs[limb].value - dmg;
        updateData[`system.limbs.${limb}.value`] = newLimbHP;
        if (this.system.limbs[limb].value > 0 && newLimbHP <= 0)
          await this._applyInjury(limb);
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

      if (
        this.type !== "zombie" &&
        this.type !== "shelter" &&
        this.type !== "container" &&
        newHP > deathThreshold
      ) {
        await this.checkPanic(dmg);
      }
    }

    // GM Log
    const speaker = ChatMessage.getSpeaker({ actor: this });
    ChatMessage.create({
      user: game.user.id,
      speaker,
      content: `<div class="z-damage-result" style="border-left: 5px solid darkred;">
                    <b>(GM) Результат урона:</b><br>
                    Входящий: ${amount} (${type})<br>
                    Броня: -${totalAC} (Resist ${totalResist}%)<br>
                    <b>Итог: -${dmg} HP</b> (${_getLimbName(limb)})
                  </div>`,
      whisper: ChatMessage.getWhisperRecipients("GM"),
    });
  }

  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);
    if (userId !== game.user.id) return;

    // Проверка смерти для лута
    const isDead = this.effects.some((e) => e.statuses.has("dead"));
    if (isDead) {
      if (this.ownership.default < 2) {
        await this.update({ "ownership.default": 2 });
        ui.notifications.info(`${this.name} теперь можно осмотреть.`);
      }
    }
  }

  // --- ПОЛНОЕ ЛЕЧЕНИЕ (GM) ---
  async fullHeal() {
    // ... (код лечения без изменений)
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

  async checkPanic(damageAmount) {
    // ... (код паники без изменений)
  }

  async longRest() {
    // ... (код отдыха без изменений)
    if (this.type === "zombie") return;
    const vig = this.system.attributes.vig.value;
    const recovery = 10 + vig;
    const curPenalty = this.system.resources.hp.penalty || 0;
    const newPenalty = Math.max(0, curPenalty - recovery);
    const baseMax = 70 + (vig - 1) * 10;
    const newMax = baseMax - newPenalty;
    const healedHP = Math.min(
      newMax,
      this.system.resources.hp.value + recovery
    );

    await this.update({
      "system.resources.hp.penalty": newPenalty,
      "system.resources.hp.value": healedHP,
      "system.resources.ap.value": this.system.resources.ap.max,
    });
  }

  async reloadWeapon(item) {
    // ... (код перезарядки без изменений)
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

  // --- ИСПРАВЛЕННЫЙ RISE AS ZOMBIE ---
  async riseAsZombie() {
    if (this.type !== "survivor" && this.type !== "npc") return;

    const tokens = this.getActiveTokens();
    const pos =
      tokens.length > 0 ? { x: tokens[0].x, y: tokens[0].y } : { x: 0, y: 0 };

    const zombieData = {
      name: `Zombie (${this.name})`,
      type: "zombie",
      img: "icons/svg/skull.svg",
      // Статы и натуральное оружие заполнятся автоматически через _onCreate
    };

    // 1. Создаем зомби
    const newZombie = await Actor.create(zombieData);

    // 2. ПЕРЕНОС ЛУТА (Возвращено)
    // Мы берем все предметы выжившего и копируем их новому зомби
    const itemsToCopy = this.items.map((i) => i.toObject());
    if (itemsToCopy.length > 0) {
      await newZombie.createEmbeddedDocuments("Item", itemsToCopy);
    }

    // 3. Перенос статусов (Огонь, Кровь)
    const allowedStatuses = ["immolated", "bleeding"];
    const effectsToCopy = this.effects
      .filter((e) => e.statuses.some((s) => allowedStatuses.includes(s)))
      .map((e) => e.toObject());

    if (effectsToCopy.length > 0) {
      await newZombie.createEmbeddedDocuments("ActiveEffect", effectsToCopy);
    }

    // 4. Замена токена
    if (tokens.length > 0) {
      const scene = game.scenes.current;
      await scene.createEmbeddedDocuments("Token", [
        {
          name: newZombie.name,
          actorId: newZombie.id,
          img: this.img, // Наследуем иконку трупа
          x: pos.x,
          y: pos.y,
        },
      ]);

      await tokens[0].document.delete();
    }

    ui.notifications.notify(`${this.name} восстает из мертвых!`);
  }

  async standUp() {
      // 1. Проверяем, лежит ли он
      const proneEffect = this.effects.find(e => e.statuses.has("prone"));
      if (!proneEffect) return ui.notifications.info("Персонаж уже стоит.");

      // 2. Стоимость (например, 2 AP или половина)
      // Давай сделаем 3 AP для примера
      const cost = 3;
      const curAP = this.system.resources.ap.value;

      if (curAP < cost) {
          return ui.notifications.warn(`Недостаточно AP, чтобы встать. Нужно ${cost}.`);
      }

      // 3. Снимаем эффект и тратим AP
      await proneEffect.delete();
      await this.update({"system.resources.ap.value": curAP - cost});
      
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this}),
          content: `<b>${this.name}</b> встает на ноги (-${cost} AP).`
      });
  }

  

  async _applyInjury(limb) {
    // ... (без изменений)
    let effectData = null;
    if (limb === "head") effectData = INJURY_EFFECTS.head;
    else if (limb === "torso") effectData = INJURY_EFFECTS.torso;
    else if (limb.includes("Arm")) effectData = INJURY_EFFECTS.arm;
    else if (limb.includes("Leg")) effectData = INJURY_EFFECTS.leg;
    if (effectData) {
      const statusId = effectData.id || `injury-${limb}`;
      if (!this.hasStatusEffect(statusId)) {
        const eff = foundry.utils.deepClone(effectData);
        eff.name += ` (${_getLimbName(limb)})`;
        await this.createEmbeddedDocuments("ActiveEffect", [eff]);
      }
    }
  }

  async useMedicine(item) {
      const targets = Array.from(game.user.targets);
      if (targets.length === 0) return ui.notifications.warn("Выберите цель (Target)!");
      if (targets.length > 1) return ui.notifications.warn("Только одна цель за раз.");

      const targetToken = targets[0];
      const targetActor = targetToken.actor;

      const selfToken = this.getActiveTokens()[0]; 
      if (!selfToken) return ui.notifications.warn("Ваш токен должен быть на сцене.");
      const dist = canvas.grid.measureDistance(selfToken, targetToken);
      if (dist > 1.5) return ui.notifications.warn("Подойдите ближе к цели.");

      const res = targetActor.system.resources.hp;
      const currentHP = res.value;
      const currentPenalty = res.penalty || 0;
      
      // Проверка переполнения
      if (currentHP >= res.max) {
          return ui.notifications.warn("Пациент полностью здоров (с учетом текущих травм).");
      }

      // 1. РАСЧЕТЫ
      const medSkill = this.system.skills.medical.value || 0;
      const skillBonus = Math.floor(medSkill / 5); // 50 навыка = +10
      const baseHeal = Number(item.system.healAmount) || 0; // Например, 15
      
      // Итоговое лечение (База + Бонус)
      // Пример: 15 + 10 = 25
      const totalHeal = baseHeal + skillBonus;

      // Антибиотики (без изменений)
      if (item.system.isAntibiotic) {
          const inf = targetActor.system.resources.infection;
          if (inf.active || inf.stage > 0) {
               await targetActor.update({
                  "system.resources.infection.active": false,
                  "system.resources.infection.stage": Math.max(0, inf.stage - 1)
              });
              ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({actor: this}),
                  content: `<div class="z-chat-card"><div class="z-card-header">ЛЕЧЕНИЕ</div>${this.name} применяет ${item.name}.<br><span style="color:green">Инфекция снижена.</span></div>`
              });
              await this._consumeItem(item);
              return;
          } else {
              return ui.notifications.info("Цель не заражена.");
          }
      }

      // 2. БИНТЫ (ТРАВМА)
      // Новая формула: Штраф = БазаПредмета - БонусНавыка
      // Пример: 15 (Бинт) - 10 (Скилл) = 5 Штрафа.
      // Если Скилл 0: 15 - 0 = 15 Штрафа.
      // Если Скилл 100 (+20): 15 - 20 = -5 -> 0 Штрафа (Идеальное лечение).
      
      const penaltyIncrease = Math.max(0, baseHeal - skillBonus); 

      // Применяем
      const newHP = currentHP + totalHeal; 
      const newPenalty = currentPenalty + penaltyIncrease;

      await targetActor.update({
          "system.resources.hp.value": newHP,
          "system.resources.hp.penalty": newPenalty
      });

      // Сообщение
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: this}),
          content: `<div class="z-chat-card">
                      <div class="z-card-header">ПЕРЕВЯЗКА</div>
                      <div>${this.name} использует <b>${item.name}</b>.</div>
                      <div style="font-size:0.8em; border-bottom:1px dashed #555; margin-bottom:5px;">
                        Навык: ${medSkill} (Бонус ${skillBonus})
                      </div>
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:green; font-weight:bold; font-size:1.1em;">+${totalHeal} HP</span>
                        <span style="color:#b71c1c; font-weight:bold; font-size:0.9em;">-${penaltyIncrease} Max HP</span>
                      </div>
                      <div style="font-size:0.75em; color:#777; margin-top:5px; font-style:italic;">
                        ${penaltyIncrease === 0 ? "Идеальная перевязка! Штрафов нет." : "Рана зашита, но ткань повреждена."}
                      </div>
                    </div>`
      });

      await this._consumeItem(item);
  }

  async _consumeItem(item) {
      const qty = item.system.quantity;
      if (qty > 1) {
          await item.update({"system.quantity": qty - 1});
      } else {
          await item.delete();
      }
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
