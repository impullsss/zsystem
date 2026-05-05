import * as Dice from "./dice.js";
import {
  INJURY_EFFECTS,
  GLOBAL_STATUSES,
  INFECTION_STAGES,
} from "./constants.js";
import { applyDamage, applyBleeding, checkPanic, applyPanicStage } from "./actor-damage.js";
import { useMedicine, applyMedicineLogic, reportHealing } from "./actor-medicine.js";
import { buildAmmoSummary, findCompatibleAmmoItems, serializeAmmoForWeapon } from "./ammo-effects.js";

export class ZActor extends Actor {
  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);
    if (userId !== game.user.id) return;

    // --- ДОБАВЛЕНО: Транспорт ---
    if (this.type === "vehicle") {
      await this.update({
        name: "Новый транспорт",
        img: "icons/svg/target.svg",
        "prototypeToken.actorLink": true,
      });
    }

    // Зомби: авто-статы и оружие
     if (this.type === "zombie" && game.settings.get("zsystem", "randomizeZombieStats")) {
      const updates = {};
      const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

      // 1. Генерируем Характеристики
      // Нам нужны переменные здесь, чтобы сразу посчитать ХП
      const str = rnd(6, 9);
      const agi = rnd(1, 3);
      const vig = rnd(3, 6);
      const per = rnd(3, 6);

      updates["system.attributes"] = {
          str: { base: str, value: str },
          agi: { base: agi, value: agi },
          vig: { base: vig, value: vig },
          per: { base: per, value: per },
          int: { base: 1, value: 1 },
          cha: { base: 1, value: 1 }
      };

      // 2. Считаем ХП по формуле (50 + (Vig-1)*10)
      // Это гарантирует, что Текущее = Максимум
      const maxHP = 50 + (vig - 1) * 10;
      
      updates["system.resources.hp"] = { value: maxHP, max: maxHP };
      updates["system.resources.ap"] = { value: 9, max: 9 };

      // 3. Конечности (Пропорционально Макс ХП)
      updates["system.limbs"] = {
          head: { value: Math.floor(maxHP*0.2), max: Math.floor(maxHP*0.2) },
          torso: { value: Math.floor(maxHP*0.45), max: Math.floor(maxHP*0.45) },
          lArm: { value: Math.floor(maxHP*0.15), max: Math.floor(maxHP*0.15) },
          rArm: { value: Math.floor(maxHP*0.15), max: Math.floor(maxHP*0.15) },
          lLeg: { value: Math.floor(maxHP*0.2), max: Math.floor(maxHP*0.2) },
          rLeg: { value: Math.floor(maxHP*0.2), max: Math.floor(maxHP*0.2) },
      };

      // 4. Навыки (Вкладываем очки)
      // Ближний бой и Атлетика
      updates["system.skills.melee.points"] = rnd(10, 30);
      updates["system.skills.athletics.points"] = rnd(10, 30);

      // Применяем все обновления разом
      await this.update(updates);

      // Добавляем оружие, если его нет
      const hasWeapons = this.items.some((i) => i.type === "weapon");
      if (!hasWeapons) {
        await this.createEmbeddedDocuments("Item", this._getZombieNaturalWeapons());
      }
    }

    // Лут: отключение зрения и привязки
    if (["container", "harvest_spot"].includes(this.type)) {
      await this.update({
        "prototypeToken.sight.enabled": false,
        "prototypeToken.actorLink": false, // ВАЖНО: false = Unlinked (уникальные копии)
        "prototypeToken.disposition": 0, // Neutral
        "prototypeToken.displayBars": 0,
        // УБРАНО: "ownership.default": 0 - это ломало права на токены!
      });
    }
  }

  /** @override */
  async _preUpdateEmbeddedDocuments(embeddedName, result, options, userId) {
    await super._preUpdateEmbeddedDocuments(embeddedName, result, options, userId);

    if (embeddedName !== "Item" || game.user.id !== userId) return;

    for (let update of result) {
        // Проверяем попытку экипировки
        const isEquipping = foundry.utils.getProperty(update, "system.equipped") === true;
        if (!isEquipping) continue;

        const item = this.items.get(update._id);
        if (!item || item.type !== "weapon") continue;

        // Считаем занятые слоты
        const newNeeded = (item.system.hands === "2h") ? 2 : 1;
        const currentEquipped = this.items.filter(i => 
            i.type === "weapon" && 
            i.system.equipped && 
            i.id !== item.id
        );

        let usedSlots = 0;
        currentEquipped.forEach(w => usedSlots += (w.system.hands === "2h" ? 2 : 1));

        if (usedSlots + newNeeded > 2) {
            ui.notifications.warn(`У персонажа всего две руки! Не удается надеть ${item.name}.`);
            
            // В V13 для отмены обновления внутри _preUpdate нужно удалить запись из массива result
            // Либо (проще) изменить статус обратно на false прямо в объекте обновления
            update["system.equipped"] = false; 
        }
    }
}

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Если меняется кол-во потраченного опыта
    if (foundry.utils.hasProperty(changed, "system.secondary.xp.spent")) {
      const oldSpent = this.system.secondary.xp.spent || 0;
      const newSpent = foundry.utils.getProperty(
        changed,
        "system.secondary.xp.spent"
      );

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

    const isOverburdened = this.system.secondary?.isOverburdened;
    const hasEffect = this.hasStatusEffect("overburdened");

    if (isOverburdened && !hasEffect) {
      const effectData = GLOBAL_STATUSES.overburdened;
      await this.createEmbeddedDocuments("ActiveEffect", [effectData]);
      ui.notifications.warn(`${this.name}: Перегруз! (-2 AP)`);
    } else if (!isOverburdened && hasEffect) {
      const effect = this.effects.find((e) => e.statuses.has("overburdened"));
      if (effect) await effect.delete();
    }

    // НОВОЕ: Проверка ручного ввода отрицательного ХП конечностей
    if (data.system && data.system.limbs) {
        for (const [limbKey, limbData] of Object.entries(data.system.limbs)) {
            // Если игрок/ГМ руками вписал значение <= 0
            if (limbData.value !== undefined && limbData.value <= 0) {
                // Метод _applyInjury сам проверит, нет ли уже такого эффекта, так что спама не будет
                this._applyInjury(limbKey);
            }
        }
    }
  }

  async convertToLoot() {
    if (!game.user.isGM) return;

    // 1. Получаем активные токены и сцену
    const tokens = this.getActiveTokens();
    if (tokens.length === 0) return ui.notifications.warn("Токен персонажа не найден.");
    
    const mainTokenDoc = tokens[0].document;
    const scene = mainTokenDoc.parent; // Сцена, на которой лежит токен
    const pos = { x: mainTokenDoc.x, y: mainTokenDoc.y, elevation: mainTokenDoc.elevation };

    // 2. Фильтруем предметы (убираем спец. оружие зомби)
    const forbidden = ["Гнилые Зубы", "Когти", "Bite", "Claws"];
    const lootableItems = this.items
        .filter(i => !forbidden.includes(i.name))
        .map(i => i.toObject());

    // 3. Создаем Актор-Контейнер в базе данных
    const lootData = {
        name: `Труп: ${this.name}`,
        type: "container",
        img: "icons/svg/skull.svg",
        system: {
            attributes: {
                isLocked: { value: false },
                isTrapped: { value: false }
            }
        },
        items: lootableItems
    };

    // Сначала создаем актора-контейнера
    const newLootActor = await Actor.create(lootData);

    // 4. Создаем токен контейнера на месте смерти
    await scene.createEmbeddedDocuments("Token", [{
        actorId: newLootActor.id,
        x: pos.x,
        y: pos.y,
        elevation: pos.elevation,
        texture: { src: "icons/svg/skull.svg" },
        alpha: 0.8,
        disposition: 0 
    }]);

    // 5. БЕЗОПАСНОЕ УДАЛЕНИЕ (Фикс ошибки EmbeddedCollection)
    // Закрываем открытые листы этого актора, чтобы не ловить ошибки рендера
    Object.values(this.apps).forEach(app => app.close());

    // Если это Unlinked токен (NPC/Zombie), достаточно удалить сам токен.
    // Актор-дельта удалится вместе с ним автоматически.
    const tokenIds = tokens.map(t => t.id);
    await scene.deleteEmbeddedDocuments("Token", tokenIds);

    // Если это был "настоящий" актор из боковой панели (Linked), 
    // и он не является важным персонажем (например, рядовой NPC), удаляем его из базы.
    if (!this.isToken && !this.prototypeToken.actorLink) {
        await this.delete();
    }

    ui.notifications.info(`Тело ${this.name} заменено контейнером.`);
}

  // Ежедневное обновление (Убежище)
  async applyDailyUpdate({
    hasFood = true,
    isSheltered = true,
    antibioticGiven = false,
  } = {}) {
    if (
      this.type === "zombie" ||
      this.type === "container" ||
      this.type === "harvest_spot"
    )
      return null;

    const report = {
      name: this.name,
      healed: 0,
      infectionChange: null,
      died: false,
      msg: [],
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
          "system.resources.infection.active": true,
        });
        await this._updateInfectionStatus(newStage);

        if (currentStage === newStage) {
          report.msg.push(
            `<span style="color:#1e88e5; font-weight:bold;">💊 Вирус сдержан (Ст. ${newStage})</span>`
          );
        } else {
          report.msg.push(
            `<span style="color:#1e88e5; font-weight:bold;">💊 Состояние улучшилось (Ст. ${newStage})</span>`
          );
        }
      } else {
        const vig = this.system.attributes.vig.value;
        const dc = 10 + inf.stage * 2;
        const roll = new Roll("1d10 + @vig", { vig });
        await roll.evaluate();

        if (roll.total >= dc) {
          report.msg.push(
            `<span style="color:green">Иммунитет сдержал вирус (Roll ${roll.total} vs ${dc})</span>`
          );
        } else {
          const newStage = inf.stage + 1;
          report.infectionChange = newStage;

          if (newStage >= 4) {
            report.died = true;
            report.msg.push(
              `<span style="color:red; font-weight:bold;">УМЕР ОТ ИНФЕКЦИИ!</span>`
            );
            await this.update({
              "system.resources.infection.stage": 4,
              "system.resources.hp.value": -100,
            });
            await this.riseAsZombie();
          } else {
            await this.update({ "system.resources.infection.stage": newStage });
            await this._updateInfectionStatus(newStage);
            report.msg.push(
              `<span style="color:orange">Инфекция прогрессирует! Стадия ${newStage} (Roll ${roll.total} vs ${dc})</span>`
            );
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
        await this.update({
          "system.resources.hp.penalty": Math.max(0, curPenalty - 2),
        });
      }

      const limbUpdates = {};
      let hasLimbHeal = false;
      for (const [key, limb] of Object.entries(this.system.limbs)) {
        if (limb.value < limb.max) {
          limbUpdates[`system.limbs.${key}.value`] = Math.min(
            limb.max,
            limb.value + Math.ceil(healAmount / 2)
          );
          hasLimbHeal = true;
        }
      }
      if (hasLimbHeal) await this.update(limbUpdates);
    } else {
      report.msg.push(`<span style="color:red">ГОЛОДАЕТ (-5 Морали)</span>`);
      if (!this.hasStatusEffect("fatigued")) {
        await this.createEmbeddedDocuments("ActiveEffect", [
          GLOBAL_STATUSES.fatigued,
        ]);
      }
    }
    return report;
  }

  async _updateInfectionStatus(stage) {
    const existing = this.effects.filter((e) => e.flags?.zsystem?.isInfection);
    if (existing.length)
      await this.deleteEmbeddedDocuments(
        "ActiveEffect",
        existing.map((e) => e.id)
      );
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
            default: {
              name: "Укус",
              ap: 5,
              dmg: "4d6 + 11",
              mod: 0,
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
      if (!attr.trapLimbs)
        attr.trapLimbs = {
          head: false,
          torso: true, // По дефолту торс
          lArm: false,
          rArm: false,
          lLeg: false,
          rLeg: false,
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
      if (!system.attributes.handling)
        system.attributes.handling = { value: 0 };
      if (!system.attributes.mpg) system.attributes.mpg = { value: 5 };

      if (!system.resources) system.resources = {};
      if (!system.resources.fuel) system.resources.fuel = { value: 0, max: 60 };
      if (!system.resources.hp) system.resources.hp = { value: 100, max: 100 };
      if (system.broken === undefined) system.broken = false;

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
      if (!system.attributes[key])
        system.attributes[key] = { base: 1, value: 1, mod: 0 };
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
    // Защита: если данных нет или это не боевой тип, выходим. 
    if (!system ||["shelter", "container", "vehicle"].includes(this.type)) return;

    // ГАРАНТИРУЕМ наличие всех объектов
    system.attributes = system.attributes || {};
    system.skills = system.skills || {};
    system.secondary = system.secondary || {};
    system.resources = system.resources || {};
    system.limbs = system.limbs || {};

    const getNum = (val) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };

    // --- 1. АТРИБУТЫ (ОСНОВНЫЕ) ---
    const attrKeys =["str", "agi", "vig", "per", "int", "cha"];
    let spentStats = 0;
    attrKeys.forEach((key) => {
      if (!system.attributes[key]) system.attributes[key] = { base: 1, value: 1, mod: 0 };
      const attr = system.attributes[key];
      attr.base = Math.max(1, Math.min(10, getNum(attr.base)));
      // Итоговое значение атрибута = База + Модификатор
      attr.value = Math.max(1, attr.base + getNum(attr.mod));
      spentStats += (attr.base - 1);
    });
    system.secondary.spentStats = { value: spentStats };

    const s = system.attributes;

    // ====================================================================
    // --- 1.5. ДИНАМИЧЕСКИЕ ШТРАФЫ (ТРАВМЫ, СЛЕПОТА И УТОМЛЕНИЕ) ---
    // (Делаем это ДО расчета уклонения и навыков, чтобы они унаследовали штраф)
    // ====================================================================
    
    // Читаем стаки утомления
    let fatigueStacks = this.getFlag("zsystem", "fatigueStacks") || 0;
    if (this.hasStatusEffect("fatigued")) {
        fatigueStacks = Math.max(1, fatigueStacks); // Гарантируем минимум 1, если висит иконка
    } else {
        fatigueStacks = 0; // Сбрасываем, если статус сняли
    }
    // Сохраняем в system для удобного доступа UI
    system.secondary.fatigueStacks = fatigueStacks;

    // Травмы Торса (Режут Ловкость и Живучесть на 1/3)
    if (this.effects.some(e => e.statuses.has("injury-torso"))) {
        s.agi.value = Math.max(1, Math.floor(s.agi.value * (2/3)));
        s.vig.value = Math.max(1, Math.floor(s.vig.value * (2/3)));
    }

    // Травмы Головы (Режут Интеллект и Восприятие наполовину)
    if (this.effects.some(e => e.statuses.has("injury-head"))) {
        s.int.value = Math.max(1, Math.floor(s.int.value * 0.5));
        s.per.value = Math.max(1, Math.floor(s.per.value * 0.5));
    }

    // Слепота (Режет Восприятие наполовину) - может стакаться с травмой головы
    if (this.hasStatusEffect("blind")) {
        s.per.value = Math.max(1, Math.floor(s.per.value * 0.5));
    }


    // --- 2. ИНИЦИАЛИЗАЦИЯ ВТОРИЧНЫХ ХАРАКТЕРИСТИК ---
    const secondaryKeys = ["evasion", "bravery", "tenacity", "naturalAC", "meleeDamage"];
    secondaryKeys.forEach(key => {
        if (!system.secondary[key]) system.secondary[key] = { value: 0, mod: 0 };
        if (system.secondary[key].mod === undefined) system.secondary[key].mod = 0;
    });

    if (!system.secondary.carryWeight) system.secondary.carryWeight = { value: 0, max: 0, mod: 0 };

    // --- 3. РАСЧЕТЫ БАЗОВЫХ ЗНАЧЕНИЙ (МАТЕМАТИКА) ---
    const baseEvasion = (s.agi.value * 2);
    const baseBravery = (s.per.value + s.cha.value);
    const baseTenacity = (s.vig.value + s.str.value);
    const baseNaturalAC = Math.floor(s.vig.value / 2);
    const baseCarryMax = (s.str.value * 5) + 20;

    system.secondary.evasion.value = baseEvasion + getNum(system.secondary.evasion.mod);
    
    // --- ПРИМЕНЕНИЕ ШТРАФОВ НА УКЛОНЕНИЕ ---
    if (this.hasStatusEffect("prone") || this.hasStatusEffect("overburdened")) {
        system.secondary.evasion.value = Math.floor(system.secondary.evasion.value / 2);
    }
    if (this.effects.some(e => e.statuses.has("injury-leg"))) {
        system.secondary.evasion.value -= 10;
    }
    // Паника даёт бонус к уклонению (инстинкт выживания)
    if (this.hasStatusEffect("panic-anxious"))  system.secondary.evasion.value += 5;
    if (this.hasStatusEffect("panic-panicked")) system.secondary.evasion.value += 10;
    
    // ЗОМБИ: Фиксированное отрицательное уклонение
    if (this.type === "zombie") {
        system.secondary.evasion.value = -20;
    }

    system.secondary.bravery.value = baseBravery + getNum(system.secondary.bravery.mod);
    system.secondary.tenacity.value = baseTenacity + getNum(system.secondary.tenacity.mod);
    system.secondary.naturalAC.value = baseNaturalAC + getNum(system.secondary.naturalAC.mod);
    system.secondary.carryWeight.max = baseCarryMax + getNum(system.secondary.carryWeight.mod);

    // Расчет текущего веса предметов
    let totalWeight = 0;
    this.items.forEach(item => {
        totalWeight += (getNum(item.system.weight) * getNum(item.system.quantity || 1));
    });
    system.secondary.carryWeight.value = Math.round(totalWeight * 10) / 10;
    
    system.secondary.isOverburdened = system.secondary.carryWeight.value > system.secondary.carryWeight.max;

    // --- 4. НАВЫКИ ---
    let spentSkills = 0;
    const skillConfig = {
      melee: ["str", "agi"], ranged: ["agi", "per"], science: "int4",
      mechanical: ["int", "max_str_agi"], medical: ["int", "per"],
      diplomacy: ["cha", "per"], leadership: ["cha", "int"],
      survival:["per", "max_vig_int"], athletics: ["str", "agi"], stealth: ["agi", "per"],
    };

    for (const key of Object.keys(skillConfig)) {
      if (!system.skills[key]) system.skills[key] = { points: 0, mod: 0, value: 0, base: 0 };
      const skill = system.skills[key];
      const cfg = skillConfig[key];

      try {
          if (cfg === "int4") skill.base = (s.int?.value || 1) * 4;
          else if (cfg[1] === "max_str_agi") skill.base = (s.int?.value || 1) + Math.max(s.str?.value || 1, s.agi?.value || 1);
          else if (cfg[1] === "max_vig_int") skill.base = (s.per?.value || 1) + Math.max(s.vig?.value || 1, s.int?.value || 1);
          else skill.base = (s[cfg[0]]?.value || 1) + (s[cfg[1]]?.value || 1);
      } catch (e) { skill.base = 2; }

      const invested = getNum(skill.points);
      const modifier = getNum(skill.mod);
      spentSkills += invested;
      
      // Утомление режет 5% со всех навыков за стак
      let fatiguePenalty = fatigueStacks * 5;
      
      // Травма головы режет 15 с умных навыков
      let headPenalty = 0;
      if (this.effects.some(e => e.statuses.has("injury-head")) &&["science", "mechanical", "medical"].includes(key)) {
          headPenalty = 15;
      }

      skill.value = Math.max(0, Math.min(100, skill.base + invested + modifier - fatiguePenalty - headPenalty));
    }
    system.secondary.spentSkills = { value: spentSkills };

    // --- 5. HP / AP ---
    if (!system.resources.hp) system.resources.hp = { value: 10, max: 10, penalty: 0 };
    if (!system.resources.ap) system.resources.ap = { value: 7, max: 7, bonus: 0, effect: 0 };

    // Макс ХП: База - Штрафы (Травмы) - Утомление
    const baseMaxHP = 70 + (s.vig.value - 1) * 10;
    const fatigueHPPenalty = fatigueStacks * 10;
    system.resources.hp.baseMax = baseMaxHP;
    system.resources.hp.max = Math.max(1, baseMaxHP - getNum(system.resources.hp.penalty) - fatigueHPPenalty);

    // Макс AP: База + Бонусы - Утомление
    const baseAP = 7 + Math.ceil((s.agi.value - 1) / 2);
    const encumbrancePenalty = system.secondary.isOverburdened ? 2 : 0;
    const fatigueAPPenalty = fatigueStacks * 1;
    
    system.resources.ap.max = Math.max(0, baseAP + getNum(system.resources.ap.bonus) + getNum(system.resources.ap.effect) - encumbrancePenalty - fatigueAPPenalty);

    // --- 6. КОНЕЧНОСТИ ---
    const totalHP = system.resources.hp.max;
    const setLimb = (part, percent) => {
        if (!system.limbs[part]) system.limbs[part] = { value: 0, max: 0, penalty: 0 };
        const limb = system.limbs[part];
        limb.max = Math.max(1, Math.floor(totalHP * percent) - getNum(limb.penalty));
        if (limb.value === 0 || limb.value === null) limb.value = limb.max;
        if (limb.value > limb.max) limb.value = limb.max;
    };

    setLimb("head", 0.2);
    setLimb("torso", 0.45);
    setLimb("lArm", 0.15);
    setLimb("rArm", 0.15);
    setLimb("lLeg", 0.2);
    setLimb("rLeg", 0.2);
  }

  hasStatusEffect(statusId) {
    return this.effects.some(
      (e) => e.statuses.has(statusId) || e.flags?.core?.statusId === statusId
    );
  }

  async onTurnStart() {
    let maxAP = this.system.resources.ap.max;
    await this.setFlag("zsystem", "turnSteps", 0);
    if (this.hasStatusEffect("immolated")) {
      const fireLimbs = ["head", "torso", "lArm", "rArm", "lLeg", "rLeg"];
      let totalFireDmg = 0;
      for (const limbKey of fireLimbs) {
        const fireRoll = new Roll("1d6");
        await fireRoll.evaluate();
        totalFireDmg += fireRoll.total;
        await this.applyDamage(fireRoll.total, "fire", limbKey, false, true);
      }
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div style="color:orange; font-weight:bold;">🔥 ГОРИТ ЗАЖИВО! 🔥</div><div>Урон по всем конечностям: ${totalFireDmg} (игнорирует AC, учитывает сопротивление огню)</div>`,
      });
      if (this.type !== "zombie") maxAP = Math.max(0, maxAP - 4);
    }
    await this.update({ "system.resources.ap.value": maxAP });

    // Травма головы — бросок 1d10 vs ЖИВ, при провале AP вдвое
    if (this.effects.some(e => e.statuses.has("injury-head"))) {
      const vig = this.system.attributes?.vig?.value || 1;
      const headRoll = new Roll("1d10");
      await headRoll.evaluate();
      if (headRoll.total > vig) {
        const halved = Math.floor(maxAP / 2);
        await this.update({ "system.resources.ap.value": halved });
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<div style="color:#e74c3c;">ТРАВМА ГОЛОВЫ: бросок ${headRoll.total} vs ЖИВ ${vig} — голова кружится, AP срезан до ${halved}!</div>`,
        });
      } else {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<div style="color:#69f0ae;">ТРАВМА ГОЛОВЫ: бросок ${headRoll.total} vs ЖИВ ${vig} — держится!</div>`,
        });
      }
    }

    if (this.hasStatusEffect("bleeding")) {
      const roll = new Roll("4d4");
      await roll.evaluate();
      await this.applyDamage(roll.total, "true", "torso");
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div style="color:#e74c3c;">КРОВОТЕЧЕНИЕ: -${roll.total} HP (игнорирует броню)</div>`,
      });
    }
    if (this.hasStatusEffect("poisoned")) {
      const roll = new Roll("1d6");
      await roll.evaluate();
      await this.applyDamage(roll.total, "true", "torso");
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div style="color:#e74c3c;">ОТРАВЛЕНИЕ: -${roll.total} HP</div>`,
      });
    }
    // Паника обрабатывается через стадии (panic-anxious/panicked/breaking) — отдельного броска не требует
  }

  // --- APPLY DAMAGE ---
  async applyDamage(...args)     { return applyDamage(this, ...args); }
  async _applyBleeding(...args)  { return applyBleeding(this, ...args); }
  async checkPanic(...args)      { return checkPanic(this, ...args); }
  async _applyPanicStage(...args){ return applyPanicStage(this, ...args); }

// --- ЛЕЧЕНИЕ ---
  async useMedicine(item)                              { return useMedicine(this, item); }
  async applyMedicineLogic(healer, itemData, limbKey)  { return applyMedicineLogic(this, healer, itemData, limbKey); }
  _reportHealing(healer, messages, limb, itemName)     { return reportHealing(this, healer, messages, limb, itemName); }

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
      // Ищем, есть ли уже ТОЧНО ТАКАЯ ЖЕ травма на этой же конечности
      let finalId = effectData.id;
      if (limb.includes("Arm") || limb.includes("Leg")) {
        finalId = `${effectData.id}-${limb}`;
      }
      const realExists = this.effects.some((e) => e.id === finalId || (e.statuses && e.statuses.has(finalId)));

      if (!realExists) {
        const eff = foundry.utils.deepClone(effectData);
        eff.id = finalId;
        eff.name += ` (${limb})`;
        
        // ВАЖНОЕ ИСПРАВЛЕНИЕ: Присваиваем И базовый класс (injury-leg) И специфичный (injury-leg-lLeg)
        // Чтобы prepareDerivedData смог найти его по базовому имени!
        eff.statuses = [effectData.id, finalId];
        
        const created = await this.createEmbeddedDocuments("ActiveEffect", [eff]);
        return created.map((c) => c.id);
      }
    }
    return[];
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
    const label =
      {
        str: "СИЛА",
        agi: "ЛОВКОСТЬ",
        vig: "ЖИВУЧЕСТЬ",
        per: "ВОСПРИЯТИЕ",
        int: "ИНТЕЛЛЕКТ",
        cha: "ХАРИЗМА",
      }[attrKey] || attrKey;

    Dice.showRollDialog(label, async (modifier, rollMode) => {
      const formula = `1d10 + @attr + @mod`;
      const rollData = { attr: attr.value, mod: modifier };
      const roll = new Roll(formula, rollData);
      await roll.evaluate();

      await roll.toMessage(
        {
          speaker: ChatMessage.getSpeaker({ actor: this }),
          flavor: `Проверка характеристики: <b>${label}</b>${
            modifier !== 0 ? ` (Mod: ${modifier})` : ""
          }`,
          flags: { zsystem: { type: "attribute", key: attrKey } },
        },
        { rollMode: rollMode }
      );
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
    if (!ammoType)
      return ui.notifications.warn("Этому оружию не нужны патроны.");

    const maxMag = Number(item.system.mag.max) || 0;
    const currentMag = Number(item.system.mag.value) || 0;
    if (currentMag >= maxMag) return ui.notifications.info("Магазин полон.");

    const apCost = Number(item.system.reloadAP) || 0;
    if (this.system.resources.ap.value < apCost)
      return ui.notifications.warn(`Нужно ${apCost} AP для перезарядки.`);

    const compatibleAmmo = findCompatibleAmmoItems(this.items, ammoType);
    const ammoItem = await this._chooseReloadAmmo(compatibleAmmo, ammoType);
    if (!ammoItem)
      return ui.notifications.warn(`Нет патронов калибра "${ammoType}".`);

    const needed = maxMag - currentMag;
    const available = ammoItem.system.quantity;
    const toLoad = Math.min(needed, available);

    await this.update({
      "system.resources.ap.value": this.system.resources.ap.value - apCost,
    });
    await item.update({
      "system.mag.value": currentMag + toLoad,
      "flags.zsystem.loadedAmmoData": serializeAmmoForWeapon(ammoItem),
    });

    if (available - toLoad <= 0) await ammoItem.delete();
    else await ammoItem.update({ "system.quantity": available - toLoad });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div>${this.name} перезаряжает ${item.name} (${toLoad} пт.).</div>`,
    });
  }

  async _chooseReloadAmmo(ammoItems, ammoType) {
    if (!ammoItems?.length) return null;
    if (ammoItems.length === 1) return ammoItems[0];

    return new Promise((resolve) => {
      let settled = false;
      const content = `
        <form class="z-reload-ammo-dialog">
          <p>Выбери патроны калибра <b>${ammoType}</b>:</p>
          ${ammoItems.map((ammo, index) => `
            <label style="display:block; margin:4px 0; padding:4px; border:1px solid rgba(0,0,0,0.15);">
              <input type="radio" name="ammoId" value="${ammo.id}" ${index === 0 ? "checked" : ""}/>
              <b>${ammo.name}</b>
              <span style="opacity:0.75;">x${Number(ammo.system.quantity) || 0}</span>
              <br/>
              <small>${buildAmmoSummary(ammo)}</small>
            </label>
          `).join("")}
        </form>
      `;

      new Dialog({
        title: "Перезарядка: выбор патронов",
        content,
        buttons: {
          load: {
            label: "Зарядить",
            icon: '<i class="fas fa-check"></i>',
            callback: (html) => {
              settled = true;
              const selectedId = html.find('[name="ammoId"]:checked').val();
              resolve(ammoItems.find((ammo) => ammo.id === selectedId) || ammoItems[0]);
            }
          },
          cancel: {
            label: "Отмена",
            callback: () => {
              settled = true;
              resolve(null);
            }
          }
        },
        default: "load",
        close: () => {
          if (!settled) resolve(null);
        }
      }).render(true);
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
  // --- УПРАВЛЕНИЕ УТОМЛЕНИЕМ ---
  async addFatigue(amount = 1) {
    if (this.type === "zombie" || this.type === "container") return;

    let currentStacks = this.getFlag("zsystem", "fatigueStacks") || 0;
    let newStacks = Math.min(5, currentStacks + amount);

    if (newStacks >= 5 && currentStacks < 5) {
        ui.notifications.error(`${this.name} теряет сознание от жестокого истощения!`);
        await this.applyDamage(999, "true", "torso"); // Техническая смерть/кома
        return;
    }

    await this.setFlag("zsystem", "fatigueStacks", newStacks);

    // Вешаем иконку, если её нет
    if (!this.hasStatusEffect("fatigued")) {
        await this.createEmbeddedDocuments("ActiveEffect", [GLOBAL_STATUSES.fatigued]);
    }
    
    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div style="color:orange;"><i class="fas fa-battery-empty"></i> Утомление: уровень ${newStacks}/5</div>`
    });
  }

  async fullHeal() {
    const effectsToDelete = this.effects
      .filter((e) => {
        const isInjury = Object.values(INJURY_EFFECTS).some((ie) =>
          e.statuses.has(ie.id)
        );
        const isGlobal = Object.values(GLOBAL_STATUSES).some((gs) =>
          e.statuses.has(gs.id)
        );
        const isPanic = ["panic-anxious", "panic-panicked", "panic-breaking"].some(s => e.statuses.has(s));
        return isInjury || isGlobal || isPanic || e.statuses.has("dead");
      })
      .map((e) => e.id);
    if (effectsToDelete.length > 0)
      await this.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);

    const resetUpdates = {
      "system.resources.hp.penalty": 0,
    };
    if (this.system.limbs) {
      for (const key of Object.keys(this.system.limbs)) {
        resetUpdates[`system.limbs.${key}.penalty`] = 0;
      }
    }
    await this.update(resetUpdates);

    const healUpdates = {
      "system.resources.hp.value": this.system.resources.hp.max,
      "system.resources.ap.value": this.system.resources.ap.max,
    };
    if (this.system.limbs) {
      for (const key of Object.keys(this.system.limbs)) {
        healUpdates[`system.limbs.${key}.value`] = this.system.limbs[key].max;
      }
    }
    await this.update(healUpdates);
  }
}
