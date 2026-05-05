export const INJURY_EFFECTS = {
  head: {
    id: "injury-head",
    name: "Травма Головы (Контузия)",
    img: "icons/svg/daze.svg",
    statuses: ["injury-head"],
    isPhysical: true,
    changes:[], // Математика перенесена в actor.js
    description: "Снижает ИНТ и ВОС наполовину. -15 к Науке, Механике и Медицине. Риск потери AP каждый ход.",
  },
  torso: {
    id: "injury-torso",
    name: "Травма Торса (Сбито дыхание)",
    img: "icons/svg/blood.svg",
    statuses:["injury-torso"],
    isPhysical: true,
    changes:[], // Математика перенесена в actor.js
    description: "Снижает ЛОВ и ЖИВ на 1/3. Движение наносит 2d4 урона.",
  },
  arm: {
    id: "injury-arm",
    name: "Сломана Рука",
    img: "icons/svg/paralysis.svg",
    statuses: ["injury-arm"],
    isPhysical: true,
    changes:[], // Математика перенесена в actor.js и dice.js
    description: "Штраф -10% к точности. Атаки и взлом стоят на 1 AP дороже.",
  },
  leg: {
    id: "injury-leg",
    name: "Сломана Нога",
    img: "icons/svg/falling.svg",
    statuses: ["injury-leg"],
    isPhysical: true,
    changes:[], // Математика перенесена в actor.js и main.js
    description: "Штраф -10 к Уклонению. Каждый шаг стоит на 1 AP больше.",
  },
  unconscious: {
    id: "status-unconscious",
    name: "Без сознания (KO)",
    img: "icons/svg/unconscious.svg",
    statuses: ["status-unconscious"],
    isPhysical: true,
    changes: [{ key: "system.resources.ap.max", mode: 5, value: 0 }],
    description: "Персонаж выведен из строя. ХП = 0.",
  },
};

export const GLOBAL_STATUSES = {
  bleeding: {
    id: "bleeding",
    label: "Кровотечение",
    name: "Кровотечение",
    img: "icons/svg/blood.svg",
    statuses: ["bleeding"],
    isPhysical: true,
    description: "Теряет 4d4 HP каждый ход (Игнорирует броню).",
  },
  prone: {
    id: "prone",
    label: "Сбит с ног",
    name: "Сбит с ног",
    img: "icons/svg/falling.svg",
    statuses: ["prone"],
    isPhysical: true,
    changes:[], // Уклонение режется в actor.js
    description: "Уклонение снижено на 50%. Встать стоит 3 AP. Перемещение стоит дороже.",
  },
  dizzy: {
    id: "dizzy",
    label: "Головокружение",
    name: "Головокружение",
    img: "icons/svg/daze.svg",
    statuses: ["dizzy"],
    isPhysical: true,
    description: "-50% Точности на 3 хода.",
  },
  blind: {
    id: "blind",
    label: "Слепота",
    name: "Слепота",
    img: "icons/svg/blind.svg",
    statuses: ["blind"],
    isPhysical: true,
    changes:[], // ВОС режется в actor.js
    description: "Восприятие снижено на 50%. Точность -50%. Прицеливание невозможно.",
  },
  immolated: {
    id: "immolated",
    label: "Горение",
    name: "Горение",
    img: "icons/svg/fire.svg",
    statuses: ["immolated"],
    description: "Наносит 1d6 урона по КАЖДОЙ конечности каждый ход.",
  },
  poisoned: {
    id: "poisoned",
    label: "Отравление",
    name: "Отравление",
    img: "icons/svg/poison.svg",
    statuses: ["poisoned"],
    isPhysical: true,
    description: "Урон 1d6 каждый ход.",
  },
  panic: {
    id: "panic",
    label: "Паника",
    name: "Паника",
    img: "icons/svg/terror.svg",
    statuses: ["panic"],
    description: "Потеря контроля. (Используйте статусы Тревога/Страх/Срыв).",
  },
  infected: {
    id: "infected",
    label: "Инфекция",
    name: "Инфекция",
    img: "icons/svg/biohazard.svg",
    statuses: ["infected"],
    isPhysical: true,
    description: "Скрытый статус. Смерть через 3 дня.",
  },
  wounded: {
    id: "wounded",
    label: "Ранен (Wounded)",
    name: "Ранен (Wounded)",
    img: "icons/svg/degen.svg",
    statuses: ["wounded"],
    isPhysical: true,
    changes:[{ key: "system.resources.ap.max", mode: 2, value: -2 }],
    description: "После тяжелого ранения. -2 Макс АП. Лечится только отдыхом.",
  },
  fatigued: {
    id: "fatigued",
    label: "Утомление",
    name: "Утомление",
    img: "icons/svg/downgrade.svg",
    statuses: ["fatigued"],
    changes:[], // Математика в actor.js
    description: "Стакается до 5 раз. За стак: -10 Макс ХП, -1 Макс AP, -5% ко всем навыкам.",
  },
  overburdened: {
    id: "overburdened",
    label: "Перегруз",
    name: "Перегруз",
    img: "icons/svg/downgrade.svg",
    statuses: ["overburdened"],
    description: "Вес превышен. Уклонение -50%, движение стоит +1 AP."
  },
  stealth: {
    id: "stealth",
    label: "Скрытность",
    name: "Скрытность",
    img: "icons/svg/mystery-man.svg",
    statuses: ["stealth"],
    description: "Снижает радиус обзора врагов. Движение стоит +1 AP. Атака из стелса наносит х2 урон."
  },
  alerted: {
    id: "alerted",
    label: "Тревога",
    name: "Тревога",
    img: "icons/svg/hazard.svg",
    statuses:["alerted"],
    description: "Зомби перешел в активный режим (Вас заметили)."
  },
  invisible: {
    id: "invisible",
    label: "Невидимость",
    name: "Невидимость",
    img: "icons/svg/eye.svg",
    statuses: ["invisible"],
    description: "Персонаж скрыт от глаз (Token Hidden)."
  }
};

