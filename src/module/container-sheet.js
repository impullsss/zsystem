import * as Dice from "./dice.js";
import { NoiseManager } from "./noise.js"; // <--- ВАЖНО: Добавлен импорт

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
    context.system = this.actor.system;
    context.attr = this.actor.system.attributes || {};
    context.isGM = game.user.isGM;

    if (!context.isGM && game.user.character) {
      context.trapDetected = this.actor.getFlag(
        "zsystem",
        `trapKnownBy_${game.user.character.id}`
      );
    } else {
      context.trapDetected = true;
    }

    context.showInventory = !context.attr.isLocked?.value || context.isGM;
    this._prepareItems(context);
    return context;
  }

  _prepareItems(context) {
    const inventory = { misc: { label: "Предметы", items: [] } };
    for (let i of this.actor.items) {
      inventory.misc.items.push(i);
    }
    context.inventory = inventory;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".try-key").click(this._onTryKey.bind(this));
    html.find(".try-pick").click(this._onTryPick.bind(this));
    html.find(".try-bash").click(this._onTryBash.bind(this));
    html.find(".try-disarm").click(this._onTryDisarm.bind(this));

    html.find(".item-delete").click(async (ev) => {
      const li = $(ev.currentTarget).closest("[data-item-id]");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) await item.delete();
    });

    html.find(".item-create").click(async (ev) => {
      await Item.create({ name: "Loot", type: "misc" }, { parent: this.actor });
    });

    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).closest("[data-item-id]");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) item.sheet.render(true);
    });
  }

  _getActor() {
    const tokens = canvas.tokens.controlled;
    if (tokens.length) return tokens[0].actor;
    if (game.user.character) return game.user.character;
    return null;
  }

  // --- КЛЮЧ ---
  async _onTryKey(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите своего персонажа.");
    const keyName = this.actor.system.attributes.keyName.value;

    if (!keyName) return ui.notifications.warn("Здесь нет замочной скважины.");

    const hasKey = actor.items.find((i) =>
      i.name.toLowerCase().includes(keyName.toLowerCase())
    );
    if (hasKey) {
      await this.actor.update({ "system.attributes.isLocked.value": false });
      ui.notifications.info("Открыто.");
      ChatMessage.create({
        content: `🔓 <b>${actor.name}</b> открывает замок ключом "${hasKey.name}".`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
    } else {
      ui.notifications.error(`Нужен предмет: "${keyName}"`);
    }
  }

  // --- ВЗЛОМ ---
  async _onTryPick(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");

    if (this.actor.system.attributes.canPick?.value === false) {
      return ui.notifications.warn("Этот замок нельзя взломать.");
    }

    const picks = actor.items.find((i) => i.name.match(/lockpick|отмычк/i));
    if (!picks || picks.system.quantity < 1)
      return ui.notifications.warn("Нет отмычек!");

    // ШУМ: Добавляем немного шума (костыль для визуализации)
    NoiseManager.add(2);

    const dc = this.actor.system.attributes.lockDC.value || 15;
    const skill = actor.system.skills.mechanical.value || 0;

    let targetChance = skill - dc;
    if (targetChance < 0) targetChance = 0;

    const roll = new Roll("1d100");
    await roll.evaluate();
    const success = roll.total <= targetChance;

    let msg = `<div class="z-chat-card"><div class="z-card-header">Взлом (Mechanical)</div>`;
    msg += `<div>Навык: ${skill} - СЛ: ${dc} = <b>${targetChance}%</b></div>`;
    msg += `<div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${
      success ? "success" : "failure"
    }">${roll.total}</div></div></div>`;

    if (success) {
      await this.actor.update({ "system.attributes.isLocked.value": false });
      msg += `<div style="color:green; font-weight:bold; text-align:center;">ЗАМОК ВСКРЫТ!</div>`;
    } else {
      msg += `<div style="color:red; font-weight:bold; text-align:center;">НЕУДАЧА</div>`;
      msg += `<div style="text-align:center; font-size:0.9em; margin-top:5px;">Отмычка сломалась.</div>`;
      // Отмычка тратится всегда при неудаче
      if (picks.system.quantity > 1)
        await picks.update({ "system.quantity": picks.system.quantity - 1 });
      else await picks.delete();
    }
    msg += `</div>`;
    ChatMessage.create({
      content: msg,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  // --- ВЫБИВАНИЕ ---
  async _onTryBash(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");

    if (this.actor.system.attributes.canBash?.value === false) {
      return ui.notifications.warn("Эту дверь не выбить.");
    }

    const dc = this.actor.system.attributes.bashDC.value || 18;
    const str = actor.system.attributes.str.value;

    const crowbar = actor.items.find((i) => i.name.match(/crowbar|лом/i));
    const hasCrowbar = !!crowbar;

    let bonus = 0;
    let label = "Сила (Str)";

    // БОНУС: +4 с ломом
    if (hasCrowbar) {
      bonus = 4;
      label = "Сила + Лом (+4)";
    }

    const roll = new Roll("1d10 + @str + @bonus", { str, bonus });
    await roll.evaluate();

    // ШУМ: Исправлено на NoiseManager
    NoiseManager.add(15);

    let msg = `<div class="z-chat-card"><div class="z-card-header">Выбивание (${label})</div>`;
    msg += `<div>Roll: ${roll.total} vs СЛ: ${dc}</div>`;

    if (roll.total >= dc) {
      await this.actor.update({ "system.attributes.isLocked.value": false });
      msg += `<div style="color:green; font-weight:bold; text-align:center;">ВЫБИТО! (Шум +15)</div>`;
    } else {
      msg += `<div style="color:red; font-weight:bold; text-align:center;">НЕ ПОДДАЕТСЯ</div>`;

      const diceResult = roll.terms[0].results[0].result;
      if (diceResult === 1 && !hasCrowbar) {
        msg += `<div style="color:#d32f2f; margin-top:5px; border-top:1px dashed red;">😫 ТРАВМА РУКИ!</div>`;
        await actor.applyDamage(1, "true", "rArm");
      }
    }
    msg += `</div>`;
    ChatMessage.create({
      content: msg,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  // --- ОБЕЗВРЕЖИВАНИЕ ---
  async _onTryDisarm(ev) {
    const actor = this._getActor();
    if (!actor) return ui.notifications.warn("Выберите персонажа.");

    const dc = this.actor.system.attributes.disarmDC.value || 15;
    const skill = actor.system.skills.mechanical.value || 0;

    let target = skill - dc * 2;
    if (target < 0) target = 0;

    const roll = new Roll("1d100");
    await roll.evaluate();

    let msg = `<div class="z-chat-card"><div class="z-card-header">Обезвреживание</div>`;
    msg += `<div>Навык ${skill} - СЛ ${dc} = <b>${target}%</b></div>`;
    msg += `<div class="z-slot-machine"><div class="z-reel-window"><div class="z-reel-spin ${
      roll.total <= target ? "success" : "failure"
    }">${roll.total}</div></div></div>`;

    if (roll.total <= target) {
      await this.actor.update({ "system.attributes.trapActive.value": false });
      msg += `<div style="color:green; font-weight:bold; text-align:center;">ЛОВУШКА ОБЕЗВРЕЖЕНА</div>`;
    } else {
      msg += `<div style="color:red; font-weight:bold; text-align:center;">ПРОВАЛ</div>`;
      if (roll.total >= 96) {
        msg += `<div style="color:#d32f2f; font-weight:bold;">КРИТИЧЕСКИЙ ПРОВАЛ! БУМ!</div>`;
        const dmg = this.actor.system.attributes.trapDmg.value;
        const r = new Roll(dmg);
        await r.evaluate();
        await actor.applyDamage(r.total, "fire", "torso");
        // ШУМ ПРИ ВЗРЫВЕ
        NoiseManager.add(20);
      }
    }
    msg += `</div>`;
    ChatMessage.create({
      content: msg,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }
}
