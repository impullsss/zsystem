# TASK-027 — Баланс: TTK и “приятность попаданий” через симуляцию

**Статус:** backlog  
**Приоритет:** medium  
**Размер:** M  
**Зависит от:** TASK-023, TASK-024, TASK-026 (частично)  

## Цель

Не подбирать числа “на глаз”, а быстро проверять баланс:
- средний шанс попадания в типичных условиях
- среднее число попаданий/раундов до вывода из строя (TTK)
- влияние укрытия/дальности/прицеливания/DR

## Идея

Сделать небольшой автономный скрипт (без Foundry), который:
- генерирует N боёв "стрелок vs цель" с заданными параметрами
- считает распределение: hit-rate, crit-rate, average damage/round, rounds-to-down

## Параметры сценариев (минимум)

- skill атакующего (например: 40, 70, 100, 140)
- дистанция (близко/средне/далеко)
- укрытие (0/половина/полное)
- called shot (torso/limb/head)
- DR/броня цели
- профиль выживаемости (если внедрён)

## Результат

- Чёткие целевые ориентиры (например):
  - “обычный бой”: 55–75% попаданий
  - “хедшот без прицела”: 20–45%
  - TTK против среднего врага: 3–6 удачных попаданий (настройка под жанр/профиль)
- После тюнинга констант видно, что изменилось (до/после)

## Проверка

- Скрипт запускается одной командой (node)
- Выдаёт сводку по сценариям (без таблиц в чате Foundry)

## Change Log

- 2026-04-27: Updated balance simulation to use the migrated combat skill-vs-DC roll result and added extra scenarios for intervening-token interference plus dizzy/blind penalties.
- 2026-04-26: after TASK-024 table tuning, simulator shows ordinary medium-range light-cover ranged combat at about 25% hit rate and headshot-with-aim around 5%; this likely needs later balance review before combat migration to the skill-vs-difficulty model
