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

   static async add(amount) {
      if (game.user.isGM) {
          // Если ГМ, применяем сразу
          await NoiseManager.addGM(amount);
      } else {
          // Если Игрок, создаем техническое сообщение
          // ГМ его увидит, прочитает флаг и добавит шум.
          ChatMessage.create({
              content: `<i style="color:gray; font-size:0.8em;">(Системный шум +${amount})</i>`,
              flags: { zsystem: { noiseAdd: amount } }, // ФЛАГ ДЛЯ ХУКА
              whisper: ChatMessage.getWhisperRecipients("GM") // Чтобы не спамить в чат игрокам
          });
      }
  }

  // Этот метод регистрируется в сокетах для ГМа
  static async addGM(amount) {
      const current = NoiseManager.value;
      const newVal = Math.max(0, current + amount);
      await game.settings.set("zsystem", "currentNoise", newVal);
      
      if(amount > 0) {
          ui.notifications.info(`Шум (GM): +${amount}`);
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