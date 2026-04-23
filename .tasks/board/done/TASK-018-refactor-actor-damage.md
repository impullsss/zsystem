# TASK-018 — Рефакторинг: вынести логику урона из actor.js

**Статус:** backlog
**Приоритет:** medium
**Размер:** M (2–3 часа)

## Цель

Вынести логику урона и паники из `actor.js` в `src/module/actor-damage.js` в виде функций-хелперов.

## Что переносится

Из `ZActor`:
- `applyDamage(amount, type, limb, headshot, ignoreAC)` (~строки 789–929)
- `_applyBleeding(limb)` (~строки 930–946)
- `checkPanic(damageAmount)` (~строки 947–985)
- `_applyPanicStage(stage, rollResult, target)` (~строки 986–1019)

## Подход

Функции получают `actor` первым аргументом:
```js
// actor-damage.js
export async function applyDamage(actor, amount, type, limb, headshot, ignoreAC) { ... }
```

В `ZActor` методы становятся тонкой обёрткой:
```js
async applyDamage(...args) { return applyDamage(this, ...args); }
```

## Результат

- `actor.js` теряет ~230 строк
- Логику урона можно тестировать изолированно
- Публичный API актора (`actor.applyDamage(...)`) не меняется

## Проверка

- Урон применяется через атаку
- DR учитывается по типу урона
- Хедшот: ×2 урона
- Паника: стадии нарастают при большом уроне
- Кровотечение накладывается на конечности
