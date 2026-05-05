import { ZBaseActorSheet } from "./base-sheet.js";
import { ZCharacterCreator } from "./apps/character-creator.js";
import { openCommunicationDialog } from "./apps/communication-dialog.js";
import { openSocialCheckDialog } from "./apps/social-check-dialog.js";
import { Z_SOCIAL_ATTITUDES, Z_SOCIAL_PRESETS } from "./social-check.js";

export class ZActorSheet extends ZBaseActorSheet {
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    if (["survivor", "npc"].includes(this.actor.type)) {
      buttons.unshift({
        label: "Общ.",
        class: "z-communication-header",
        icon: "fas fa-user-friends",
        onclick: () => openCommunicationDialog(this.actor)
      });
      buttons.unshift({
        label: "Соц.",
        class: "z-social-check-header",
        icon: "fas fa-comments",
        onclick: () => openSocialCheckDialog(this.actor)
      });
    }

    if (game.user.isGM && this.actor.type === "npc") {
      buttons.unshift({
        label: "Профиль",
        class: "z-social-profile-header",
        icon: "fas fa-user-edit",
        onclick: () => this._showSocialProfileDialog()
      });
    }

    return buttons;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["zsystem", "sheet", "actor"],
      template: "systems/zsystem/sheets/actor-sheet.hbs",
      width: 800,
      height: 750,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "attributes",
        },
      ],
      dragDrop: [
        { dragSelector: ".item", dropSelector: null } 
      ]
    });
  }

  getData() {
    const context = super.getData();
    context.system = this.actor.system || {};
    context.isGM = game.user.isGM;
    context.isNpc = this.actor.type === "npc";
    context.hasSocialProfile = ["survivor", "npc"].includes(this.actor.type);
    context.canSocialCheck = ["survivor", "npc"].includes(this.actor.type);
    context.isProne =
      this.actor.effects?.some((e) => e.statuses.has("prone")) || false;
    context.perks = []; 
    context.socialOptions = {
      attitudes: Object.entries(Z_SOCIAL_ATTITUDES).map(([key, label]) => ({ key, label })),
      presets: Object.entries(Z_SOCIAL_PRESETS).map(([key, label]) => ({ key, label }))
    };

    const currentHP = this.actor.system.resources?.hp?.value ?? 0;

    // ПРАВИЛЬНАЯ ФОРМУЛА СМЕРТИ (Vig * 5)
    const vig = this.actor.system.attributes?.vig?.value || 1;
    const deathThreshold = -(vig * 5);
    context.isDead = currentHP <= deathThreshold;

    context.labels = {
      attributes: {
        str: "СИЛА",
        agi: "ЛОВКОСТЬ",
        vig: "ЖИВУЧЕСТЬ",
        per: "ВОСПРИЯТИЕ",
        int: "ИНТЕЛЛЕКТ",
        cha: "ХАРИЗМА",
      },
      skills: {
        melee: "Ближний бой",
        ranged: "Стрельба",
        science: "Наука",
        mechanical: "Механика",
        medical: "Медицина",
        diplomacy: "Дипломатия",
        leadership: "Лидерство",
        survival: "Выживание",
        athletics: "Атлетика",
        stealth: "Скрытность",
      },
    };

    this._prepareInventory(context);

    context.effects = (this.actor.effects || []).reduce((arr, e) => {
        // Если это инфекция И пользователь не ГМ -> пропускаем
        if (e.flags?.zsystem?.isInfection && !game.user.isGM) {
            return arr;
        }

        arr.push({
            id: e.id,
            name: e.name,
            img: e.img,
            disabled: e.disabled,
            duration: e.duration?.label || "",
            isTemporary: e.isTemporary,
            isHidden: e.flags?.zsystem?.isInfection // Флаг для шаблона, если захочешь подсветить ГМу
        });
        return arr;
    }, []);

    return context;
  }

  _prepareInventory(context) {
    const inventory = {
      weapon: { label: "Оружие", items: [] },
      ammo: { label: "Патроны", items: [] },
      armor: { label: "Броня", items: [] },
      medicine: { label: "Медицина", items: [] },
      food: { label: "Еда", items: [] },
      materials: { label: "Материалы", items: [] },
      luxury: { label: "Роскошь", items: [] },
      misc: { label: "Разное", items: [] },
    };

    const items = this.actor.items || [];
    for (let i of items) {

      if (i.type === 'perk') {
          // Добавляем в отдельный массив и пропускаем добавление в инвентарь
          context.perks.push(i);
          continue; 
      }
      let cat = i.system.category || "misc";
      if (i.type === "weapon") cat = "weapon";
      if (i.type === "ammo") cat = "ammo";
      if (i.type === "armor") cat = "armor";
      if (i.type === "food") cat = "food";
      if (i.type === "medicine") cat = "medicine";

      if (inventory[cat]) inventory[cat].items.push(i);
      else inventory.misc.items.push(i);
    }
    context.inventory = inventory;
  }


  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    

    // --- КНОПКИ УПРАВЛЕНИЯ ---
    html.find(".stand-up-btn").click((ev) => this.actor.standUp());

    html.find(".rest-btn").click((ev) => {
    // --- ФИКС: ЗАПРЕТ ОТДЫХА В БОЮ ---
    if (this.actor.inCombat) {
        return ui.notifications.warn("Вы не можете отдыхать во время боя!");
    }

    Dialog.confirm({
        title: "Ночной отдых",
        content: "Отдохнуть и восстановить силы?",
        yes: () => this.actor.longRest(),
    });
});

    html.find(".zombie-rise-btn").click((ev) => {
      Dialog.confirm({
        title: "Восстать из мертвых?",
        content: "Персонаж станет зомби-NPC.",
        yes: () => this.actor.riseAsZombie(),
      });
    });

    html.find(".ap-reset").click(async (ev) => {
      const max = this.actor.system.resources?.ap?.max || 0;
      await this.actor.update({ "system.resources.ap.value": max });
    });
    html.find(".attr-roll").click((ev) => {
        const key = ev.currentTarget.dataset.key;
        this.actor.rollAttribute(key);
    });

    html.find(".skill-roll").click((ev) => {
      const skillKey = $(ev.currentTarget).closest(".skill-row").data("skill");
      this.actor.rollSkill(skillKey);
    });

    html.find('.convert-loot-btn').click(ev => {
    Dialog.confirm({
        title: "Превратить в лут?",
        content: "<p>Персонаж будет удален и заменен контейнером с его вещами.</p>",
        yes: () => this.actor.convertToLoot()
    });
    });

    html.find(".item-favorite").click(async (ev) => {
    ev.preventDefault();
    const li = $(ev.currentTarget).parents(".item");
    const item = this.actor.items.get(li.data("itemId"));
    
    // Переключаем флаг (создаем его, если нет)
    const isFav = item.system.favorite || false;
    await item.update({ "system.favorite": !isFav });
});

    // --- ИНВЕНТАРЬ (ЕДИНЫЙ БЛОК) ---

    // 1. Использование (Медицина / Оружие / Редактирование)
    // Мы вешаем один обработчик на .item-use и .inv-slot.item
    // Но чтобы не дублировать логику, разделим классы.

    // Кнопка сердца (Медицина)
    html.find(".item-use").click((ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // Важно, чтобы не всплывало
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item && item.type === "medicine") this.actor.useMedicine(item);
    });

    // Клик по слоту быстрого доступа (ЛКМ)
    html.find(".inv-slot.item").click((ev) => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;

      if (item.type === "weapon") this.actor.performAttack(itemId);
      else if (item.type === "medicine") this.actor.useMedicine(item);
      else item.sheet.render(true);
    });

    // ПКМ по слоту
    html.find(".inv-slot.item").contextmenu((ev) => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    // CRUD Предметов
    html.find(".item-edit").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    html.find(".item-delete").click(async (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      Dialog.confirm({
        title: "Удалить?",
        content: `<p>Удалить <strong>${item.name}</strong>?</p>`,
        yes: () => item.delete(),
      });
    });

    html.find(".item-roll").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.performAttack(li.data("itemId"));
    });

    html.find(".item-toggle").click(async (ev) => {
      ev.preventDefault();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (!item) return;

      const isEquipping = !item.system.equipped;

      // --- ЛОГИКА КОНТРОЛЯ РУК ---
      if (isEquipping && item.type === "weapon") {
          const slotsForThisItem = item.system.hands === "2h" ? 2 : 1;
          const equippedWeapons = this.actor.items.filter(i =>
              i.type === "weapon" && i.system.equipped && i.id !== item.id
          );
          let currentlyUsedSlots = 0;
          equippedWeapons.forEach(w => { currentlyUsedSlots += (w.system.hands === "2h" ? 2 : 1); });

          if (currentlyUsedSlots + slotsForThisItem > 2) {
              return ui.notifications.warn(`Все руки заняты (${currentlyUsedSlots}/2)! Сначала снимите другое оружие.`);
          }

          // Для одноручного — спросить в какую руку
          if (item.system.hands !== "2h") {
              const hasLArmInjury = this.actor.hasStatusEffect("injury-arm-lArm");
              const hasRArmInjury = this.actor.hasStatusEffect("injury-arm-rArm");
              const labelR = `Правая${hasRArmInjury ? " ⚠ сломана" : ""}`;
              const labelL = `Левая${hasLArmInjury ? " ⚠ сломана" : ""}`;

              const chosenHand = await new Promise(resolve => {
                  new Dialog({
                      title: `Экипировать: ${item.name}`,
                      content: `<p>В какую руку взять <b>${item.name}</b>?</p>`,
                      buttons: {
                          right: { label: labelR, callback: () => resolve("rArm") },
                          left:  { label: labelL, callback: () => resolve("lArm") },
                      },
                      close: () => resolve(null)
                  }).render(true);
              });

              if (!chosenHand) return; // Закрыли диалог
              await item.setFlag("zsystem", "weaponHand", chosenHand);
          }
      }

      // Трата 1 AP при надевании оружия
      if (isEquipping && item.type === "weapon") {
          const curAP = this.actor.system.resources.ap.value ?? 0;
          if (curAP < 1) return ui.notifications.warn("Недостаточно AP для смены оружия!");
          await this.actor.update({ "system.resources.ap.value": Math.max(0, curAP - 1) });
      }

      await item.update({ "system.equipped": isEquipping });
    });

    html.find(".item-reload").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      this.actor.reloadWeapon(item);
    });

    html.find(".item-unjam").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      this.actor.unjamWeapon(item);
    });

    html.find(".item-repair-weapon").click((ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      this.actor.repairWeapon(item, { partsToSpend: 1 });
    });

    html.find(".full-heal-btn").click(async (ev) => {
      Dialog.confirm({
        title: "Полное исцеление",
        content: "Восстановить всё?",
        yes: () => this.actor.fullHeal(),
      });
    });

    html.find('.char-manager-btn').click(ev => {
        new ZCharacterCreator(this.actor).render(true);
    });

    html.find(".item-hand-badge").click(async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
      if (!item) return;

      const curAP = this.actor.system.resources.ap.value ?? 0;
      if (curAP < 1) return ui.notifications.warn("Недостаточно AP для смены руки!");

      const currentHand = item.getFlag("zsystem", "weaponHand") ?? "rArm";
      const newHand = currentHand === "rArm" ? "lArm" : "rArm";
      const newHandLabel = newHand === "rArm" ? "Правая" : "Левая";

      await item.setFlag("zsystem", "weaponHand", newHand);
      await this.actor.update({ "system.resources.ap.value": Math.max(0, curAP - 1) });
      ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `<div style="color:#f39c12; font-size:0.9em;">🤚 Смена руки (${item.name}): ${newHandLabel} (-1 AP)</div>`
      });
    });

    html.find(".item-create").click(this._onItemCreate.bind(this));
    html.find(".effect-control").click((ev) => this._onManageEffect(ev));

    new ContextMenu(html, ".item", [
    {
      name: "Передать члену отряда",
      icon: '<i class="fas fa-exchange-alt"></i>',
      condition: li => {
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        // Нельзя передавать надетые вещи и мертвым
        return item && !item.system.equipped && this.actor.system.resources.hp.value > 0;
      },
      callback: li => {
        const item = this.actor.items.get(li.data("itemId"));
        this._showTransferDialog(item);
      }
    }
  ]);
  
  }

  /** @override */
  _getItemContextOptions() {
    const options = super._getItemContextOptions();

    // Добавляем пункт "Передать персонажу"
    options.push({
      name: "Передать члену отряда",
      icon: '<i class="fas fa-exchange-alt"></i>',
      condition: li => {
        const item = this.actor.items.get(li.data("itemId"));
        // Нельзя передавать надетые вещи (сначала сними!) или если персонаж мертв
        return item && !item.system.equipped && this.actor.system.resources.hp.value > 0;
      },
      callback: li => {
        const item = this.actor.items.get(li.data("itemId"));
        this._showTransferDialog(item);
      }
    });

    return options;
  }

  /**
   * Диалог выбора получателя
   */
  async _showTransferDialog(item) {
    // Собираем всех выживших (кроме себя)
    const targets = game.actors.filter(a => a.type === "survivor" && a.id !== this.actor.id);
    
    if (targets.length === 0) return ui.notifications.warn("Больше нет доступных персонажей.");

    let optionsHtml = targets.map(t => `<option value="${t.uuid}">${t.name}</option>`).join("");

    new Dialog({
      title: `Передать: ${item.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Кому передать?</label>
            <select id="target-uuid">${optionsHtml}</select>
          </div>
          <p style="font-size:0.8em; color:gray;">Предмет будет перемещен в инвентарь выбранного персонажа.</p>
        </form>
      `,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: "Передать",
          callback: async (html) => {
            const targetUuid = html.find("#target-uuid").val();
            
            // Отправляем запрос ГМу (используем уже готовую систему флагов в main.js)
            ChatMessage.create({
              content: `<i>Система: ${this.actor.name} передает ${item.name}...</i>`,
              whisper: ChatMessage.getWhisperRecipients("GM"),
              flags: {
                zsystem: {
                  transferItem: {
                    sourceUuid: item.uuid,
                    targetActorUuid: targetUuid // transferItem в main.js должен уметь работать с UUID
                  }
                }
              }
            });
            ui.notifications.info(`Вы передали ${item.name}.`);
          }
        },
        cancel: { label: "Отмена" }
      }
    }).render(true);
  }

  _showSocialProfileDialog() {
    const social = this.actor.system.social || {};
    const attitudeOptions = Object.entries(Z_SOCIAL_ATTITUDES)
      .map(([key, label]) => `<option value="${key}" ${social.attitude === key ? "selected" : ""}>${label}</option>`)
      .join("");
    const presetOptions = Object.entries(Z_SOCIAL_PRESETS)
      .map(([key, label]) => `<option value="${key}" ${social.preset === key ? "selected" : ""}>${label}</option>`)
      .join("");

    new Dialog({
      title: `Социальный профиль: ${this.actor.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Отношение</label>
            <select name="attitude">${attitudeOptions}</select>
          </div>
          <div class="form-group">
            <label>Пресет сложности</label>
            <select name="preset">${presetOptions}</select>
          </div>
          <div class="form-group">
            <label>Заметка ГМа</label>
            <textarea name="notes" rows="4">${social.notes || ""}</textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          label: "Сохранить",
          callback: async (html) => {
            await this.actor.update({
              "system.social.attitude": html.find('[name="attitude"]').val(),
              "system.social.preset": html.find('[name="preset"]').val(),
              "system.social.notes": html.find('[name="notes"]').val()
            });
          }
        },
        cancel: {
          label: "Отмена"
        }
      },
      default: "save"
    }).render(true);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;

    if (type === "select") {
      const types = {
        weapon: "Оружие",
        armor: "Броня",
        ammo: "Патроны",
        medicine: "Медицина",
        food: "Еда",
        misc: "Разное",
        resource: "Ресурс",
      };
      let options = "";
      for (let [k, v] of Object.entries(types))
        options += `<option value="${k}">${v}</option>`;

      new Dialog({
        title: "Создать предмет",
        content: `<form><div class="form-group"><label>Тип:</label><select id="type-select">${options}</select></div></form>`,
        buttons: {
          create: {
            label: "Создать",
            callback: async (html) => {
              const selectedType = html.find("#type-select").val();
              const itemData = {
                name: `Новое ${types[selectedType]}`,
                type: selectedType,
                system: { category: selectedType },
              };
              await Item.create(itemData, { parent: this.actor });
            },
          },
        },
        default: "create",
      }).render(true);
      return;
    }
    const itemData = {
      name: `Новый предмет`,
      type: type,
      system: { category: type === "misc" ? "misc" : type },
    };
    return await Item.create(itemData, { parent: this.actor });
  }

  async _onManageEffect(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const li = $(a).closest("[data-effect-id]");
    const effectId = li.data("effectId");

    switch (a.dataset.action) {
      case "create":
        return this.actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "Новый эффект",
            img: "icons/svg/aura.svg",
            origin: this.actor.uuid,
            disabled: false,
          },
        ]);
      case "edit":
        return this.actor.effects.get(effectId)?.sheet.render(true);
      case "delete":
        return this.actor.effects.get(effectId)?.delete();
      case "toggle":
        const effect = this.actor.effects.get(effectId);
        return effect?.update({ disabled: !effect.disabled });
    }
  }
}

