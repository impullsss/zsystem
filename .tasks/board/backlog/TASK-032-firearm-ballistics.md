# TASK-032 - Firearm Ballistics Layer

## Status

Backlog / prototype implemented

## Why

The combat system is moving toward more realistic firearms: stray hits, overpenetration, burst fire hitting multiple bodies in a cone, and burst interruption on jam.

This should be developed as a separate calculation layer first, then integrated into Foundry attacks only after the math feels good.

## Implemented Prototype

- Added pure module `src/module/firearm-ballistics.js`.
- Added `npm run sim:firearms` for standalone firearm simulations.
- Added weapon data fields for future tuning: `system.ballisticPower`, `system.armorPiercing`, `system.lineWidth`, and `system.burstConeAngle`.
- Added aiming preview helpers that can show line-risk tokens, overpenetration candidates, burst cone candidates, and burst jam warning.
- Aiming HUD now shows a non-destructive `Баллистика` preview for ranged weapons.
- Attack chat now shows a non-destructive ballistic report after ranged attacks.
- Ballistic chat entries include GM-only manual damage buttons for stray hits, overpenetration, and burst-cone hits.
- Manual ballistic damage can now produce the same trauma report/manual consequence block as primary attack damage.
- Added world setting `firearmBallisticsPreview` to enable/disable aiming HUD ballistic preview.
- Added world setting `firearmBallisticsChatMode`: `off`, `report`, or `manual`.
- Added ammo ballistic presets and loaded-ammo storage during reload.
- Ammo can now modify firearm damage, ballistic power, armor piercing, line width, burst cone angle, noise, and future jam chance.
- Shotgun ammo now separates `Пуля` (`slug`) from `Дробь` (`shot`): slug is narrower and stronger, shot is wider and better for cone risk.
- Firearm aiming preview, ballistic chat, and firearm simulator now read the loaded ammo profile.
- Critical-fail consequences are now rolled as concrete effects instead of showing every possible consequence.
- Homemade ammo can raise ranged jam chance through the ammo jam modifier.
- `npm run sim:firearms` now reports expected crit-fail consequences per 100 attacks.
- Added `npm run sim:ammo` for comparing ammo presets against armor tiers.
- Reload now lets the player choose between multiple compatible ammo stacks of the same calibre.
- Weapon sheets now show a readable summary of the currently loaded ammo.
- Interrupted burst crit fails refund unfired bullets back into the magazine and chat shows actual spent bullets.
- Burst fire now resolves each fired bullet separately instead of using one all-or-nothing damage packet.
- Burst primary hits are folded into the normal attack damage flow as per-bullet damage entries.
- Burst cone collateral is probabilistic; a missed primary bullet no longer guarantees that some token in the cone is hit.
- Failed burst shots can become line-of-fire stray hits, but only probabilistically.
- Ballistic numeric fields now accept comma decimals such as `0,5` and ammo modifiers such as `0,25`.
- Added automated tests for:
- fire-line bystander detection
- overpenetration
- ordinary miss stray hit
- burst cone target distribution
- per-bullet burst primary hits
- probabilistic burst cone / line-of-fire misses
- crit-fail burst interruption by jam
- weapon/attack profile derivation
- Foundry token preview conversion
- ballistic chat report/manual button context
- ballistic damage button metadata for follow-up trauma

## Current Model

- Single shot success hits the chosen target.
- If projectile power remains after armor/body resistance, it can overpenetrate into a target behind the primary target.
- Ordinary fail can become a stray hit if another token is close enough to the shot line and the miss is not too wild.
- Burst fire uses a cone and can distribute fired shots between targets inside it.
- Burst fire rolls target selection per fired bullet: some bullets can hit the primary target, some can miss, and some can hit line/cone collateral.
- Crit fail on burst can jam/interrupt the burst before all requested shots are fired.

## Future Foundry Integration Steps

