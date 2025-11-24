export const INJURY_EFFECTS = {
  head: {
    id: "injury-head",
    name: "Травма Головы (Контузия)",
    img: "icons/svg/daze.svg",
    changes: [
      { key: "system.attributes.per.value", mode: 2, value: -2 },
      { key: "system.attributes.int.value", mode: 2, value: -2 }
    ],
    description: "Голова повреждена. Снижено Восприятие и Интеллект."
  },
  torso: {
    id: "injury-torso",
    name: "Травма Торса (Сбито дыхание)",
    img: "icons/svg/blood.svg",
    changes: [
      // ИЗМЕНЕНО: Бьем по полю .effect
      { key: "system.resources.ap.effect", mode: 2, value: -2 } 
    ],
    description: "Тяжелое ранение в грудь. Тяжело дышать, снижены ОД."
  },
  arm: {
    id: "injury-arm",
    name: "Сломана Рука",
    img: "icons/svg/paralysis.svg",
    changes: [
      { key: "system.attributes.str.value", mode: 2, value: -1 }, // Str -1
      { key: "system.attributes.agi.value", mode: 2, value: -1 }  // Agi -1
    ],
    description: "Рука повреждена. Штраф к Силе и Ловкости."
  },
   leg: {
    id: "injury-leg",
    name: "Сломана Нога",
    img: "icons/svg/falling.svg",
    changes: [
      { key: "system.secondary.evasion.value", mode: 2, value: -10 },
      // ИЗМЕНЕНО: Бьем по полю .effect
      { key: "system.resources.ap.effect", mode: 2, value: -1 } 
    ],
    description: "Нога повреждена. Снижена скорость и уклонение."
  },
  unconscious: {
    id: "status-unconscious",
    name: "Без сознания",
    img: "icons/svg/unconscious.svg",
    changes: [], // Тут нужна логика блокировки хода, пока просто маркер
    description: "Персонаж выведен из строя."
  }
};