export class ZChat {
  static init() {
    Hooks.on("renderChatMessage", (message, html, data) => {
      ZChat.addListeners(html);
    });
  }

  static addListeners(html) {
    html.find(".z-apply-damage").click(ev => ZChat.onApplyDamage(ev));
  }

  static async onApplyDamage(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const damage = Number(btn.dataset.damage);
    const type = btn.dataset.type || "blunt";
    // Читаем конечность из кнопки (по умолчанию torso)
    const limb = btn.dataset.limb || "torso";

    const targets = canvas.tokens.controlled;
    
    if (targets.length === 0) {
        return ui.notifications.warn("Выберите токен (персонажа), чтобы нанести урон!");
    }

    for (let token of targets) {
        if (token.actor) {
            // Передаем конечность в метод актера
            await token.actor.applyDamage(damage, type, limb);
        }
    }
  }
}