# TASK-031 - Combat Outcomes, Crit Fails, and Trauma Simulation

## Status

Backlog / partially implemented

## Why

The combat model now uses the unified low-good d100 standard. Before adding harsh crit-fail or trauma mechanics, we need to understand how often those outcomes occur and how much pressure they create during a fight.

## Scope

- Track crit success and crit fail pressure in `npm run sim:balance`.
- Estimate future mechanics without applying them in Foundry yet.
- Keep ordinary fail as a plain miss.
- Keep current crit success damage multiplier from `system.critMult`.
- Document candidate crit-fail and trauma mechanics before enabling them.

## Proposed Metrics

- attacks per scenario
- hit rate
- crit success rate
- crit fail rate
- average crit successes per downed target
- average crit fails per downed target
- projected jam count per 100 attacks
- projected durability loss per 100 attacks

## Implemented

- `npm run sim:balance` now prints outcome pressure lines for each scenario.
- The simulator now respects weapon `system.critMult` when estimating crit-success damage.
- Crit-fail projection profiles now live in `src/module/combat-fumble.js`.
- The simulator now prints projected effects by weapon profile: ranged, melee, or throwing.
- Crit-fail attack chat cards now show possible future consequences by weapon profile, but do not apply them.
- Weapons now have `system.jammed`; attacks with jammed weapons are blocked.
- Ranged crit-fail attack chat cards now include a manual GM button for `Заклинить оружие`.
- Crit-fail attack chat cards now include a manual GM button for `Износ оружия -1`.
- Ranged crit-fail attack chat cards now include a manual GM button for `Лишний шум +N`.
- Melee/throwing crit-fail attack chat cards now include a manual GM button for `Сбить атакующего с ног` when the profile has off-balance.
- Future jam/durability numbers are projections only; Foundry combat does not apply those penalties yet.
- Melee crit-fail cards can now include a manual GM button to mark the weapon as dropped by unequipping it.
- Throwing crit-fail cards can now include manual GM buttons for bad scatter and lost item.
- Crit-success chat text now shows the actual weapon crit multiplier instead of hardcoded `x1.5`.

## Candidate Profiles

- Ranged: jam, durability loss, extra noise.
- Melee: off balance, durability loss, weapon drop.
- Throwing: bad scatter, item lost, off balance.

## Next Design Decision

Choose the first mechanic to actually enable, if any:

- safest: only extra noise on ranged crit fail
- medium: `50%` jam on ranged crit fail
- harsher: `-1` durability on every ranged crit fail
- current table-test option: manual `Износ оружия -1` button in the crit-fail chat card
- current table-test option: manual `Заклинить оружие` button in the ranged crit-fail chat card
- current table-test option: manual `Лишний шум +N` button in the ranged crit-fail chat card
- current table-test option: manual `Сбить атакующего с ног` button for melee/throwing crit-fail cards
- current table-test option: manual `weapon drop` button for melee crit-fail cards
- current table-test option: manual `bad scatter` and `item lost` buttons for throwing crit-fail cards
- separate later pass: trauma

## Manual Foundry Checks Later

- Crit success still applies weapon crit multiplier.
- Ordinary fail remains just a miss.
- Crit fail chat note appears but does not yet jam, drop, break, or damage anything.
- Forced d100 debug buttons can quickly test `1`, `5`, `6`, `95`, `96`, `100`.
- Attack chat remains readable after outcome notes.

## Implemented After First Foundry Pass

- Crit-fail effects now roll concrete triggered consequences, and chat buttons appear only for effects that triggered.
- Added `src/module/trauma.js` as a pure trauma pressure model.
- Attack chat now shows a manual GM trauma block when damage pressure is high enough.
- Trauma buttons can apply injury, bleeding, dizzy, or prone to the specific damaged actor.
- Trauma is still GM-controlled and does not auto-apply harsh effects.
- Trauma now has world settings: off, report-only, or report + manual GM buttons.
- Trauma severity can be softened or hardened with a world multiplier.
- `npm run sim:balance` now prints trauma pressure per 100 attacks: light, serious, critical, bleeding, injury, dizzy, and prone.
- Serious torso trauma no longer spams prone by default; prone is reserved for critical torso trauma or serious/critical leg trauma.
- Added `npm run sim:trauma` for focused trauma scenarios and severity multiplier comparison.
- Attack chat details are now grouped into readable sections: check, resources, and modifiers.

## Trauma Manual Checks Later

- Serious torso ballistic wounds can suggest bleeding and prone.
- Critical head wounds can suggest injury, bleeding, and dizzy.
- Light trauma should be descriptive and should not spam mechanical buttons.
- Trauma buttons should only work for GM.
- Trauma mode `off` should hide trauma chat blocks.
- Trauma mode `report` should show trauma text without GM buttons.
- Trauma mode `manual` should show GM buttons only for concrete mechanical consequences.
- Trauma severity multiplier below 1 should reduce trauma frequency/severity; above 1 should increase it.
- Attack chat should remain readable after the new grouped check/resources/modifiers sections.
- `npm run sim:trauma -- 1000` should print trauma severity/effect rates for torso, head, limb, melee, and crit scenarios.

## Change Log

- 2026-05-04: Added concrete crit-fail consequence rolls.
- 2026-05-04: Added manual trauma model, chat block, GM trauma buttons, and automated tests.
- 2026-05-05: Added trauma mode/severity settings and trauma metrics to the balance simulator.
- 2026-05-05: Added manual GM buttons for melee weapon drop, throwing scatter, and throwing item loss.
- 2026-05-05: Added focused trauma simulator and grouped attack-chat details.
- 2026-05-05: Expanded trauma records with treatment DC/time/resource notes and location-specific long-term risk text.
- 2026-05-05: Critical head trauma can now suggest a manual blind-risk effect in addition to injury/bleeding/dizzy.
- 2026-05-05: Expanded ranged crit-fail profile with misfire, magazine-drop note, weapon drop, breakage, and friendly-fire risk.

## Next Trauma Pass

- Add an interactive limb/status treatment UI:
  - show trauma/injury details from the actor sheet;
  - choose healer;
  - roll Medicine vs trauma DC;
  - spend medicine/splints/parts;
  - reduce or remove injury effects on success.
- Decide whether light trauma should create a tracked temporary condition or stay descriptive only.
- Decide whether blind-risk should be a rare manual GM button or a table result with duration/severity.