// === ИСПРАВЛЕНИЕ ЗДЕСЬ: ЗАМЕНИЛ label на name ===
export const INFECTION_STAGES = {
  1: {
    id: "infection-stage-1",
    name: "Инфекция (Инкубация)", // БЫЛО label
    img: "icons/svg/biohazard.svg",
    changes: [],
    description: "Вирус в крови. Симптомов пока нет.",
  },
  2: {
    id: "infection-stage-2",
    name: "Инфекция (Симптомы)", // БЫЛО label
    img: "icons/svg/poison.svg",
    changes: [
      { key: "system.attributes.str.value", mode: 2, value: -1 },
      { key: "system.attributes.agi.value", mode: 2, value: -1 },
      { key: "system.attributes.vig.value", mode: 2, value: -1 },
    ],
    description: "Жар, тошнота. -1 ко всем физ. статам.",
  },
  3: {
    id: "infection-stage-3",
    name: "Инфекция (Кризис)", // БЫЛО label
    img: "icons/svg/skull.svg",
    changes: [
      { key: "system.attributes.str.value", mode: 2, value: -3 },
      { key: "system.attributes.agi.value", mode: 2, value: -3 },
      { key: "system.attributes.vig.value", mode: 2, value: -3 },
      { key: "system.resources.ap.max", mode: 2, value: -3 },
    ],
    description: "Организм отказывает. Смерть близка.",
  },
};

export const PANIC_STAGES = {
  anxious: {
    id: "panic-anxious",
    name: "Тревога (Anxious)",
    img: "icons/svg/hazard.svg",
    statuses: ["panic-anxious"],
    changes: [], // Эффекты: +5 Уклонение (в prepareDerivedData), +1 AP к действиям (в _executeAttack)
    description: "Персонаж на взводе. +5 Уклонение, +1 AP к атакам."
  },
  panicked: {
    id: "panic-panicked",
    name: "Страх (Panicked)",
    img: "icons/svg/terror.svg",
    statuses: ["panic-panicked"],
    changes: [
      { key: "system.skills.ranged.mod", mode: 2, value: -10 },
      { key: "system.skills.melee.mod", mode: 2, value: -10 }
    ], // +10 Уклонение (в prepareDerivedData), +2 AP к действиям (в _executeAttack)
    description: "Сильный страх. -10% точности, +10 Уклонение, +2 AP к атакам."
  },
  breaking: {
    id: "panic-breaking",
    name: "Срыв (Breaking Point)",
    img: "icons/svg/skull.svg",
    statuses: ["panic-breaking"],
    changes: [
        { key: "system.resources.ap.max", mode: 5, value: 0 }
    ],
    description: "Персонаж впал в ступор или истерику. Теряет ход."
  }
};

export const AMMO_CALIBRES = {
    "none": "Нет / Не требуется",
    "9mm": "9mm Parabellum",
    "45acp": ".45 ACP",
    "556": "5.56x45mm NATO",
    "762": "7.62x39mm Soviet",
    "12g": "12 Gauge (Дробь)",
    "22lr": ".22 Long Rifle",
    "bolt": "Болт / Стрела",
    "other": "-- Другой (Вписать свой) --"
};
