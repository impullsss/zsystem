// --- START OF FILE src/module/chat.js ---

import { GLOBAL_STATUSES } from "./constants.js";

export class ZChat {
  static init() {
    Hooks.on("renderChatMessage", (message, html, data) => {
      ZChat.addListeners(html);
    });
  }

  static addListeners(html) {
    html.find(".z-apply-damage").click(ev => ZChat.onApplyDamage(ev));
    html.find(".z-apply-effect").click(ev => ZChat.onApplyEffect(ev));
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
}