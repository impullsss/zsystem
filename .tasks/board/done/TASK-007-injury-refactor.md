---
id: TASK-007
title: Рефакторинг травм конечностей
status: backlog
priority: high
created: 2026-03-23
---

## Что уже реализовано ✅
- Торс: AGI/VIG -1/3 ✅
- Голова: INT/PER -50% ✅
- Голова: -15 к Науке/Механике/Медицине ✅
- Нога: -10 уклонение ✅
- Нога: +1 AP за шаг (каждая нога отдельно) ✅

## Что не реализовано ❌

### Торс — движение наносит 2d4 урона
- [ ] В `preUpdateToken` (main.js, ~строка 618) при шаге с `injury-torso` бросать 2d4 и применять как `true` урон по торсу

### Голова — бросок AP на начало хода
- [ ] В `onTurnStart` добавить: бросок `1d10` vs ЖИВ (viginity). При провале — срезать текущие AP вдвое
- [ ] Сообщение в чат: "Голова кружится! AP срезан пополам."

### Рука — +1 AP к атакам
- [ ] В `_executeAttack` (dice.js): если `actor.hasStatusEffect("injury-arm")` → baseApCost += 1
- [ ] Применять только к атакам, не к движению

## Технические заметки
- Торс 2d4: `await this.applyDamage(roll.total, "true", "torso")` — добавить в шаговый хук
- Голова AP: читаем `this.system.resources.ap.value`, делим пополам через `update`
- Рука AP: в `_executeAttack` проверять `injury-arm` у actor
