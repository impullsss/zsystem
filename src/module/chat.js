// --- START OF FILE src/module/chat.js ---

import { GLOBAL_STATUSES } from "./constants.js";
import { NoiseManager } from "./noise.js";
import { buildTraumaHtml, resolveTraumaOutcome } from "./trauma.js";

export class ZChat {
  static init() {
    Hooks.on("renderChatMessageHTML", (message, html, data) => {
      ZChat.addListeners($(html));
    });
  }

  static addListeners(html) {
    html.find(".z-apply-damage").click(ev => ZChat.onApplyDamage(ev));
    html.find(".z-apply-effect").click(ev => ZChat.onApplyEffect(ev));
    html.find(".z-apply-weapon-wear").click(ev => ZChat.onApplyWeaponWear(ev));
    html.find(".z-apply-weapon-jam").click(ev => ZChat.onApplyWeaponJam(ev));
    html.find(".z-apply-extra-noise").click(ev => ZChat.onApplyExtraNoise(ev));
    html.find(".z-apply-actor-status").click(ev => ZChat.onApplyActorStatus(ev));
    html.find(".z-apply-weapon-drop").click(ev => ZChat.onApplyWeaponDrop(ev));
    html.find(".z-apply-item-lost").click(ev => ZChat.onApplyItemLost(ev));
    html.find(".z-roll-bad-scatter").click(ev => ZChat.onRollBadScatter(ev));
    html.find(".z-apply-ballistic-damage").click(ev => ZChat.onApplyBallisticDamage(ev));
    html.find(".z-apply-trauma").click(ev => ZChat.onApplyTrauma(ev));
  }

  static async onApplyDamage(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const damage = Number(btn.dataset.damage);
    const type = btn.dataset.type || "blunt";
    const limb = btn.dataset.limb || "torso";
    const validTargets = game.user.targets.size > 0 ? Array.from(game.user.targets) : canvas.tokens.controlled;

    if (validTargets.length === 0) {
        return ui.notifications.warn("Выберите цель (Target или Token)!");
    }

    for (let token of validTargets) {
        if (token.actor) {
            await token.actor.applyDamage(damage, type, limb);
        }
    }
  }

  static async onApplyEffect(event) {
      event.preventDefault();
      const btn = event.currentTarget;
      const effectId = btn.dataset.effect;
      const statusData = GLOBAL_STATUSES[effectId];
      if (!statusData) return;

      const validTargets = game.user.targets.size > 0 ? Array.from(game.user.targets) : canvas.tokens.controlled;
       if (validTargets.length === 0) return ui.notifications.warn("Выберите цель!");

      for (let token of validTargets) {
          if (token.actor) {
             // ПРОВЕРКА НА СУЩЕСТВОВАНИЕ
             const hasEffect = token.actor.effects.some(e => e.statuses.has(effectId));
             if (hasEffect) {
                 ui.notifications.info(`${token.name} уже имеет эффект ${statusData.label}`);
             } else {
                 await token.actor.createEmbeddedDocuments("ActiveEffect", [statusData]);
                 ui.notifications.info(`${token.name}: Наложен эффект ${statusData.label}`);
             }
          }
      }
  }

  static async onApplyWeaponWear(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("Только ГМ может применить износ оружия.");

      const btn = event.currentTarget;
      const itemUuid = btn.dataset.itemUuid;
      const amount = Math.max(1, Number(btn.dataset.amount) || 1);
      const item = itemUuid ? await fromUuid(itemUuid) : null;
      const hp = item?.system?.hp;

      if (!item || !hp) return ui.notifications.warn("Оружие для износа не найдено.");

      const current = Number(hp.value) || 0;
      const next = Math.max(0, current - amount);
      await item.update({ "system.hp.value": next });

      btn.disabled = true;
      btn.textContent = `Износ применён: ${current} → ${next}`;
      ui.notifications.info(`${item.name}: прочность ${current} → ${next}`);
  }

  static async onApplyExtraNoise(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("\u0422\u043e\u043b\u044c\u043a\u043e \u0413\u041c \u043c\u043e\u0436\u0435\u0442 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043b\u0438\u0448\u043d\u0438\u0439 \u0448\u0443\u043c.");

      const btn = event.currentTarget;
      const amount = Math.max(1, Number(btn.dataset.amount) || 1);
      await NoiseManager.add(amount);

      btn.disabled = true;
      btn.textContent = `\u0428\u0443\u043c \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d: +${amount}`;
  }

  static async onApplyWeaponJam(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("\u0422\u043e\u043b\u044c\u043a\u043e \u0413\u041c \u043c\u043e\u0436\u0435\u0442 \u043e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u043a\u043b\u0438\u043d \u043e\u0440\u0443\u0436\u0438\u044f.");

      const btn = event.currentTarget;
      const itemUuid = btn.dataset.itemUuid;
      const item = itemUuid ? await fromUuid(itemUuid) : null;

      if (!item) return ui.notifications.warn("\u041e\u0440\u0443\u0436\u0438\u0435 \u0434\u043b\u044f \u043a\u043b\u0438\u043d\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.");

      await item.update({ "system.jammed": true });
      btn.disabled = true;
      btn.textContent = "\u041e\u0440\u0443\u0436\u0438\u0435 \u0437\u0430\u043a\u043b\u0438\u043d\u0438\u043b\u043e";
      ui.notifications.warn(`${item.name}: \u043a\u043b\u0438\u043d`);
  }

