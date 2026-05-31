# 0002 — Hardcoded world vs data-driven content

**Status:** Accepted
**Date:** 2026-05-30

## Context

The game needs rooms, an enemy, and an item. We could define them in code or
load them from data files (JSON/YAML). The v1 world is two rooms, one goblin, one
potion — and the point of the sample is to be small and obvious, not to support
modding.

## Decision

**Hardcode the world in `content.py`** via a single `build_world()` factory that
returns `(hero, rooms, start_room)`. No external content files, no loader.

## Alternatives considered

- **Data-driven (rooms/enemies in JSON or YAML).** Rejected for v1: a schema, a
  loader, and validation are more code and concepts than the two-room world
  justifies. Premature flexibility.
- **Hardcode inline in `main.py`.** Rejected: mixing world data into the I/O loop
  would couple content to the parser and make the engine harder to test in
  isolation.

## Consequences

- Adding rooms or enemies means editing Python, not data — acceptable now.
- `build_world()` stays the single seam for content, so a future move to
  data-driven loading is a localized change behind the same factory.
- If the world grows past a handful of rooms, revisit this and supersede it with
  a data-driven decision.

## Related
- [0001 — Language and dependencies](0001-language-and-deps.md) — the stdlib-only constraint this works within.
- [actions/0001 — Scaffold the engine and hardcoded world](../actions/0001-feat-scaffold-engine-and-world.md) — implements `build_world()`.
