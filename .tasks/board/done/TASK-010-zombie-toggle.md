---
id: TASK-010
title: Переключатель рандомизации HP зомби
status: backlog
priority: low
created: 2026-03-23
---

## Описание
Рандомизация характеристик зомби при спавне уже реализована.
Добавить настройку ГМа которая позволяет её включать/выключать.

## Критерии готовности
- [ ] Настройка в `game.settings.register`: `"zsystem", "randomizeZombieStats"`, boolean, default: true
- [ ] В `_onCreate` проверять флаг перед рандомизацией
- [ ] Настройка отображается в меню настроек системы (scope: "world")

## Технические заметки
- Файл: `src/main.js` (регистрация настройки), `src/module/actor.js` (_onCreate)
- `game.settings.get("zsystem", "randomizeZombieStats")` в начале блока `if (this.type === "zombie")`
