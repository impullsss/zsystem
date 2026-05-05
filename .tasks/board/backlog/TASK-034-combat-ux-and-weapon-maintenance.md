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
- Added floating damage numbers above active tokens when `actor.applyDamage()` deals HP damage.
- Added `actor.unjamWeapon(item)`:
  - requires a jammed weapon;
  - costs 2 AP;
  - clears `system.jammed`;
  - posts a chat note.
- Added an inventory-row `Разклинить оружие (2 AP)` button for jammed weapons.
- Expanded ranged critical-fail tables with reportable outcomes:
  - jam;
  - misfire;
  - durability loss;
  - extra noise;
  - magazine drop note;
  - weapon drop;
  - breakage;
  - friendly-fire risk note.

## Foundry Checks Later

- Damage a selected actor, press Full Heal once, and confirm HP, AP, limb HP, limb penalties, and injury effects are fully reset.
- Select multiple damaged tokens, run `scripts/foundry-full-heal-selected.js` as a Script Macro, and confirm all selected actors are healed.
- Confirm full heal still does not break zombies, NPCs, survivors, or actors without limb data.
- Damage a visible token and confirm a red floating damage number appears above it and fades out.
- Jam a weapon, open the actor inventory, press `Разклинить`, and confirm:
  - 2 AP are spent;
  - `Заклинило?` clears;
  - chat receives a short action note.
- Force ranged crit fails and confirm only triggered consequence buttons appear; non-actionable notes like misfire/magazine/friendly-fire risk should be readable but not delete the weapon.

## Next Mechanics

- Decide where unjam button should live:
  - weapon sheet;
  - left HUD reload/action panel;
  - all of the above later.
- Add proper magazine item support before making `magazine drop` spend/delete a real magazine.