  static async onApplyActorStatus(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("\u0422\u043e\u043b\u044c\u043a\u043e \u0413\u041c \u043c\u043e\u0436\u0435\u0442 \u043f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u0441\u0442\u0432\u0438\u0435.");

      const btn = event.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      const effectId = btn.dataset.effect;
      const statusData = GLOBAL_STATUSES[effectId];
      const doc = actorUuid ? await fromUuid(actorUuid) : null;
      const actor = doc?.actor || doc;

      if (!actor || !statusData) return ui.notifications.warn("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 \u0430\u043a\u0442\u0435\u0440\u0430 \u0438\u043b\u0438 \u044d\u0444\u0444\u0435\u043a\u0442.");

      const hasEffect = actor.effects?.some((effect) => effect.statuses?.has(effectId));
      if (!hasEffect) await actor.createEmbeddedDocuments("ActiveEffect", [statusData]);

      btn.disabled = true;
      btn.textContent = hasEffect
          ? "\u042d\u0444\u0444\u0435\u043a\u0442 \u0443\u0436\u0435 \u0431\u044b\u043b"
          : "\u042d\u0444\u0444\u0435\u043a\u0442 \u043f\u0440\u0438\u043c\u0435\u043d\u0451\u043d";
      ui.notifications.info(`${actor.name}: ${statusData.name || statusData.label}`);
  }

  static async onApplyWeaponDrop(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("\u0422\u043e\u043b\u044c\u043a\u043e \u0413\u041c \u043c\u043e\u0436\u0435\u0442 \u043e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u0432\u044b\u043f\u0430\u0434\u0435\u043d\u0438\u0435 \u043e\u0440\u0443\u0436\u0438\u044f.");

      const btn = event.currentTarget;
      const item = btn.dataset.itemUuid ? await fromUuid(btn.dataset.itemUuid) : null;
      if (!item) return ui.notifications.warn("\u041e\u0440\u0443\u0436\u0438\u0435 \u0434\u043b\u044f \u0432\u044b\u043f\u0430\u0434\u0435\u043d\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.");

      await item.update({ "system.equipped": false });
      btn.disabled = true;
      btn.textContent = "\u041e\u0440\u0443\u0436\u0438\u0435 \u0441\u043d\u044f\u0442\u043e \u0441 \u0440\u0443\u043a";
      ui.notifications.warn(`${item.name}: \u0432\u044b\u043f\u0430\u043b\u043e \u0438\u0437 \u0440\u0443\u043a`);
  }

  static async onApplyItemLost(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("\u0422\u043e\u043b\u044c\u043a\u043e \u0413\u041c \u043c\u043e\u0436\u0435\u0442 \u043e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u043f\u043e\u0442\u0435\u0440\u044e \u043f\u0440\u0435\u0434\u043c\u0435\u0442\u0430.");

      const btn = event.currentTarget;
      const item = btn.dataset.itemUuid ? await fromUuid(btn.dataset.itemUuid) : null;
      const amount = Math.max(1, Number(btn.dataset.amount) || 1);
      if (!item) return ui.notifications.warn("\u041f\u0440\u0435\u0434\u043c\u0435\u0442 \u0434\u043b\u044f \u043f\u043e\u0442\u0435\u0440\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.");

      const currentQuantity = Number(item.system?.quantity) || 1;
      if (currentQuantity > amount) {
          await item.update({ "system.quantity": currentQuantity - amount });
          btn.textContent = `\u041f\u043e\u0442\u0435\u0440\u044f\u043d\u043e: ${currentQuantity} -> ${currentQuantity - amount}`;
      } else {
          await item.delete();
          btn.textContent = "\u041f\u0440\u0435\u0434\u043c\u0435\u0442 \u043f\u043e\u0442\u0435\u0440\u044f\u043d";
      }

      btn.disabled = true;
      ui.notifications.warn(`${item.name}: \u043f\u043e\u0442\u0435\u0440\u044f\u043d`);
  }

