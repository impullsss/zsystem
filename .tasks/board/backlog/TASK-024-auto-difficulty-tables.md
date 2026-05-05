# TASK-024 - Auto-Difficulty Tables (Range, Cover, Called Shot, Visibility)

**Status:** backlog  
**Priority:** high  
**Size:** M  
**Depends on:** TASK-023  
**Related discussions:** `discussions/open/DISCUSSIONS-2026-04-fallout-rolls.md`, `discussions/open/DISCUSSIONS-2026-04-throwing-weapons.md`

## Goal

Define one coherent set of default auto-difficulty tables so combat no longer depends on scattered hardcoded penalties.

This task should produce:

- one shared source of truth for range, cover, called shot, visibility, interference, and evasion conversion
- defaults that feel good in normal play
- values that can later be tuned without rewriting combat code

## Design Direction

The player should still feel:

- normal attacks are reliable enough to be fun
- headshots are risky but attractive
- cover matters
- distance matters
- aiming matters

The system should also stay reusable for a more universal game, not only one zombie campaign profile.

## Current Baseline In Code

Current penalties in code are roughly:

- range: `0 / -20 / -40`
- cover: `0 / -15 / -30 / blocked`
- called shot: `0 / -20 / -40`
- interference: `-20` per intervening token
- evasion: direct negative equal to target evasion

This works as a temporary baseline, but the values are still spread through combat code and are not yet treated as proper shared tables.

## Proposed Default Tables

These are the recommended first defaults to lock in.

### Called Shot

- torso: `0`
- arm: `-20`
- leg: `-20`
- head: `-40`

Reason:

- torso should remain the stable baseline
- limbs should feel like a meaningful but realistic extra risk
- head should stay a commitment, especially before crit tuning is finished

### Range

For ranged weapons:

- `distance <= range`: `0`
- `distance <= range * 2`: `-20`
- `distance > range * 2`: `-40`

For melee weapons:

- in reach: `0`
- outside reach: blocked

Reason:

- simple and readable
- already close to current behavior
- good first step before later weapon-specific tuning

### Cover

- no cover: `0`
- light cover: `-15`
- heavy cover: `-30`
- fully blocked / no valid line: blocked
- optional special case for window/opening: `-20`

Reason:

- this matches current feel closely enough
- avoids a balance reset while architecture is changing
- can later be split into more granular presets if needed

### Intervening Tokens

- `-20` per intervening token
- recommended cap: `-40`

Reason:

- one body between shooter and target should matter
- more than two bodies should not keep scaling forever

### Target Evasion Conversion

Short-term default:

- use current direct negative conversion from target evasion

Long-term candidate:

- convert evasion into threshold buckets instead of raw subtraction

For now:

- keep current raw conversion so behavior does not swing too much during refactor

### Visibility / Light

This is not yet fully wired in current combat flow, but the target defaults should be:

- clear visibility: `0`
- dim / poor visibility: `-15`
- bad visibility / darkness: `-30`
- no valid vision: blocked or separate rule

Important:

- `blind` stays a separate attacker status effect for now
- world lighting should not be mixed into this until we decide how much Foundry-native vision data we trust

## What Should Be Extracted

This task should move the tables into one shared place, for example:

- a dedicated difficulty config module
- constants object used by the chance calculator
- optional `game.settings` later for world-level tuning

The chance calculator should ask the table source for values instead of hardcoding numbers.

## Scope Rules

Included:

- defining default numeric tables
- centralizing them in code
- using them from the shared chance calculator

Not included:

- redesigning line-of-sight collision behavior
- final thrown weapon tuning
- crit/fumble payoff
- full balancing simulation

Those stay for later tasks.

## Recommended Implementation Shape

Suggested structure:

```js
export const Z_DIFFICULTY_TABLES = {
  calledShot: {
    torso: 0,
    lArm: -20,
    rArm: -20,
    lLeg: -20,
    rLeg: -20,
    head: -40
  },
  range: {
    near: 0,
    medium: -20,
    far: -40
  },
  cover: {
    none: 0,
    light: -15,
    heavy: -30,
    window: -20,
    blocked: -1000
  },
  interference: {
    perToken: -20,
    cap: -40
  },
  visibility: {
    clear: 0,
    dim: -15,
    dark: -30,
    blocked: -1000
  }
};
```

## Validation Targets

The first tuning target should stay conservative:

- ordinary ranged attacks in normal combat should usually land around `55-75%` for a competent shooter
- headshots without aiming should usually sit around `20-45%`
- cover should noticeably reduce chance without making every exchange miserable

## Definition Of Done

- all current baseline difficulty values live in one shared place
- chance calculation reads those values instead of hardcoded scattered numbers
- called-shot penalties are no longer duplicated ad hoc
- interference uses a cap instead of scaling forever
- the values are documented well enough for future balance work

## Change Log

- 2026-04-23: task rewritten from a loose note into an implementation-ready table spec
- 2026-04-23: throwing weapons explicitly deferred into a separate discussion
- 2026-04-26: centralized combat difficulty helper accessors; updated defaults toward the proposed table values; visibility table added for future wiring
