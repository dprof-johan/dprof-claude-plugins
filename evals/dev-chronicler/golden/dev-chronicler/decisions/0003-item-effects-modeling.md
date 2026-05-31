# 0003 — Modelling item effects

**Date:** 2026-05-31

## Context

Adding a sword means items now need an *effect* beyond healing: the potion heals,
the sword should raise attack. We need a way to express item effects that doesn't
balloon the model for a game with only a handful of items.

## Decision

Keep a single `Item` dataclass and express effects as **optional numeric fields**
(`heal`, `attack_bonus`, defaulting to 0). The `use` command applies each field.
No new types.

## Alternatives considered

- **Item subclasses (`Potion`, `Sword`) or a strategy/callback per item.**
  Rejected: polymorphism for two numeric effects is more machinery than the game
  needs, and it cuts against the hardcoded-content choice
  ([0002 — Hardcoded world vs data-driven content](0002-hardcoded-vs-data-driven.md)).
- **A generic `effects: dict` bag.** Rejected: stringly-typed and unvalidated;
  named fields are clearer and type-checked.

## Consequences

- A new effect is a new optional field plus one line in `use` — cheap for now.
- If items later grow many distinct, conditional behaviours, this flat model will
  strain and should be revisited (likely superseding this decision).

## Related
- [0002 — Hardcoded world vs data-driven content](0002-hardcoded-vs-data-driven.md) — the v1 simplicity this stays consistent with.
- [actions/0004 — Add a sword that buffs attack](../actions/0004-add-sword-attack-buff.md) — the implementation.
