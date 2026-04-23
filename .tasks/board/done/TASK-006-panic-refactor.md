---
id: TASK-006
title: Рефакторинг паники
status: backlog
priority: medium
created: 2026-03-23
---

## Описание
Переработать систему паники. Сейчас `rollPanicTable` использует старую таблицу 1d6.
Нужно заменить на стакающиеся стадии через `_applyPanicStage`.

## Проблемы
- `rollPanicTable` в dice.js всё ещё бросает 1d6 и навешивает случайный эффект (старая таблица)
- Стадии в `constants.js` имеют неверные модификаторы:
  - Тревога (anxious): нужно +5 Уклонение, +1 AP к любым действиям (не шаги)
  - Страх (panicked): нужно -10% точности, +10 Уклонение, +2 AP к действиям
  - Срыв (breaking): AP = 0 — ✅ верно
- `actor.js` вызывает `Dice.rollPanicTable` вместо `checkPanic/applyPanicStage`

## Критерии готовности
- [ ] Удалить/отключить `rollPanicTable` (старая таблица 1d6)
- [ ] Обновить constants.js: anxious — +5 evasion, +1 AP cost; panicked — -10% acc, +10 evasion, +2 AP cost
- [ ] `onTurnStart` не должен вызывать старый `rollPanicTable`
- [ ] Стадии корректно стакаются: anxious → panicked → breaking

## Технические заметки
- Файлы: `src/module/dice.js` (rollPanicTable), `src/module/constants.js` (PANIC_STAGES), `src/module/actor.js` (onTurnStart)
- Модификаторы уклонения работают через `changes` в эффекте
- +1/+2 AP к действиям — нужно проверять в `_executeAttack` в dice.js
