# Discussion: Throwing Weapons And UI Support

**Status:** open  
**Created:** 2026-04  
**Related tasks:** TASK-024, TASK-029

## Goal

Capture the open question around thrown weapons so it does not get mixed into the current combat refactor.

## Current Situation

The code already contains partial support for throwing logic:

- attack mode may be `"throw"`
- thrown attacks can use `athletics`
- ammo consumption logic already treats thrown attacks differently

But the author is not sure whether the current UI and item editing flow actually let users create and maintain thrown attacks cleanly.

## Why This Is Deferred

Right now the project is focused on:

- separating combat responsibilities
- centralizing chance logic
- defining auto-difficulty tables

Throwing weapons are useful, but they are not currently blocking the main architecture work.

## Open Questions

- Do we need a dedicated checkbox/attack type in the item sheet for thrown attacks?
- Should thrown attacks be their own weapon subtype, or just a mode on existing weapons?
- Should all thrown weapons use `athletics`, or should some use `melee`/`ranged` depending on weapon class?
- How should range and called-shot penalties behave for thrown attacks?
- Do consumable thrown items and reusable thrown weapons need different UX?

## Decision Snapshot

Current decision:

- do not expand thrown weapon support right now
- keep the existing partial support untouched unless it blocks another task
- return to this after the chance/difficulty architecture is more stable
