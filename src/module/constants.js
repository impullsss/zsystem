
export const INJURY_EFFECTS = {
  head: {
    id: "injury-head",
    name: "Травма Головы",
    img: "icons/svg/daze.svg",
    statuses: ["injury-head"], // ВАЖНО для иконки
    changes: [
      { key: "system.attributes.per.value", mode: 2, value: -2 },
      { key: "system.attributes.int.value", mode: 2, value: -2 }
    ],
    description: "Контузия. Снижено Восприятие и Интеллект."
  },
  torso: {
    id: "injury-torso",
    name: "Травма Торса",
    img: "icons/svg/blood.svg",
    statuses: ["injury-torso"],
    changes: [
      { key: "system.resources.ap.effect", mode: 2, value: -2 } 
    ],
    description: "Сбито дыхание. Штраф к ОД."
  },
  arm: {
    id: "injury-arm",
    name: "Сломана Рука",
    img: "icons/svg/paralysis.svg",
    statuses: ["injury-arm"],
    changes: [
      { key: "system.attributes.str.value", mode: 2, value: -1 }, 
      { key: "system.attributes.agi.value", mode: 2, value: -1 } 
    ],
    description: "Больно держать оружие. Штраф Силы/Ловкости."
  },
   leg: {
    id: "injury-leg",
    name: "Сломана Нога",
    img: "icons/svg/falling.svg",
    statuses: ["injury-leg"],
    changes: [
      { key: "system.secondary.evasion.value", mode: 2, value: -10 },
      { key: "system.resources.ap.effect", mode: 2, value: -1 } 
    ],
    description: "Хромота. Штраф скорости и уклонения."
  },
  unconscious: {
    id: "status-unconscious",
    name: "Без сознания (KO)",
    img: "icons/svg/unconscious.svg",
    statuses: ["status-unconscious"],
    changes: [
        { key: "system.resources.ap.value", mode: 5, value: 0 } 
    ], 
    description: "Персонаж выведен из строя. ХП = 0."
  }
};

export const GLOBAL_STATUSES = {
  bleeding: {
    id: "bleeding",
    label: "Кровотечение", 
    name: "Кровотечение",  
    icon: "icons/svg/blood.svg",
    statuses: ["bleeding"], // ВАЖНО для иконки
    description: "Теряет 1-5 HP каждый ход."
  },
  prone: {
    id: "prone",
    label: "Сбит с ног",
    name: "Сбит с ног",
    icon: "icons/svg/falling.svg",
    statuses: ["prone"],
    changes: [
      { key: "system.attributes.agi.value", mode: 5, value: 1 }, 
      { key: "system.secondary.evasion.value", mode: 5, value: 0 } 
    ],
    description: "Уязвим. Встать стоит 50% AP."
  },
  dizzy: {
      id: "dizzy",
      label: "Головокружение",
      name: "Головокружение",
      icon: "icons/svg/daze.svg",
      statuses: ["dizzy"],
      description: "-50% Точности на 3 хода."
  },
  blind: {
      id: "blind",
      label: "Слепота",
      name: "Слепота",
      icon: "icons/svg/blind.svg",
      statuses: ["blind"],
      changes: [
          { key: "system.attributes.agi.value", mode: 5, value: 1 },
          { key: "system.attributes.per.value", mode: 5, value: 1 }
      ],
      description: "AGI и PER снижены до 1."
  },
  immolated: {
      id: "immolated",
      label: "Горение",
      name: "Горение",
      icon: "icons/svg/fire.svg",
      statuses: ["immolated"],
      description: "Получает урон огнем каждый ход."
  },
  poisoned: {
      id: "poisoned",
      label: "Отравление",
      name: "Отравление",
      icon: "icons/svg/poison.svg",
      statuses: ["poisoned"],
      description: "Урон со временем."
  },
  panic: {
    id: "panic",
    label: "Паника",
    name: "Паника",
    icon: "icons/svg/terror.svg",
    statuses: ["panic"],
    description: "Потеря контроля. См. таблицу Паники."
  },
  infected: {
      id: "infected",
      label: "Инфекция",
      name: "Инфекция",
      icon: "icons/svg/biohazard.svg",
      statuses: ["infected"],
      description: "Смерть через 3 дня без антибиотиков."
  }
};