# TASK-016 — Рефакторинг: вынести StealthDetectionManager в stealth.js

**Статус:** backlog
**Приоритет:** high
**Размер:** S (1–2 часа)

## Цель

Вынести класс `StealthDetectionManager` и все связанные с ним хуки из `main.js` в отдельный файл `src/module/stealth.js`.

## Что переносится

Из `main.js`:
- Класс `StealthDetectionManager` (~строки 968–1191)
- Хуки стелса (~строки 1192–1243):
  - `canvasReady` → вызов `refresh()`
  - `updateToken` → вызов `onStep()` + `updateStepDisplay()`
  - `combatTurn` → `resetSteps()`
  - `createActiveEffect` / `deleteActiveEffect` → `initActor()` / `clearActor()`
  - `controlToken` → `updateStepDisplay()`

## Результат

- `src/module/stealth.js` — новый файл с классом и инициализацией хуков
- `main.js` теряет ~280 строк
- В `main.js` добавляется импорт: `import { StealthDetectionManager } from "./module/stealth.js";`
- Публичный API класса не меняется

## Проверка

- Стелс включается/выключается через HUD
- Счётчик шагов появляется над токеном
- Кольца зомби рисуются и следуют за ними
- Бросок при входе в кольцо происходит
- При провале: снимается эффект, появляется "ОБНАРУЖЕН!", пауза
