# DISCUSSIONS-2026-04 - Skill vs Difficulty Check Model

## Context

After discussing a similar system, we are prototyping a new universal check model:

```text
ordinary fail chance = max(0, difficulty - skill)
crit success chance = 5% at the low end of d100
fumble chance = base fumble - 1% per 20 skill above difficulty
minimum fumble chance = 1%
everything else = ordinary success
```

Examples:

```text
difficulty 60, skill 40:
1-5 crit-success, 6-75 success, 76-95 fail, 96-100 crit-fail

difficulty 60, skill 140:
1-5 crit-success, 6-99 success, 100 crit-fail
```

## Roll Standard

We chose one intuitive convention for every d100 check:

- low roll is good
- high roll is bad
- 1-5 is crit success
- ordinary success comes immediately after crit success
- the ordinary fail band sits before crit fail
- the high end is crit fail, normally 96-100 and reduced for experts

This avoids the confusing situation where a low roll could be worse than a middle roll.

## Why This Is Interesting

- High skill stops being just a bigger hit chance number.
- Skilled characters become reliable at easy tasks.
- Critical failure can still exist without making experts look incompetent.
- The same model can work for combat, social checks, survival, crafting, medicine, and exploration.

## Current Prototype

Prototype module:

- `src/module/check-model.js`

Validation:

- `tests/check-model.test.js`
- `tests/skill-check.test.js`
- `tests/social-check.test.js`
- `npm test`
- `npm run sim:balance` now prints a preview line for the new model next to the current combat chance.

First live use:

- standard actor-sheet skill rolls now use the new model
- standard actor-sheet skill rolls have difficulty presets: easy DC 40, normal DC 60, hard DC 80, dangerous DC 100
- standard actor-sheet skill rolls show a live preview before rolling: chance, DC, ordinary fail, crit-fail
- standard actor-sheet skill rolls now use a dedicated `ZSkillCheckDialog`
- `game.zsystem.openSkillCheck()` exposes the same dialog for macros and future HUD buttons
- the left player HUD now exposes the same generic skill check dialog
- social checks now use the new model for the actual roll result
- standard skill roll difficulty is converted into DC as `60 - modifier`
- social `difficulty.total` is converted into DC as `60 - modifier`
- positive social modifiers make DC lower, negative modifiers make DC higher
- combat uses the same skill-vs-DC model and the same low-good/high-bad roll standard
- combat difficulty tables were centralized further: head -40, light cover -15, medium range -20, far range -40, visibility table prepared
- skill/social/attack previews and chat cards show crit success, ordinary fail, and crit fail chances explicitly
- `npm run sim:balance` now prints combat outcome pressure: average crit successes per fight, average crit fails per fight, fights with at least one crit fail, and projected jam/durability pressure for future crit-fail mechanics

## Where Difficulty Should Come From

The main design question is not the formula itself, but how to build `difficulty`.

Recommended direction:

```text
finalDifficulty = baseDifficulty + contextual factors
```

### Combat

Suggested starting point:

```text
baseDifficulty = 60
```

Potential factors:

- range
- cover
- called shot location
- intervening tokens
- target evasion
- darkness / visibility
- attacker bad state if it represents the situation, not raw competence

Positive weapon accuracy, aiming, perks, and buffs should usually go into `skill`, not `difficulty`.

### Social Checks

Suggested starting point:

```text
baseDifficulty = 60
```

Potential factors:

- target attitude
- preset difficulty
- manual GM modifier
- pressure / danger / lack of leverage
- public vs private conversation

Important distinction:

- `attitude` = how the target feels about the speaker
- `preset` = how hard the case itself is

### General Checks

Suggested starting point:

```text
easy = 40
normal = 60
hard = 80
extreme = 100
```

Potential uses:

- medicine
- crafting
- survival
- athletics
- stealth
- perception / search
- science / mechanical actions

## Open Questions

- Should combat use `baseDifficulty = 60`, or should weapons define their own base difficulty?
- Should headshots stay a difficulty factor, or become a separate called-shot mode with special rewards?
- Should `1-5 crit-success` later become variable by perks/weapon qualities, or stay a stable universal rule?
- Should social presets be renamed from `easy/normal/hard` to something more narrative?

## Current Recommendation

Keep the unified d100 standard active everywhere for now.

Next design pass should focus on balance and combat feel:

- confirm forced d100 1/5/6/95/96/100 in Foundry
- tune base DC and combat factors if the simulator and table feel disagree
- decide whether crit success should do only damage multiplier or also trigger extra combat effects
- crit success damage multiplier is read from weapon `system.critMult`; default remains `1.5`
