# TASK-023 - Fallout-like Chance Model (Skill > 100)

**Status:** backlog  
**Priority:** high  
**Size:** L  
**Related discussion:** `discussions/open/DISCUSSIONS-2026-04-fallout-rolls.md`

## Goal

Replace the current flat hit chance calculation with a more universal Fallout-like model where:

- the visible roll remains `1d100`
- skills may grow above `100`
- attributes do not directly add hit chance
- bad conditions still matter
- high skill helps overcome difficult contexts without instantly trivializing everything
- the same core model can later support combat, social checks, and non-zombie campaigns

## Current Problem

Right now chance logic is scattered and too tightly coupled to combat UI:

- `src/module/dice.js` calculates hit chance directly in `_calculateHitChance`
- HUD display then applies extra blind/dizzy penalties on top of that result
- chat, HUD, and final attack resolution risk drifting apart
- modifiers are currently stored as flat `%` bonuses/penalties rather than a clean model of `skill vs context`

Because of that, the system is hard to generalize safely.

## Decision To Lock In

For this task, the primary candidate should be the **scaled-difficulty model**, not plain subtraction.

Chosen direction:

- `effectiveSkill` represents competence
- `baseDifficulty` represents context difficulty
- high skill reduces the impact of bad conditions through scaling
- final output is still a familiar `chance%`

Primary formula:

- `S = max(0, effectiveSkill)`
- `scale(S) = 100 / (100 + S)`
- `D = baseDifficulty * scale(S)`
- `chance = clamp(round(100 * (1 - D)), minChance, maxChance)`
- roll `1d100`, success if `roll <= chance`

Recommended defaults:

- `minChance = 10`
- `maxChance = 95`

Fallback baseline for comparison during tuning:

- `chance = clamp(effectiveSkill - autoDifficulty, minChance, maxChance)`

This fallback is **not** the target implementation. It exists only for comparison in balancing and simulation.

## Why This Formula

- beginners are not instantly pushed to `0%` by two or three penalties
- skill over `100` still matters even with a `95%` cap
- penalties always remain relevant
- the model is easier to reuse across different game styles
- it supports margin-based quality later in `TASK-025`

## Scope Of This Task

This task is about defining and centralizing the model, not yet finishing all balance tables.

Included here:

- one canonical chance breakdown calculator
- one canonical roll result contract
- migration path for combat HUD, chat, and attack execution
- support for skill values above `100`

Not included here:

- final tuning of all difficulty tables
- crit/fumble rules
- progression cost tables
- survivability presets

Those belong to `TASK-024`, `TASK-025`, `TASK-026`, `TASK-027`, and `TASK-028`.

## Required Calculator

Create one central function, used everywhere chance is shown or rolled.

Suggested contract:

```js
calcChanceBreakdown({
  actor,
  target,
  item,
  attack,
  sourceToken,
  targetToken,
  context
})
```

Return shape:

```js
{
  skill: {
    base,
    perkBonus,
    buffBonus,
    debuffPenalty,
    effectiveSkill
  },
  difficulty: {
    baseDifficulty,
    factors: {
      range,
      cover,
      calledShot,
      visibility,
      interference,
      targetEvasion,
      attackerState
    }
  },
  math: {
    scale,
    scaledDifficulty,
    minChance,
    maxChance
  },
  result: {
    chance
  }
}
```

Requirements for the contract:

- every consumer gets the same result object
- HUD, tooltip, chat card, and actual attack roll must all use this exact breakdown
- no second-stage hidden penalties after the calculator returns

## How To Classify Modifiers

This task should also lock the direction of modifier classification.

### Goes into `effectiveSkill`

- base skill value
- perk bonuses
- temporary buffs
- temporary debuffs that represent attacker competence, training, or condition to perform the action

### Goes into `baseDifficulty`

- range
- cover
- called shot
- visibility/light
- interference from intervening tokens
- target evasion
- situational attacker state penalties that represent the context of performing the shot

Practical note:

- even if the code currently stores some of these as flat `%` penalties, after this task they should be exposed through the new breakdown model

## Special Rule For Attributes

Attributes must not directly boost hit chance.

Allowed indirect uses:

- STR: melee damage, requirements, carrying
- AGI: AP, movement, evasion
- PER: detection, awareness, maybe later a small indirect effect on visibility/range interpretation, but not direct `+chance`
- INT: learning/crafting/knowledge actions
- CHA: social and morale
- VIG: survivability and thresholds

For this task specifically:

- no direct `attribute -> chance` term

## Migration Requirements

Current code paths must be normalized around the shared calculator.

### Phase 1

- extract current hit chance logic from `src/module/dice.js`
- stop calculating chance separately in HUD code
- stop applying blind/dizzy again after the calculator

### Phase 2

- make aiming HUD consume the shared breakdown
- make attack execution consume the same shared breakdown
- make chat cards display the same chance and main factors

### Phase 3

- prepare the calculator so social checks can later reuse the pattern with a different factor set

## UX Requirements

Player-facing output should stay readable.

Player should see:

- final `chance%`
- roll result
- 2-4 major factors

GM/debug output may show:

- full breakdown
- exact factor values
- scaling internals if needed for tuning

Important:

- the system should feel understandable, not academically overexplained

## Compatibility Requirements

- skills must support values `0-200+`
- UI must not break when values exceed `100`
- temporary buffs may push `effectiveSkill` above the default visible cap
- the calculator must still produce stable output when `effectiveSkill` is very low or very high

## Definition Of Done

- one central chance calculator exists and is the only source of truth
- HUD, chat, and actual roll use the same calculation result
- no duplicate blind/dizzy adjustment outside the calculator
- chance stays within `minChance` and `maxChance`
- skill values above `100` work without breaking UI logic
- the task spec is compatible with later `TASK-024` and `TASK-025`

## Validation

- same attacker, target, and context produce the same `chance` in HUD, chat, and actual roll
- skill `40` in a normal fight is still playable
- skill `140+` feels noticeably stronger without becoming "always perfect"
- difficult called shots become more realistic but not unusable with strong skill/aiming
- changing difficulty tables later does not require rewriting roll consumers

## Implementation Notes

Good target extraction path:

- new pure calculation module for chance math and breakdown building
- `dice.js` becomes a consumer, not the owner of formula details

Strong recommendation:

- keep the calculator pure enough that it can later be reused by a standalone simulation script in `TASK-027`

## Change Log

- 2026-04-23: task expanded from a rough idea into an implementation-ready spec
- 2026-04-23: scaled-difficulty model set as primary direction; plain subtraction kept only as balancing fallback
