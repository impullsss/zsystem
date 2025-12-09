import { NoiseManager } from "./noise.js";
import { _getSlotMachineHTML, _calcResult } from "./dice.js";

export class ZContainerSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "container"],
      template: "systems/zsystem/sheets/container-sheet.hbs",
      width: 500,
      height: 650,
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }],
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "loot",
        },
      ],
    });
  }

  async getData() {
    const context = super.getData();
    context.isGM = game.user.isGM;

    context.system = this.actor.system;
    context.attr = context.system.attributes;

    // --- ЛОГИКА ЭКРАНОВ ---
    // 1. Состояние "Сломано" (Если ловушка сработала неудачно)
    context.isBroken = this.actor.getFlag("zsystem", "isBroken") || false;

    // 2. Заперто?
    context.isLocked = context.attr?.isLocked?.value;

    // 3. Активная ловушка?
    context.hasActiveTrap =
      context.attr?.isTrapped?.value && context.attr?.trapActive?.value;

    // ЛОГИКА ОТОБРАЖЕНИЯ ИНВЕНТАРЯ:
    // Показываем, если:
    // (НЕ заперто И НЕ активна ловушка И НЕ сломано) ИЛИ (ГМ)
    context.showInventory =
      (!context.isLocked && !context.hasActiveTrap && !context.isBroken) ||
      context.isGM;

    // Экраны блокировки (приоритет отображения для игрока)
    // Если сломано - показываем экран поломки (если не ГМ)
    context.showBrokenScreen = context.isBroken && !context.isGM;

    // Если не сломано, но активна ловушка и не заперто - экран обезвреживания
    context.showTrapScreen =
      !context.isBroken &&
      context.hasActiveTrap &&
      !context.isLocked &&
      !context.isGM;

    const inventory = { misc: { label: "Предметы", items: [] } };
    this.actor.items.forEach((i) => inventory.misc.items.push(i));
    context.inventory = inventory;

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".try-key").click(this._onTryKey.bind(this));
    html.find(".try-pick").click(this._onTryPick.bind(this));
    html.find(".try-bash").click(this._onTryBash.bind(this));
    html.find(".try-disarm").click(this._onTryDisarm.bind(this));

    // GM: Сброс состояния "Сломано" (Починить)
    html.find(".gm-fix").click(async () => {
      await this.actor.setFlag("zsystem", "isBroken", false);
      ui.notifications.info("Контейнер восстановлен.");
    });

    // GM: Принудительное обезвреживание
    html.find(".gm-disarm").click(async () => {
      await this._sendUpdate(
        { "system.attributes.trapActive.value": false },
        "GM: Ловушка отключена."
      );
    });

    if (game.user.isGM) {
      html.find(".item-delete").click(async (ev) => {
        const li = $(ev.currentTarget).closest("[data-item-id]");
        const item = this.actor.items.get(li.data("itemId"));
        if (item) await item.delete();
      });
      html.find(".item-create").click(async (ev) => {
        ev.preventDefault();
        const types = {
          weapon: "Оружие",
          armor: "Броня",
          ammo: "Патроны",
          medicine: "Медицина",
          food: "Еда",
          materials: "Материалы",
          luxury: "Роскошь",
          misc: "Разное",
        };
        let options = "";
        for (let [k, v] of Object.entries(types))
          options += `<option value="${k}">${v}</option>`;
        new Dialog({
          title: "Создать Лут",
          content: `<form><div class="form-group"><label>Тип:</label><select id="type-select">${options}</select></div></form>`,
          buttons: {
            create: {
              label: "Создать",
              callback: async (html) => {
                const type = html.find("#type-select").val();
                await Item.create(
                  { name: "Новый предмет", type: type },
                  { parent: this.actor }
                );
              },
            },
          },
          default: "create",
        }).render(true);
      });
      html.find(".item-edit").click((ev) => {
        const li = $(ev.currentTarget).closest("[data-item-id]");
        const item = this.actor.items.get(li.data("itemId"));
        if (item) item.sheet.render(true);
      });
    }
  }

  _getActor() {
    const tokens = canvas.tokens.controlled;
    if (tokens.length) return tokens[0].actor;
    if (game.user.character) return game.user.character;
    return null;
  }

  async _sendUpdate(updates, successMsg) {
    if (game.user.isGM) {
      await this.actor.update(updates);
      if (successMsg) ui.notifications.info(successMsg);
    } else {
      await this.actor.update(updates);
      if (successMsg) {
        ChatMessage.create({
          content: `<div class="z-chat-card"><div class="z-card-header">Действие</div><div>${successMsg}</div></div>`,
          speaker: ChatMessage.getSpeaker({ actor: this._getActor() }),
        });
      }
    }
  }

  async _makeNoise(baseLabel = "") {
    const formula = this.actor.system.attributes.noiseFormula?.value || "2d6";
    const roll = new Roll(formula);
    await roll.evaluate();
    await NoiseManager.add(roll.total);
    return `<div style="color:orange; font-size:0.9em; margin-top:5px;">
                <i class="fas fa-volume-up"></i> Шум (${formula}): <b>+${roll.total}</b>
              </div>`;
  }

  // --- ВЗЛОМ ---
  async _onTryKey(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");
    const keyName = this.actor.system.attributes.keyName.value;
    const hasKey = actor.items.find((i) =>
      i.name.toLowerCase().includes(keyName.toLowerCase())
    );
    if (hasKey)
      await this._sendUpdate(
        { "system.attributes.isLocked.value": false },
        `Открыто ключом "${hasKey.name}".`
      );
    else ui.notifications.error(`Нужен предмет: "${keyName}"`);
  }

  async _onTryPick(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");
    if (this.actor.system.attributes.canPick?.value === false)
      return ui.notifications.warn("Замок слишком сложный.");
    const picks = actor.items.find((i) => i.name.match(/lockpick|отмычк/i));
    if (!picks || picks.system.quantity < 1)
      return ui.notifications.warn("Нет отмычек!");
    await NoiseManager.add(2);
    const dc = this.actor.system.attributes.lockDC.value || 15;
    const skill = actor.system.skills.mechanical.value || 0;
    const roll = new Roll("1d100");
    await roll.evaluate();
    const success = roll.total <= skill - dc;
    let msg = `<div class="z-chat-card"><div class="z-card-header">Взлом</div><div>Roll: ${roll.total} (Skill ${skill} - DC ${dc})</div>`;
    if (success) {
      await this._sendUpdate(
        { "system.attributes.isLocked.value": false },
        null
      );
      msg += `<div style="color:green; font-weight:bold;">ЗАМОК ВСКРЫТ!</div>`;
    } else {
      msg += `<div style="color:red; font-weight:bold;">НЕУДАЧА</div><div>Отмычка сломалась.</div>`;
      if (picks.system.quantity > 1)
        await picks.update({ "system.quantity": picks.system.quantity - 1 });
      else await picks.delete();
    }
    ChatMessage.create({
      content: msg + "</div>",
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  async _onTryBash(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");
    if (this.actor.system.attributes.canBash?.value === false)
      return ui.notifications.warn("Дверь укреплена.");
    const dc = this.actor.system.attributes.bashDC.value || 18;
    const str = actor.system.attributes.str.value;
    const crowbar = actor.items.find((i) => i.name.match(/crowbar|лом/i));
    const bonus = crowbar ? 4 : 0;
    const roll = new Roll("1d10 + @str + @bonus", { str, bonus });
    await roll.evaluate();
    const noiseMsg = await this._makeNoise();
    let msg = `<div class="z-chat-card"><div class="z-card-header">Выбивание</div><div>Roll: ${roll.total} vs DC ${dc}</div>`;
    if (roll.total >= dc) {
      await this._sendUpdate(
        { "system.attributes.isLocked.value": false },
        null
      );
      msg += `<div style="color:green;">Дверь выбита!</div>${noiseMsg}`;
    } else {
      msg += `<div style="color:red;">Не поддается.</div>${noiseMsg}`;
      if (roll.terms[0].results[0].result === 1 && !crowbar) {
        msg += `<br><b>Травма руки!</b> (-1 HP)`;
        actor.applyDamage(1, "true", "rArm");
      }
    }
    ChatMessage.create({
      content: msg + "</div>",
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  // --- ОБЕЗВРЕЖИВАНИЕ ---
  async _onTryDisarm(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");

    const dc = Number(this.actor.system.attributes.disarmDC.value) || 15;
    const skillKey =
      this.actor.system.attributes.disarmSkill?.value || "mechanical";
    const skillVal = actor.system.skills[skillKey]?.value || 0;

    // Шум
    const noiseVal = this.actor.system.attributes.disarmNoise?.value || "2";
    const noiseRoll = new Roll(noiseVal);
    await noiseRoll.evaluate();
    await NoiseManager.add(noiseRoll.total);

    const roll = new Roll("1d100");
    await roll.evaluate();

    const targetChance = skillVal - dc;
    const resultType = _calcResult(roll.total, targetChance);
    const isSuccess = resultType.includes("success");

    const label = `Обезвреживание (${skillKey})`;
    const slotHtml = _getSlotMachineHTML(
      label,
      targetChance,
      roll.total,
      resultType
    );

    let resultMsg = "";

    if (isSuccess) {
      await this._sendUpdate(
        { "system.attributes.trapActive.value": false },
        null
      );
      resultMsg = `<div style="color:green; font-weight:bold; text-align:center; margin-top:5px;">УСПЕХ! Ловушка отключена.</div>`;
    } else {
      // Провал -> Активация ловушки + Блокировка контейнера
      resultMsg = `<div style="color:red; font-weight:bold; text-align:center; margin-top:5px;">ПРОВАЛ! ЩЕЛЧОК!</div>`;
      await this._applyTrapDamage(actor);
    }

    const noiseMsg =
      noiseRoll.total > 0
        ? `<div style="color:gray; font-size:0.8em; text-align:center;">Шум: +${noiseRoll.total}</div>`
        : "";

    ChatMessage.create({
      content: `${slotHtml}${resultMsg}${noiseMsg}`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  async _applyTrapDamage(victim) {
    // 1. Деактивируем ловушку (она сработала)
    await this.actor.update({ "system.attributes.trapActive.value": false });

    // 2. СТАВИМ ФЛАГ "СЛОМАНО" (Чтобы скрыть лут)
    await this.actor.setFlag("zsystem", "isBroken", true);

    // 3. Расчет урона
    const attr = this.actor.system.attributes;
    const dmgFormula = attr.trapDmg?.value || "0";
    const r = new Roll(dmgFormula);
    await r.evaluate();

    NoiseManager.add(20);

    if (r.total > 0) {
      const limbs = attr.trapLimbs || { torso: true };
      const activeLimbs = Object.keys(limbs).filter((k) => limbs[k]);
      if (activeLimbs.length === 0) activeLimbs.push("torso");

      for (let limb of activeLimbs) {
        await victim.applyDamage(r.total, "fire", limb);
      }
      ui.notifications.error(
        `Ловушка сработала! Урон: ${r.total} (x${activeLimbs.length})`
      );
    } else {
      ui.notifications.warn("Ловушка сработала (Сигнализация)!");
    }
  }
}