  static async onRollBadScatter(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("\u0422\u043e\u043b\u044c\u043a\u043e \u0413\u041c \u043c\u043e\u0436\u0435\u0442 \u0440\u0430\u0437\u044b\u0433\u0440\u0430\u0442\u044c \u043f\u043b\u043e\u0445\u043e\u0439 \u0440\u0430\u0437\u043b\u0451\u0442.");

      const btn = event.currentTarget;
      const directionRoll = await new Roll("1d8").evaluate();
      const distanceRoll = await new Roll("1d6").evaluate();
      const directions = ["\u0441\u0435\u0432\u0435\u0440", "\u0441\u0435\u0432\u0435\u0440\u043e-\u0432\u043e\u0441\u0442\u043e\u043a", "\u0432\u043e\u0441\u0442\u043e\u043a", "\u044e\u0433\u043e-\u0432\u043e\u0441\u0442\u043e\u043a", "\u044e\u0433", "\u044e\u0433\u043e-\u0437\u0430\u043f\u0430\u0434", "\u0437\u0430\u043f\u0430\u0434", "\u0441\u0435\u0432\u0435\u0440\u043e-\u0437\u0430\u043f\u0430\u0434"];
      const direction = directions[Math.max(0, Math.min(7, directionRoll.total - 1))];
      const itemName = btn.dataset.itemName || "\u0431\u0440\u043e\u0441\u043e\u043a";

      await ChatMessage.create({
          content: `<div class="z-combat-outcome z-combat-outcome--danger"><strong>\u041f\u043b\u043e\u0445\u043e\u0439 \u0440\u0430\u0437\u043b\u0451\u0442</strong><span>${itemName}: ${direction}, ${distanceRoll.total} \u043c.</span></div>`
      });

      btn.disabled = true;
      btn.textContent = `\u0420\u0430\u0437\u043b\u0451\u0442: ${direction}, ${distanceRoll.total} \u043c`;
  }

  static async onApplyBallisticDamage(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("Только ГМ может применить баллистическое попадание.");

      const btn = event.currentTarget;
      const tokenUuid = btn.dataset.tokenUuid;
      const damage = Math.max(1, Number(btn.dataset.damage) || 1);
      const type = btn.dataset.type || "ballistic";
      const limb = btn.dataset.limb || "torso";
      const resultType = btn.dataset.resultType || "success";
      const armorPiercing = Math.max(0, Number(btn.dataset.armorPiercing) || 0);
      const traumaMultiplier = Math.max(0.1, Number(btn.dataset.traumaMultiplier) || 1);
      const doc = tokenUuid ? await fromUuid(tokenUuid) : null;
      const token = doc?.object || doc;
      const actor = token?.actor || doc?.actor;

      if (!actor) return ui.notifications.warn("Не удалось найти токен для баллистического попадания.");

      // Ballistic side hits are already reduced by projectile impact math.
      // Keep DR, but do not subtract armor AC a second time here.
      await actor.applyDamage(damage, type, limb, false, true, { armorPiercing });
      await ZChat.postTraumaReportForManualDamage({
          actor,
          damage,
          type,
          limb,
          resultType,
          severityMultiplier: traumaMultiplier
      });
      btn.disabled = true;
      btn.textContent = `Применено: ${actor.name} -${damage}`;
      ui.notifications.info(`${actor.name}: баллистическое попадание -${damage}`);
  }

  static async postTraumaReportForManualDamage({ actor, damage, type, limb, resultType, severityMultiplier = 1 }) {
      const traumaMode = game.settings.get("zsystem", "traumaMode") || "manual";
      if (traumaMode === "off") return;

      const severitySetting = Number(game.settings.get("zsystem", "traumaSeverityMultiplier"));
      const totalSeverityMultiplier = (Number.isFinite(severitySetting) && severitySetting > 0 ? severitySetting : 1)
          * Math.max(0.1, Number(severityMultiplier) || 1);
      const trauma = resolveTraumaOutcome({
          damage,
          maxHp: actor.system?.resources?.hp?.max,
          limbMax: actor.system?.limbs?.[limb]?.max,
          location: limb,
          damageType: type,
          resultType,
          targetUuid: actor.uuid,
          targetName: actor.name,
          severityMultiplier: totalSeverityMultiplier
      });
      const content = buildTraumaHtml(trauma, { mode: traumaMode });
      if (!content) return;

      await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content
      });
  }

  static async onApplyTrauma(event) {
      event.preventDefault();
      if (!game.user.isGM) return ui.notifications.warn("Только ГМ может применить травму.");

      const btn = event.currentTarget;
      const actorUuid = btn.dataset.actorUuid;
      const action = btn.dataset.action;
      const limb = btn.dataset.limb || "torso";
      const status = btn.dataset.status;
      const doc = actorUuid ? await fromUuid(actorUuid) : null;
      const actor = doc?.actor || doc;

      if (!actor) return ui.notifications.warn("Не удалось найти актёра для травмы.");

      if (action === "injury") {
          await actor._applyInjury?.(limb);
      } else if (action === "bleeding") {
          await actor._applyBleeding?.(limb);
      } else if (action === "status") {
          const statusData = GLOBAL_STATUSES[status];
          if (!statusData) return ui.notifications.warn("Неизвестный статус травмы.");
          const hasEffect = actor.effects?.some((effect) => effect.statuses?.has(status));
          if (!hasEffect) await actor.createEmbeddedDocuments("ActiveEffect", [statusData]);
      }

      btn.disabled = true;
      btn.textContent = `Применено: ${btn.textContent}`;
      ui.notifications.info(`${actor.name}: травма применена`);
  }
}
