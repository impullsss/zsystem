import { GLOBAL_STATUSES } from "./constants.js";
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
          await NoiseManager.addGM(amount);
      } else {
          // Техническое сообщение для передачи флага ГМу
          ChatMessage.create({
              content: `<i style="color:gray; font-size:0.8em;">(Системный шум +${amount})</i>`,
              flags: { zsystem: { noiseAdd: amount } }, 
              whisper: ChatMessage.getWhisperRecipients("GM"),
              blind: true // Скрываем от игрока
          });
      }
  }

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

  // === ОБНОВЛЕННЫЙ МЕТОД: АГРО ЗОМБИ (С ИКОНКОЙ) ===
  static async checkAggro(sourceToken, noiseLevel) {
    if (!sourceToken || !noiseLevel || noiseLevel <= 0) return;
    if (!game.user.isGM) return; 

    const zombies = canvas.tokens.placeables.filter(t => t.actor && t.actor.type === "zombie");
    if (zombies.length === 0) return;

    const sourceCenter = sourceToken.center;
    let alertedCount = 0;

    for (let zombie of zombies) {
        if (zombie.actor.system.resources.hp.value <= 0) continue;

        const dist = canvas.grid.measureDistance(sourceToken, zombie);
        
        const collisions = CONFIG.Canvas.polygonBackends.move.testCollision(
            sourceCenter, 
            zombie.center, 
            { mode: "all", type: "move" }
        );
        const wallCount = collisions.length;

        let effectiveNoise = noiseLevel;
        if (wallCount > 0) {
            effectiveNoise = noiseLevel / Math.pow(2, wallCount);
        }

        if (dist <= effectiveNoise) {
            alertedCount++;
            
            // А) Поворот к источнику (Разворот на 180, если стояли спиной)
            let angle = Math.atan2(sourceCenter.y - zombie.center.y, sourceCenter.x - zombie.center.x) * (180 / Math.PI);
            angle += 270; // 90 (коррекция Foundry) + 180 (разворот)
            await zombie.document.update({ rotation: angle });

            // Б) Всплывающий текст
            canvas.interface.createScrollingText(zombie.center, "!", {
                anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
                direction: CONST.TEXT_ANCHOR_POINTS.TOP,
                fontSize: 48,
                fill: "#d32f2f",
                stroke: 0x000000,
                strokeThickness: 4,
                jitter: 0.25
            });

            // В) Накладываем иконку "Alerted" из констант
            const hasAlert = zombie.actor.effects.some(e => e.statuses.has("alerted"));
            
            if (!hasAlert) {
                // Используем данные из констант (GLOBAL_STATUSES должен быть импортирован или доступен)
                // Если импорт сложен, можно использовать CONFIG.statusEffects, но лучше импорт.
                // Для надежности, если импорт не сработает сразу, я пропишу фоллбэк, но постарайся добавить import.
                const effectData = GLOBAL_STATUSES?.alerted || {
                    id: "alerted",
                    label: "Тревога",
                    name: "Тревога",
                    icon: "icons/svg/hazard.svg",
                    statuses: ["alerted"]
                };

                await zombie.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }
    }

    if (alertedCount > 0) {
        console.log(`ZSystem | Aggro Check: ${alertedCount} zombies alerted.`);
    }
  }

  // === HUD (Без изменений) ===
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