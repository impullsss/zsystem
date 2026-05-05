# TASK-030 - Foundry Manual Regression Checklist

## Status

Backlog

## Why

The user is intentionally not testing every new change right now. We need to keep a running checklist of things to verify later in Foundry so manual QA does not rely on memory.

## Check Later In Foundry

- Social check dialog opens from the left HUD communication flow.
- Social check dialog updates chance, DC, ordinary fail chance, and crit-fail chance when NPC attitude or preset changes.
- Social check dialog visual preview is readable, does not overflow at 460px width, and clearly shows attitude/preset factors for GM.
- Social check chat card is created normally for Diplomacy and Leadership.
- Social check chat card uses the shared check-details block with situation, skill, DC, fail chance, and crit-fail chance.
- Social check result bands match the displayed chance: ordinary fail, success, and crit-fail.
- Token HUD social attitude palette still opens after right-clicking a token and clicking the smile icon.
- Left player HUD attitude dialog still changes attitude and preset reactively without pressing Save.
- Stealth button in the left HUD still toggles the stealth status.
- Standard skill rolls from the actor sheet create chat cards normally after the skill-vs-difficulty migration.
- Standard actor-sheet skill clicks open the new `ZSkillCheckDialog`, not the old generic roll dialog.
- Standard skill roll dialog shows difficulty presets: easy, normal, hard, dangerous.
- Standard skill roll dialog preview updates chance, DC, fail chance, and crit-fail chance when preset/manual modifier changes.
- Standard skill roll dialog visual preview is readable in Foundry light/dark themes and does not overflow at 460px width.
- Standard skill roll dialog still uses the shared preview styling and keeps the green skill-check accent.
- Standard skill roll dialog quick scenario buttons select the intended skill and difficulty: Healing, Mechanics, Science, Survival, Stealth.
- Standard skill roll modifier behaves as an ease/hardness modifier: positive makes the DC lower, negative makes it higher.
- Standard skill roll preset and manual modifier combine correctly in the chat card details.
- Standard skill roll chat card uses the shared check-details block with preset, skill, DC, fail chance, and crit-fail chance.
- Standard skill rolls use the unified d100 standard: 1-5 is crit success, ordinary fail starts after that, high rolls are crit fail.
- Social checks use the same unified d100 standard: 1-5 is crit success, ordinary fail starts after that, high rolls are crit fail.
- Attack rolls use the same unified d100 standard: 1-5 is crit success, ordinary fail starts after that, high rolls are crit fail.
- With `Debug: С„РёРєСЃРёСЂРѕРІР°РЅРЅС‹Р№ d100 = 1`, standard skill checks, social checks, and attacks show crit success.
- With `Debug: С„РёРєСЃРёСЂРѕРІР°РЅРЅС‹Р№ d100 = 96` or higher, normal-skill checks show crit fail.
- GM left HUD debug d100 panel changes the forced d100 setting without opening system settings.
- GM left HUD debug d100 quick buttons `0`, `1`, `5`, `6`, `95`, `96`, `100` update the setting and immediately affect the next d100 check.
- Skill/social/attack previews and chat cards clearly show crit-success chance, ordinary fail chance, and crit-fail chance.
- Skill/social/attack previews and chat cards show readable d100 ranges: crit success, success, fail, crit fail.
- Aiming tooltip shows the same d100 ranges without blocking the target details.
- Attack chat shows a short combat outcome note for crit success, ordinary miss, and crit fail.
- Attack chat groups lower details into readable `Проверка`, `Ресурсы`, and `Модификаторы` sections.
- Combat outcome notes do not apply new mechanical penalties yet; verify they are only explanatory except existing crit damage.
- `game.zsystem.openSkillCheck()` opens the same dialog for the selected token actor.
- Left player HUD has a general skill check button that opens `ZSkillCheckDialog`.
- Left player HUD skill check button works for both survivor and NPC actors when the user has permission.
- Combat aiming HUD reflects updated shared difficulty tables: head -40, light cover -15, medium range -20, far range -40.
- Normal ranged attack, headshot, cover, range, and intervening-token scenarios still feel playable after TASK-024 table tuning.
- Specifically retest stacked bad conditions: headshot + cover + medium/far range + intervening token + evasion may now drop to 0%.
- Existing cover behavior still distinguishes no cover, window, light cover, heavy cover, and blocked line.
- `npm run sim:balance` prints outcome pressure lines for crits/fight, fumbles/fight, fights with fumble, and projected crit-fail profile effects per 100 attacks.

## Notes

