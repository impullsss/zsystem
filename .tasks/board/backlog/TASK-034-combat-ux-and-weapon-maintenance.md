# TASK-034 - Combat UX and Weapon Maintenance

## Goal

Add small but high-impact combat quality-of-life tools that make the system feel responsive at the table.

## Requested

- Show floating damage numbers above a token when it receives damage.
- Add a macro that fully heals all selected tokens.
- Make actor-sheet `Full Heal` reliable after derived max HP/AP/limb values recalculate.
- Add a convenient unjam action for weapons, likely costing 2 AP.

## Implemented

- Added `scripts/foundry-full-heal-selected.js` macro for selected tokens.
- Made `actor.fullHeal()` two-phase:
  - remove effects and penalties first;
  - then restore HP/AP/limbs to recalculated max values.

## Foundry Checks Later

- Damage a selected actor, press Full Heal once, and confirm HP, AP, limb HP, limb penalties, and injury effects are fully reset.
- Select multiple damaged tokens, run `scripts/foundry-full-heal-selected.js` as a Script Macro, and confirm all selected actors are healed.
- Confirm full heal still does not break zombies, NPCs, survivors, or actors without limb data.

## Next Mechanics

- Add floating damage numbers above damaged tokens.
- Add weapon unjam action:
  - blocked unless weapon is jammed;
  - costs 2 AP by default;
  - clears `system.jammed`;
  - reports action in chat.
- Decide where unjam button should live:
  - weapon sheet;
  - actor inventory row;
  - left HUD reload/action panel;
  - all of the above later.
