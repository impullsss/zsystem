export class NoiseManager {
  static ID = "z-noise-meter";

  static init() {
    game.settings.register("zsystem", "currentNoise", {
      scope: "world", config: false, type: Number, default: 0,
      onChange: (val) => NoiseManager.updateHUD(val)
    });
    window.NoiseManager = NoiseManager;
    Hooks.once("ready", () => NoiseManager.renderHUD());
    
    Hooks.on("updateCombat", (combat, changed) => { if (game.user.isGM && changed.round) NoiseManager.decay(); });
  }

  static get value() { return game.settings.get("zsystem", "currentNoise"); }

  // === ИСПРАВЛЕННЫЙ МЕТОД ADD ===
  static async add(amount) {
      if (game.zsystemSocket) {
          await game.zsystemSocket.executeAsGM("addNoiseGM", amount);
      } else {
          // Фолбек для ГМа, если вдруг сокет еще не готов (хотя должен быть)
          if(game.user.isGM) NoiseManager.addGM(amount);
      }
  }

  static async addGM(amount) {
      const current = NoiseManager.value;
      const newVal = Math.max(0, current + amount);
      await game.settings.set("zsystem", "currentNoise", newVal);
      
      if(amount > 0) {
          // Уведомление увидит только ГМ, так как функция выполняется у него
          ui.notifications.info(`Шум: +${amount} (Всего: ${newVal})`);
      }
  }

  static decay() {
    const current = NoiseManager.value;
    if (current <= 0) return;
    const newVal = Math.floor(current / 2);
    game.settings.set("zsystem", "currentNoise", newVal);
    ui.notifications.info(`Шум снизился до ${newVal}`);
  }

  static renderHUD() {
    if ($(`#${this.ID}`).length) return;
    const controls = game.user.isGM ? `
      <div class="noise-controls">
        <i class="fas fa-minus noise-btn" data-action="sub"></i>
        <div class="noise-value">0</div>
        <i class="fas fa-plus noise-btn" data-action="add"></i>
      </div>` : `<div class="noise-value">0</div>`;

    const html = `
      <div id="${this.ID}">
        <div class="noise-label">NOISE</div>
        ${controls}
        <div class="noise-bar-bg"><div class="noise-bar-fill"></div></div>
      </div>
    `;
    $('body').append(html);
    
    $(`#${this.ID} .noise-btn`).click(ev => {
        const action = ev.target.dataset.action;
        if(action === "add") NoiseManager.add(5); 
        if(action === "sub") NoiseManager.add(-5);
    });
    NoiseManager.updateHUD(NoiseManager.value);
  }

  static updateHUD(val) {
    const hud = $(`#${this.ID}`);
    hud.find('.noise-value').text(val);
    const percent = Math.min(100, (val / 50) * 100);
    hud.find('.noise-bar-fill').css('width', `${percent}%`);
    if (val > 20) hud.addClass('danger'); else hud.removeClass('danger');
  }
}