- Convert Foundry tokens into simple ballistic points: `id`, `x`, `y`, `radius`, `armor`.
- Decide whether stray hits can affect allies by default or only when a setting is enabled.
- Add preview warnings in the aiming tooltip: line-risk targets and burst-cone targets.
- Initial preview warnings are implemented in the aiming HUD, but live attacks still do not apply extra ballistic impacts.
- Add chat card details for stray hits, overpenetration, burst hits, and jam-interrupted bursts.
- Initial chat card details are implemented. Manual buttons apply damage to the specific listed token.
- Manual ballistic damage now also checks trauma for the damaged actor, using the global trauma mode/severity settings.
- Automatic ballistic damage is intentionally not implemented yet. It needs a GM/socket execution path before it is safe for player-fired attacks.
- Decide how armor piercing should be stored: weapon field, ammo field, attack variant field, or all three.
- Weapon-level ballistic fields exist now; ammo-level modifiers are still a future design question.
- Ammo-level modifiers are now implemented as a first pass. Current presets: standard, armor-piercing, expansive, slug, shot, subsonic, homemade.
- Ammo preset comparison now reports direct damage, effective armor, exit power, overpenetration, noise, and jam chance on fumble.
- Decide whether overpenetration applies full damage, reduced damage, or a separate exit-wound formula.

## Manual Foundry Checks Later

- Single shot still works exactly as before while the prototype is not connected to live attacks.
- After integration, a token standing between shooter and target can be listed as line-risk.
- After integration, a target behind the primary target can be hit only if power/armor piercing is high enough.
- After integration, burst fire shows targets inside the cone before rolling.
- After integration, burst crit fail can interrupt the burst and does not always spend all requested bullets.
- After integration, friendly-fire/stray-hit behavior is understandable and not surprising to players.
- Reload a firearm with different ammo presets and verify the aiming tooltip/chat report changes: AP ammo should pierce better, shot should widen risk areas, subsonic should reduce noise.
- `npm run sim:ammo` should show AP ammo piercing better, expansive doing more damage to soft targets, slug punching harder/narrower than shot, shot widening risk stats, subsonic lowering noise, and homemade increasing jam chance.
- Verify ammo damage bonus applies to the primary hit damage card after reload.
- Verify ammo type remains remembered by the weapon after the ammo stack is reduced or deleted by reload.
- Force a firearm crit fail and verify the chat lists rolled consequences as `сработало/нет`.
- Verify crit-fail buttons appear only for consequences that actually triggered.
- Verify homemade ammo can make jam more likely in crit-fail math.
- If several ammo stacks share the weapon calibre, reload opens an ammo picker instead of silently taking the first stack.
- Weapon sheet `Заряжено` shows the ammo currently stored on the weapon after reload.
- On burst crit fail, verify the chat reports fewer spent bullets when the jam interrupts the burst.
- On burst crit fail, verify the magazine keeps/refunds bullets that were not actually fired.
- When a ballistic manual damage button is clicked, verify any trauma block belongs to the collateral target, not the currently selected token.
- Fire a burst at one target with another token inside the cone: chat should show per-bullet primary hits and separate collateral entries rather than one combined "whole burst" hit.
- In auto mode, verify primary burst bullets damage the chosen target once through the normal attack damage flow, while side-hit bullets are handled by auto ballistics.
- Set line width to `0,5` on a weapon/attack and `0,25` as an ammo modifier; preview and risk detection should treat them as decimals, not `0`.
- With a blocker on the line of fire, force/observe misses and confirm the blocker is not hit 100% of the time.
- Reload a shotgun with slug ammo and shot ammo separately: slug should keep a narrow line/cone and higher penetration, while shot should widen the cone and lower penetration.

## Change Log

- 2026-05-04: Added standalone ballistics prototype, simulator, and tests.
- 2026-05-04: Added ammo ballistic presets, loaded-ammo weapon flags, Foundry item fields, simulator scenarios, and tests.
- 2026-05-04: Added concrete crit-fail consequence rolls and firearm simulator output for jam/wear/noise pressure.
- 2026-05-04: Added reload ammo picker, loaded-ammo sheet summary, and interrupted-burst ammo refund.
- 2026-05-05: Connected manual ballistic damage to the trauma report/manual-button flow.
- 2026-05-05: Added ammo-vs-armor simulator for preset balance.
- 2026-05-05: Reworked burst fire into per-bullet ballistic resolution with probabilistic cone/line collateral and comma-decimal numeric parsing.
- 2026-05-05: Added dedicated slug ammo preset so shotgun bullets and shot behave differently in previews and simulations.
