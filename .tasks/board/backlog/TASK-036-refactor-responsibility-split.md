# TASK-036 - Responsibility Split Refactor

## Goal

Keep development fast by separating mechanics, Foundry hooks, UI rendering, and configuration into smaller modules.

## Current Refactor Direction

- `main.js` should stay mostly a bootstrap file:
  - register document classes;
  - register sheets;
  - initialize managers/hooks.
- Pure rules should stay testable without Foundry where possible.
- Chat/card HTML should live separately from math.
- Token hooks should live near the subsystem they control.
- Large actor/sheet files should be split gradually, only behind existing tests or very small behavior-preserving moves.

## Implemented In This Pass

- Moved Handlebars helper registration into `src/module/handlebars-helpers.js`.
- Moved travel chat/card rendering into `src/module/travel-chat.js`.
- Kept travel math in `src/module/travel-rules.js`.
- Moved global-map Scene Config UI hook into `src/module/travel-scene-config.js`.
- Moved tactical/global token movement hook into `src/module/token-movement.js`.
- `main.js` now initializes these modules instead of owning their internals.

## Checks

- `npm test`
- `npm run build`

## Next Refactor Candidates

- Split `dice.js` into roll model, attack dialog, chat rendering, and Foundry action glue.
- Split `actor.js` into derived stats, inventory/equipment operations, rest/heal, and status helpers.
- Split `actor-sheet.js` into tab-specific handlers.
- Split system settings registration from `main.js` once the current setting list stabilizes.
- Add tests around tactical movement AP before deeper movement refactors.
