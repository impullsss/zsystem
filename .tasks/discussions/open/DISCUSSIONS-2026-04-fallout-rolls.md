# Discussion: Fallout Rolls, Skills, Progression

**Status:** open  
**Created:** 2026-04  
**Source:** migrated from `.claude/DISCUSSIONS-2026-04-fallout-rolls.md`  
**Related tasks:** TASK-023, TASK-024, TASK-025, TASK-026, TASK-027, TASK-028, TASK-029

## Goal

Rework rolls and progression so the system feels closer to Fallout:

- player still sees a familiar `d100` roll
- skills can grow above `100`
- attributes do not directly add accuracy
- beginners are still playable
- progression above `100` still matters
- the model should later work not only for zombies, but for a wider range of campaigns and enemy profiles

## Core Direction

Current discussion converges on this principle:

- `skill` should define competence
- `context` should define difficulty
- the final chance should stay readable as a percent

This keeps the Fallout vibe while avoiding the feeling that raw stats directly decide every hit.

## Recommended Model

Player-facing behavior:

- roll `1d100`
- success if `roll <= chance`

Internal model:

- `S = effectiveSkill`
- `D_base = sum of scene difficulty factors`
- `scale(S) = 100 / (100 + S)`
- `D = D_base * scale(S)`
- `Chance = clamp(round(100 * (1 - D)), minChance, maxChance)`

Suggested defaults:

- `minChance = 10`
- `maxChance = 95`

Why this version currently looks stronger than plain `skill - difficulty`:

- penalties always matter
- high skill softens bad conditions instead of just flattening everything
- low skill is not instantly pushed into zero by a couple of penalties
- skill values above `100` keep producing real value without breaking UI

## Difficulty Factors

`D_base` should be built automatically from context. The player should not type numbers manually.

Suggested factor buckets:

- range: `0.00 / 0.10 / 0.25 / 0.40`
- cover: `0.00 / 0.20 / 0.40`
- called shot: torso `0.00`, limbs `0.20`, head `0.40`
- visibility/light: `0.00 / 0.15 / 0.30`
- token interference: `+0.05` each, cap `+0.20`
- target evasion: convert to `+0.00 ... +0.30`

Detailed tables belong in `TASK-024`.

## Overcap Above 100

Luck is postponed for later as a separate characteristic.

For now, skill over `100` should matter in two ways:

- it makes difficult situations more manageable
- it improves quality of success, not just raw hit chance

The main candidate metric:

- `margin = Chance - roll`

That leads directly into `TASK-025` for crits, fumbles, anti-fumble rules, and other quality effects.

## Attributes

Current preferred direction:

- STR: melee damage, requirements, carry weight
- AGI: AP, movement, evasion
- PER: detection, awareness, maybe indirect effect on visibility/range interpretation, but not direct bonus to hit chance
- INT: learning, crafting, science, medicine
- CHA: morale, leadership, trade, social checks
- VIG: survivability, thresholds, resistance profile

Important line:

- no direct `attribute -> hit chance` bonus

## Skill Progression

Current draft:

- `0-100`: cost `1`
- `101-150`: cost `2`
- `151-200`: cost `3`
- `201+`: cost `5` if overcap is ever allowed beyond the default UI range

Working default:

- visible/default cap in UI: `200`
- no hard crash if buffs or perks temporarily push `effectiveSkill` above `200`

## Social Checks

The same philosophy should later work outside combat:

- player gets a quick mode with minimal meta-information
- GM gets the expanded mode and hidden factors
- NPC sheets can store attitude and social presets
- right-click or macro can launch a social check quickly

This ties into `TASK-029`.

## Universal Survivability

This roll model should stay decoupled from one specific enemy type.

Separate world presets should later define survivability style:

- Classic
- Cinematic
- Tactical
- No Limbs

This belongs to `TASK-026`.

## Current Recommendation

Right now the best path looks like this:

1. Keep the visible `d100` roll.
2. Move all hit calculation into one central calculator.
3. Convert current flat combat modifiers into structured auto-difficulty factors.
4. Let skill values above `100` matter through soft scaling and margin quality.
5. Only after that, tune crits/fumbles and progression costs.

## Why Not Plain `skill - difficulty`

That alternative is simpler, but it has a few weaknesses for this project:

- heavy penalties can still crush low-skill characters too hard
- overcap mostly becomes "hit cap faster"
- the system becomes harder to tune when we want both Fallout flavor and forgiving early play

Plain subtraction is still a valid fallback if the scaled model feels too abstract in testing, but for now the scaled-difficulty model seems more promising.

## Open Questions

- Should `minChance` stay at `10`, or do we want a harsher default like `5`?
- Should PER remain fully outside hit chance, or should it weakly reduce only some contextual penalties?
- Should social checks reuse the exact same formula, or a simplified variant of it?
- Do we want crit quality to affect damage only, or also control/status effects?
- Should the player chat card show the full factor breakdown, or only the most important 2-4 factors while GM sees all?

## Recommended Next Implementation Order

1. Finalize the formula choice in `TASK-023`.
2. Lock difficulty tables in `TASK-024`.
3. Build a single shared breakdown calculator for HUD, chat, and actual rolls.
4. Add margin/crit/fumble behavior in `TASK-025`.
5. Rework progression/UI ranges in `TASK-028`.
6. Run balance simulations in `TASK-027`.

## Codex Continuation

My continuation from this point:

- The discussion is already strong enough to stop treating it as loose brainstorming.
- This should become the source design note for the Fallout roll rework inside `.tasks`.
- The biggest unresolved design fork is not "Fallout vs not Fallout", but which exact chance formula we lock in for `TASK-023`.

My current recommendation is:

- keep this scaled-difficulty model as the primary candidate
- keep plain subtraction as the fallback baseline for comparison during testing
- evaluate both with simulation before implementation spreads across combat, social, and UI

## Decision Snapshot

Things that look nearly decided:

- visible roll remains `1d100`
- skills may exceed `100`
- attributes should not directly add hit chance
- overcap should matter through resilience against penalties and margin quality
- discussion belongs under `.tasks`, not `.claude`

Things still open:

- exact min chance
- exact factor table values
- exact crit/fumble payoff
- whether PER gets a small indirect role in ranged context handling
