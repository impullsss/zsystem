---
id: FIX-001
title: Noise HUD — перетаскивание, кнопки и ввод
status: open
created: 2026-03-23
---

## Проблемы
- Окно не перетаскивается (jQuery UI draggable недоступен в FoundryVTT v13)
- +/- кнопки не меняют значение шума
- Ручной ввод сохраняется но визуально не закрепляется

## Решение
- Ручной drag через mousedown/mousemove/mouseup
- Пофиксить event handler кнопок
- Обновлять input только если он не в фокусе