- Combat attack rolls have not been migrated to the new model yet.
- `npm test`, `npm run build`, and `npm run sim:balance` cover automated confidence, but these UI flows still need a real Foundry pass.

## Added After 2026-04-27 Feedback

- Social check modifier input allows typing a leading minus without immediately resetting to 0.
- Standard skill roll modifier input allows typing a leading minus without immediately resetting to 0.
- Social check friendly/easy factor chips use darker readable colors on the parchment background.
- Standard skill and social check chat-card details are readable on the light chat background.
- Stealth/status toggles no longer produce `StatusEffectConfig#icon` deprecation warnings from ZSystem statuses.
- Chat buttons for applying damage/effects still work after migrating ZSystem chat listeners to `renderChatMessageHTML`.
- If `ChatMessage#user` warnings remain after shotgun attacks, confirm whether they come from Automated Animations (`aa-chatmessage.js`) rather than ZSystem.

## Combat DC Migration Checks

- With `Debug: фиксированный d100 = 99`, standard skill checks, social checks, and attacks use roll 99 for quick crit-fail testing.
- With `Debug: фиксированный d100 = 0`, all d100 checks return to normal random rolling.
- Ranged attack preview now shows chance, DC, ordinary fail chance, and crit-fail chance.
- Ranged attack chat card now shows skill, DC, ordinary fail chance, and crit-fail chance.
- Normal ranged attack at medium distance with light cover feels close to the simulator baseline: about 60% for skill 70 vs evasion 10.
- Headshot without aiming feels risky: about 20% for skill 70 at medium distance with light cover.
- Headshot with 2 aim steps improves to about 40% in the same conditions.
- Intervening tokens still apply interference and raise DC.
- Dizzy and blind now raise combat DC instead of halving the final percent; verify the tooltip and chat detail remain understandable.
- High skill can exceed the old 95% cap because reduced crit-fail is now the limiter; verify this feels acceptable in play.
- AP cost, aim AP cost, ammo spending, reload, throwing consumption, damage, stealth damage, and triggered effects still work after combat migration.
- Crit success damage in live Foundry still follows the weapon `Crit Multiplier (x)` field, not a hardcoded `1.5x`.
- Crit fail still does not apply jam, durability loss, weapon drop, self-damage, or trauma until we explicitly enable one of those mechanics.
- Crit fail attack chat cards show the possible future consequences block for the correct weapon profile: ranged, melee, or throwing.
- Crit fail attack chat card `Износ оружия -1` button is visible for attacks made with an item UUID.
- Clicking `Износ оружия -1` as GM reduces the attacking weapon `system.hp.value` by 1 and disables the clicked button.
- Clicking `Износ оружия -1` as non-GM should not apply wear.
- Weapon sheet shows `Заклинило?` checkbox for weapons.
- Ranged crit fail chat card shows `Заклинить оружие` when the ranged crit-fail profile includes jam.
- Clicking `Заклинить оружие` as GM sets weapon `system.jammed = true` and disables the clicked button.
- Attacking with a jammed weapon should be blocked before AP/ammo are spent.
- Clearing `Заклинило?` on the weapon sheet should allow attacks again.
- Clicking `Заклинить оружие` as non-GM should not set the jam flag.
- Ranged crit fail chat card shows `Лишний шум +N` when the ranged crit-fail profile includes extra noise.
- Clicking `Лишний шум +N` as GM increases the NOISE HUD by `N`, disables the clicked button, and still uses existing zombie aggro/noise logic.
- Clicking `Лишний шум +N` as non-GM should not add noise.
- Melee or throwing crit fail chat card shows `Сбить атакующего с ног` when the profile includes off-balance.
- Clicking `Сбить атакующего с ног` as GM applies the existing `prone` status to the attacking actor, not to the current target.
- Clicking `Сбить атакующего с ног` as non-GM should not apply the status.
## Firearm Ballistics Prototype Checks

- `npm run sim:firearms` prints separate scenarios for stray hits, overpenetration, and burst fire.
- Prototype ballistics are not yet connected to live Foundry attacks, so normal ranged attacks should behave exactly as before.
- Later, after integration, verify line-risk/friendly-fire warnings before enabling automatic stray hits.
- Later, after integration, verify burst crit fail can interrupt the burst and does not always spend all requested bullets.
- Ranged aiming HUD shows a `Баллистика` block when another token is on the shot line, behind the target, or inside a burst cone.
- Ballistic preview highlights risky tokens but does not apply extra damage yet.
- Ranged attack chat shows a `Баллистика` block when stray hit, overpenetration, burst-cone, or interrupted-burst data exists.
- Ballistic chat buttons are GM-only and apply damage to the listed token, not to current selected/targeted tokens.
- Ballistic chat damage buttons can create the same trauma report/manual buttons for the actor that received collateral damage.
- Non-GM users clicking ballistic buttons should not apply damage.
- `Огнестрел: показывать баллистику при прицеливании` disables/enables only the aiming HUD preview.
- `Огнестрел: баллистика в чате = Выкл.` hides ballistic chat blocks.
- `Огнестрел: баллистика в чате = Только отчёт` shows ballistic info without damage buttons.
- `Огнестрел: баллистика в чате = Отчёт + ручные GM-кнопки` shows ballistic info with GM buttons.
## Ammo Ballistics Checks

