export const INJURY_EFFECTS = {
  head: {
    id: "injury-head",
    name: "Травма Головы",
    img: "icons/svg/daze.svg",
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
    changes: [
      { key: "system.resources.ap.effect", mode: 2, value: -2 } 
    ],
    description: "Сбито дыхание. Штраф к ОД."
  },
  arm: {
    id: "injury-arm",
    name: "Сломана Рука",
    img: "icons/svg/paralysis.svg",
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
    changes: [
      { key: "system.secondary.evasion.value", mode: 2, value: -10 },
      { key: "system.resources.ap.effect", mode: 2, value: -1 } 
    ],
    description: "Хромота. Штраф скорости и уклонения."
  },
  unconscious: {
    id: "status-unconscious",
    name: "Без сознания",
    img: "icons/svg/unconscious.svg",
    changes: [], 
    description: "Персонаж выведен из строя."
  }
};

export const GLOBAL_STATUSES = {
  bleeding: {
    id: "bleeding",
    label: "Кровотечение", 
    name: "Кровотечение",  
    icon: "icons/svg/blood.svg",
  },
  prone: {
    id: "prone",
    label: "Сбит с ног",
    name: "Сбит с ног",
    icon: "icons/svg/falling.svg",
    changes: [
      { key: "system.attributes.agi.value", mode: 5, value: 1 }, 
      { key: "system.secondary.evasion.value", mode: 5, value: 0 } 
    ]
  },
  panic: {
    id: "panic",
    label: "Паника",
    name: "Паника",
    icon: "icons/svg/terror.svg",
    changes: [
        { key: "system.attributes.per.value", mode: 2, value: -2 }, 
        { key: "system.resources.ap.effect", mode: 2, value: -2 } 
    ]
  }
};