export const INJURY_EFFECTS = {
  head: {
    id: "injury-head",
    name: "Травма Головы (Контузия)",
    img: "icons/svg/daze.svg",
    statuses: ["injury-head"],
    isPhysical: true,
    changes: [
      { key: "system.attributes.per.value", mode: 2, value: -2 },
      { key: "system.attributes.int.value", mode: 2, value: -2 },
    ],
    description: "Контузия. Снижено Восприятие и Интеллект.",
  },
  torso: {
    id: "injury-torso",
    name: "Травма Торса (Сбито дыхание)",
    img: "icons/svg/blood.svg",
    statuses: ["injury-torso"],
    isPhysical: true,
    changes: [{ key: "system.resources.ap.effect", mode: 2, value: -2 }],
    description: "Сбито дыхание. Штраф -2 ОД.",
  },
  arm: {
    id: "injury-arm",
    name: "Сломана Рука",
    img: "icons/svg/paralysis.svg",
    statuses: ["injury-arm"],
    isPhysical: true,
    changes: [
      { key: "system.attributes.str.value", mode: 2, value: -1 },
      { key: "system.attributes.agi.value", mode: 2, value: -1 },
    ],
    description: "Больно держать оружие. Штраф Силы и Ловкости.",
  },
  leg: {
    id: "injury-leg",
    name: "Сломана Нога",
    img: "icons/svg/falling.svg",
    statuses: ["injury-leg"],
    isPhysical: true,
    changes: [
      { key: "system.secondary.evasion.value", mode: 2, value: -10 },
      { key: "system.resources.ap.effect", mode: 2, value: -1 },
    ],
    description: "Хромота. Штраф скорости и уклонения.",
  },
  unconscious: {
    id: "status-unconscious",
    name: "Без сознания (KO)",
    img: "icons/svg/unconscious.svg",
    statuses: ["status-unconscious"],
    isPhysical: true,
    changes: [{ key: "system.resources.ap.value", mode: 5, value: 0 }],
    description: "Персонаж выведен из строя. ХП = 0.",
  },
};

export const GLOBAL_STATUSES = {
  bleeding: {
    id: "bleeding",
    label: "Кровотечение",
    name: "Кровотечение",
    icon: "icons/svg/blood.svg",
    statuses: ["bleeding"],
    isPhysical: true,
    description: "Теряет 1-5 HP каждый ход.",
  },
  prone: {
    id: "prone",
    label: "Сбит с ног",
    name: "Сбит с ног",
    icon: "icons/svg/falling.svg",
    statuses: ["prone"],
    isPhysical: true,
    changes: [
      { key: "system.attributes.agi.value", mode: 5, value: 1 },
      { key: "system.secondary.evasion.value", mode: 5, value: 0 },
    ],
    description: "Уязвим. Встать стоит 50% AP.",
  },
  dizzy: {
    id: "dizzy",
    label: "Головокружение",
    name: "Головокружение",
    icon: "icons/svg/daze.svg",
    statuses: ["dizzy"],
    isPhysical: true,
    description: "-50% Точности на 3 хода.",
  },
  blind: {
    id: "blind",
    label: "Слепота",
    name: "Слепота",
    icon: "icons/svg/blind.svg",
    statuses: ["blind"],
    isPhysical: true,
    changes: [
      { key: "system.attributes.agi.value", mode: 5, value: 1 },
      { key: "system.attributes.per.value", mode: 5, value: 1 },
    ],
    description: "AGI и PER снижены до 1.",
  },
  immolated: {
    id: "immolated",
    label: "Горение",
    name: "Горение",
    icon: "icons/svg/fire.svg",
    statuses: ["immolated"],
    description: "Наносит урон по всему телу каждый ход.",
  },
  poisoned: {
    id: "poisoned",
    label: "Отравление",
    name: "Отравление",
    icon: "icons/svg/poison.svg",
    statuses: ["poisoned"],
    isPhysical: true,
    description: "Урон 1d6 каждый ход.",
  },
  panic: {
    id: "panic",
    label: "Паника",
    name: "Паника",
    icon: "icons/svg/terror.svg",
    statuses: ["panic"],
    description: "Потеря контроля. См. таблицу Паники.",
  },
  infected: {
    id: "infected",
    label: "Инфекция",
    name: "Инфекция",
    icon: "icons/svg/biohazard.svg",
    statuses: ["infected"],
    isPhysical: true,
    description: "Скрытый статус. Смерть через 3 дня.",
  },
  wounded: {
    id: "wounded",
    label: "Ранен (Wounded)",
    name: "Ранен (Wounded)",
    icon: "icons/svg/degen.svg",
    statuses: ["wounded"],
    isPhysical: true,
    changes: [{ key: "system.resources.ap.max", mode: 2, value: -2 }],
    description: "После тяжелого ранения. -2 Макс АП. Лечится только отдыхом.",
  },
  fatigued: {
    id: "fatigued",
    label: "Утомление",
    name: "Утомление",
    icon: "icons/svg/downgrade.svg",
    statuses: ["fatigued"],
    changes: [{ key: "system.secondary.evasion.value", mode: 1, value: 0.75 }],
    description: "Усталость или голод. -25% Точности и Уклонения.",
  },
  overburdened: {
    id: "overburdened",
    label: "Перегруз",
    name: "Перегруз",
    icon: "icons/svg/downgrade.svg",
    statuses: ["overburdened"],
    description: "Вес превышен. -2 Макс AP, движение стоит дороже."
  },
  stealth: {
    id: "stealth",
    label: "Скрытность",
    name: "Скрытность",
    icon: "icons/svg/mystery-man.svg", // Ниндзя
    statuses: ["stealth"],
    description: "Тихое передвижение. Шум -50%. Крит +5%."
  },
  alerted: {
    id: "alerted",
    label: "Тревога",
    name: "Тревога",
    icon: "icons/svg/hazard.svg",
    statuses: ["alerted"],
    description: "Зомби услышал шум и перешел в активный режим."
  },
  invisible: {
    id: "invisible",
    label: "Невидимость",
    name: "Невидимость",
    icon: "icons/svg/eye.svg",
    statuses: ["invisible"],
    description: "Персонаж скрыт от глаз (Token Hidden)."
  }
};

// === ИСПРАВЛЕНИЕ ЗДЕСЬ: ЗАМЕНИЛ label на name ===
export const INFECTION_STAGES = {
  1: {
    id: "infection-stage-1",
    name: "Инфекция (Инкубация)", // БЫЛО label
    icon: "icons/svg/biohazard.svg",
    changes: [],
    description: "Вирус в крови. Симптомов пока нет.",
  },
  2: {
    id: "infection-stage-2",
    name: "Инфекция (Симптомы)", // БЫЛО label
    icon: "icons/svg/poison.svg",
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
    icon: "icons/svg/skull.svg",
    changes: [
      { key: "system.attributes.str.value", mode: 2, value: -3 },
      { key: "system.attributes.agi.value", mode: 2, value: -3 },
      { key: "system.attributes.vig.value", mode: 2, value: -3 },
      { key: "system.resources.ap.max", mode: 2, value: -3 },
    ],
    description: "Организм отказывает. Смерть близка.",
  },
};
