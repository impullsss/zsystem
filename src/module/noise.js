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

  static async visualizeNoise(token, radius) {
      if (!game.settings.get("zsystem", "debugNoise")) return;
      if (!token || radius <= 0) return;

      const templateData = {
          t: "circle",
          user: game.user.id,
          x: token.center.x,
          y: token.center.y,
          direction: 0,
          distance: radius, // Радиус в игровых единицах (метрах)
          borderColor: "#FF0000",
          fillColor: "#FF0000",
          fillAlpha: 0.2
      };

      // Создаем шаблон
      const doc = (await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]))[0];

      // Удаляем через 3 секунды
      setTimeout(() => {
          if (doc) doc.delete();
      }, 3000);
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
    NoiseManager.visualizeNoise(sourceToken, noiseLevel);
    if (alertedCount > 0) {
        console.log(`ZSystem | Aggro Check: ${alertedCount} zombies alerted.`);
    }
  }

  // === HUD ===
  static renderHUD() {
    if (document.getElementById(this.ID)) return;

    const isGM = game.user.isGM;
    const controls = isGM
      ? `<div class="noise-controls">
           <button class="noise-btn" data-action="sub">−</button>
           <input class="noise-input" type="number" value="0" min="0" title="Ввести шум вручную"/>
           <button class="noise-btn" data-action="add">+</button>
         </div>`
      : `<div class="noise-value-ro">0</div>`;

    const el = document.createElement("div");
    el.id = this.ID;
    el.innerHTML = `
      <div class="noise-header">
        <span class="noise-label">NOISE</span>
        ${isGM ? `<span class="noise-hide-btn" title="Скрыть">▲</span>` : ""}
      </div>
      ${controls}
      <div class="noise-bar-bg"><div class="noise-bar-fill"></div></div>`;
    document.body.appendChild(el);

    // Восстанавливаем позицию
    const savedPos = JSON.parse(localStorage.getItem("zsystem-noise-pos") || "null");
    if (savedPos) { el.style.left = savedPos.left + "px"; el.style.top = savedPos.top + "px"; }

    // Восстанавливаем видимость
    if (localStorage.getItem("zsystem-noise-hidden") === "1") el.classList.add("noise-collapsed");

    // Нативный drag
    let dragging = false, ox = 0, oy = 0;
    el.querySelector(".noise-header").addEventListener("mousedown", e => {
      if (e.target.classList.contains("noise-hide-btn")) return;
      dragging = true;
      ox = e.clientX - el.getBoundingClientRect().left;
      oy = e.clientY - el.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      el.style.left = (e.clientX - ox) + "px";
      el.style.top  = (e.clientY - oy) + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem("zsystem-noise-pos", JSON.stringify({ left: parseInt(el.style.left), top: parseInt(el.style.top) }));
    });

    // Кнопки +/-
    el.querySelectorAll(".noise-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        const action = e.currentTarget.dataset.action;
        if (action === "add") NoiseManager.add(5);
        if (action === "sub") NoiseManager.add(-5);
      });
    });

    // Ручной ввод — сохраняем по Enter или потере фокуса
    const input = el.querySelector(".noise-input");
    if (input) {
      const commit = () => {
        const val = Math.max(0, parseInt(input.value) || 0);
        game.settings.set("zsystem", "currentNoise", val);
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", e => { if (e.key === "Enter") { commit(); input.blur(); } });
    }

    // Скрыть/показать
    const hideBtn = el.querySelector(".noise-hide-btn");
    if (hideBtn) {
      hideBtn.addEventListener("click", () => {
        const collapsed = el.classList.toggle("noise-collapsed");
        localStorage.setItem("zsystem-noise-hidden", collapsed ? "1" : "0");
        hideBtn.textContent = collapsed ? "▼" : "▲";
      });
    }

    NoiseManager.updateHUD(NoiseManager.value);
  }

  static updateHUD(val) {
    const el = document.getElementById(this.ID);
    if (!el) return;
    const input = el.querySelector(".noise-input");
    // Не перебиваем значение пока пользователь редактирует
    if (input && document.activeElement !== input) input.value = val;
    const ro = el.querySelector(".noise-value-ro");
    if (ro) ro.textContent = val;
    const fill = el.querySelector(".noise-bar-fill");
    if (fill) fill.style.width = Math.min(100, (val / 50) * 100) + "%";
    el.classList.toggle("danger", val > 20);
  }
}