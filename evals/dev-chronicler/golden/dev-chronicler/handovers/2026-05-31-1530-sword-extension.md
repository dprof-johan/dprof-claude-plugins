# Handover — sword extension landed

**Date:** 2026-05-31 15:30

## Where things stand
The base RPG (walking skeleton) now has its first content extension: a sword in
the hall that buffs attack. The engine is still I/O-free; the effect is applied
in the `use` command.

## What works
- Full suite green: `python -m unittest` → 4/4 (added the sword-buff test,
  [actions/0005 — Pin the sword's attack buff](../actions/0005-test-pin-sword-buff-test.md)).
- Sword playthrough: go north → take → use sword → attack 3→5 → two-hit win
  ([actions/0004 — Add a sword that buffs attack](../actions/0004-feat-add-sword-attack-buff.md)).

## In flight / half-done
- Nothing half-done. Item effects use a flat optional-field model
  ([decisions/0003 — Modelling item effects](../decisions/0003-item-effects-modeling.md)) —
  fine until items gain many distinct behaviours.

## Next steps
1. If more items with conditional effects arrive, revisit ADR 0003 (it may need
   superseding by a richer effect model).
2. Consider a `main.py`-level playthrough test covering the use→attack path.

## Gotchas
- The hall now has BOTH an enemy and an item — `take` then `use sword` before you
  `attack`. Keep `engine.py` I/O-free; stat changes happen in `main.py`.
