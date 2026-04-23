# TASK-017 — Рефакторинг: вынести ZSystemActions и GM-обработчик из main.js

**Статус:** backlog
**Приоритет:** medium
**Размер:** M (2–3 часа)
**Зависит от:** TASK-016 (делать после)

## Цель

Разбить оставшийся main.js на логические модули.

## Что переносится

### → `src/module/gm-handler.js`
- Весь обработчик `createChatMessage` (GM-логика):
  - Перенос предметов (`transferItem`)
  - Лечение (`heal`)
  - Шум и агро (`noiseAdd`)
  - Урон и эффекты (`damageData`)
  - Прогресс времени (`advanceTime`)
  - Удаление предметов (`deleteItemUuid`)
  - GM-сообщения (`gmInfo`)
- Обработчик `getChatMessageContextOptions` (кнопка "Отменить урон")

### → `src/module/actions.js`
- Класс `ZSystemActions` (`interact`, `manualSearch`, `_visualizeSearchRadius`)
- Хуки: `getSceneControlButtons`, `hotbarDrop`, `createItemMacro`

## Результат

- `main.js` остаётся только как точка входа: импорты + `init` + `ready` хуки регистрации
- Финальный размер main.js: ~250–300 строк

## Проверка

- Перенос предметов между акторами работает
- Кнопка "Отменить урон" в чате работает
- Кнопка "Взаимодействовать" на панели сцены работает
- Урон применяется через чат-сообщения
