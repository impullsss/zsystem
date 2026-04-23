# TASK-023 — Fallout-подобная модель попадания (Skill% > 100)

**Статус:** backlog  
**Приоритет:** high  
**Размер:** L  

## Цель

Перейти от текущей схемы броска к "Fallout-подобной" модели, где навык может быть >100, а попадание считается как **Skill − AutoDifficulty → Chance% → 1d100**.

## Основная формула

- `effectiveSkill = skill + perks + buffs - debuffs`
- `autoDifficulty = range + cover + calledShot + visibility + interference + targetEvasion + attackerStatus`
- `chance = clamp(effectiveSkill - autoDifficulty, minChance, maxChance)`
- бросок `1d100`, успех если `roll <= chance`

Рекомендуемые дефолты:
- `minChance = 5`
- `maxChance = 95`

## Требования

- Навыки должны поддерживать значения **0–200+** без поломки UI/логики
- **Характеристики не участвуют** в точности попадания (только вторичные эффекты: AP/урон/переноска/обнаружение и т.п.)
- Сохранить логику модификаторов (дальность, укрытие, помехи, уклонение, травмы, паника), но перевести её в `autoDifficulty`
- Чат/tooltip должны показывать: `chance`, основные составляющие `autoDifficulty`, и итоговый `roll`

## Результат

- Один центральный расчёт `calcChanceBreakdown(attacker, target, weapon, context)` возвращает:
  - `effectiveSkill`, `autoDifficulty` (с деталями), `chance`, `min/max`
- Весь HUD прицеливания и атаки используют **только** этот расчёт

## Проверка

- Для одинакового контекста шанс совпадает между HUD, чатом и реальным броском
- При увеличении навыка >100 шанс не "ломается" (кап 95), но становится проще пробивать сложные условия

