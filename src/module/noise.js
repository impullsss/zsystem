export class NoiseManager {
  static ID = "z-noise-meter";

  static init() {
    // Регистрируем настройку для хранения текущего шума
    game.settings.register("zsystem", "currentNoise", {
      scope: "world",
      config: false,
      type: Number,
      default: 0,
      onChange: (val) => NoiseManager.updateHUD(val)
    });

    // Создаем HUD при готовности
    Hooks.once("ready", () => NoiseManager.renderHUD());
    
    // Хук на смену раунда для уменьшения шума
    Hooks.on("updateCombat", (combat, changed) => {
      if (changed.round) {
        NoiseManager.decay();
      }
    });
  }

  static get value() {
    return game.settings.get("zsystem", "currentNoise");
  }

  static async add(amount) {
    if (!amount) return;
    const current = NoiseManager.value;
    const newVal = current + amount;
    await game.settings.set("zsystem", "currentNoise", newVal);
    ui.notifications.info(`Шум повысился: +${amount} (Всего: ${newVal})`);
  }

  static async decay() {
    const current = NoiseManager.value;
    if (current <= 0) return;
    
    // Noise decreases by half its value per combat round
    const newVal = Math.floor(current / 2);
    await game.settings.set("zsystem", "currentNoise", newVal);
    ui.notifications.info(`Шум снизился до ${newVal}`);
  }

  static renderHUD() {
    if ($(`#${this.ID}`).length) return;

    const html = `
      <div id="${this.ID}">
        <div class="noise-label">NOISE</div>
        <div class="noise-value">0</div>
        <div class="noise-bar-bg"><div class="noise-bar-fill"></div></div>
      </div>
    `;
    $('body').append(html);
    NoiseManager.updateHUD(NoiseManager.value);
  }

  static updateHUD(val) {
    const hud = $(`#${this.ID}`);
    hud.find('.noise-value').text(val);
    
    // Визуализация: допустим, 50 - это "очень громко" (полная шкала)
    const percent = Math.min(100, (val / 50) * 100);
    hud.find('.noise-bar-fill').css('width', `${percent}%`);
    
    // Цвет меняется от желтого к красному
    if (val > 20) hud.addClass('danger');
    else hud.removeClass('danger');
  }
}