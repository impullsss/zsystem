# ZSystem - Task Tracker

## Structure

| Folder | Purpose |
|-------|----------|
| `board/backlog/` | Ideas and tasks not yet started |
| `board/in-progress/` | Tasks in active development |
| `board/done/` | Finished tasks |
| `board/fix/` | Bugfix tasks |
| `board/closed/` | Closed or canceled tasks |
| `discussions/open/` | Open design discussions and architecture notes |
| `discussions/closed/` | Closed discussions with a final decision |
| `history/` | Session notes and project history |

## When To Use What

- Use `board/` for work that should eventually become implementation.
- Use `discussions/open/` for design topics, balancing notes, formulas, architecture forks, and unresolved questions.
- Move a discussion to `discussions/closed/` once the decision is stable enough to be treated as accepted direction.
- If a discussion produces concrete implementation work, link the relevant `TASK-###` files inside it.

## Task File Format

Filename: `TASK-001-short-description.md`

```markdown
# TASK-001: Task Name

**Status:** backlog | in-progress | done | closed
**Priority:** low | medium | high | critical
**Created:** YYYY-MM-DD
**Closed:** YYYY-MM-DD

## Description
What should be done and why.

## Done Criteria
- [ ] Item 1
- [ ] Item 2

## Technical Notes
Implementation details, touched files, design notes.

## Change Log
- YYYY-MM-DD: what changed
```

## Discussion File Format

Filename: `DISCUSSIONS-YYYY-MM-topic.md`

```markdown
# Discussion: Topic Name

**Status:** open | closed
**Created:** YYYY-MM
**Related tasks:** TASK-001, TASK-002

## Goal
What problem or design question we are trying to solve.

## Current Direction
The currently preferred approach.

## Open Questions
- Question 1
- Question 2

## Decision Snapshot
What is already agreed and what is still undecided.
```