- Ammo item sheet shows calibre, ammo kind, damage, ballistic power, armor piercing, line width, burst cone, noise, and jam modifiers.
- Reloading a firearm stores the loaded ammo profile on the weapon, even if the ammo stack is consumed and deleted.
- Standard ammo keeps the old firearm behavior close to unchanged.
- Armor-piercing ammo raises armor piercing/power in the aiming preview and ballistic chat, and makes overpenetration easier.
- Expansive ammo increases direct damage but makes overpenetration harder.
- Shot ammo visibly widens the line/cone risk preview and can list more nearby collateral targets.
- Subsonic ammo lowers the generated noise amount after a shot.
- Homemade ammo shows its preset in the ballistic chat and is ready for future jam-risk balancing.
- Firearm attack chat includes the loaded ammo name in the ballistic block.
- Primary target damage includes ammo damage bonus/penalty after reload.
- Reload with two or more ammo stacks of the same calibre opens a choice dialog.
- Reload with one compatible ammo stack still loads immediately without extra click.
- Cancelling the reload ammo choice does not spend AP and does not load ammo.
- Weapon sheet shows `Заряжено` with the current ammo summary after reload.
- Burst crit fail that interrupts the burst spends only fired bullets and returns unfired bullets to the magazine.
- `npm run sim:ammo` works and compares ammo presets against no/light/medium/heavy armor.
- Compare `npm run sim:ammo` output with Foundry expectations before changing ammo preset numbers.

## Crit Fail Consequence Checks

- Forced firearm crit fail shows rolled consequences as `сработало/нет`, not just a generic future warning.
- Crit-fail chat buttons appear only for consequences that actually triggered.
- If jam triggered, the jam button sets `system.jammed = true` and the weapon blocks future attacks.
- If durability loss triggered, the wear button reduces weapon HP by 1.
- If extra noise triggered, the noise button increases the NOISE HUD by the listed amount.
- Non-GM users still cannot apply crit-fail consequence buttons.
- Homemade ammo with `Клин +%` makes the jam consequence more likely than standard ammo.
- Melee crit fail can show `Оружие выпало из рук`; GM click should set weapon `system.equipped = false`.
- Throwing crit fail can show `Плохой разлёт`; GM click should create a scatter chat note with direction and distance.
- Throwing crit fail can show `Предмет потерян`; GM click should reduce item quantity or delete the item if quantity reaches 0.
- Non-GM users should not be able to apply weapon drop, bad scatter, or item lost buttons.

## Verified On 2026-05-04

- Basic rolls: standard skill checks, social checks, attacks, and debug d100 values `1`, `5`, `6`, `95`, `96`, `100`.
- Social flow: left HUD, token right-click attitude, attitude/preset changes, Diplomacy and Leadership checks.
- Combat basics: hit, miss, crit success, crit fail, and weapon crit multiplier.
- Crit fail buttons: triggered buttons appear, jam blocks weapon, wear reduces durability, noise is added.
- Ammo flow: multiple ammo types per calibre, reload picker, loaded ammo summary in weapon sheet.
- Ballistics flow: ally on fire line, target behind target, burst into group, shot ammo wide cone, armor-piercing overpenetration.

## Trauma Checks

- Serious torso ballistic wounds show a trauma block and can offer bleeding without prone spam.
- Critical head wounds can offer injury, bleeding, and dizzy buttons.
- Light trauma appears as descriptive pressure without mechanical button spam.
- Trauma buttons apply only for GM and target the damaged actor, not the currently selected token.
- Trauma setting `off` hides trauma blocks in attack chat.
- Trauma setting `report` shows trauma text without GM buttons.
- Trauma setting `manual` shows GM buttons for concrete consequences.
- Trauma severity multiplier changes how often light/serious/critical trauma appears.
- Serious torso wounds should not offer prone unless the wound is critical; leg trauma can still offer prone earlier.
- `npm run sim:trauma -- 1000` works and helps compare trauma severity/effects before manual Foundry balance passes.
