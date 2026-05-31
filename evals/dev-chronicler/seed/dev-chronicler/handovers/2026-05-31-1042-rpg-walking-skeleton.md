# Handover — RPG walking skeleton complete

**Date:** 2026-05-31 10:42

## Where things stand
The tiny text RPG is a complete, winnable walking skeleton. Three modules:
`engine.py` (pure rules), `content.py` (the hardcoded world), `main.py` (the only
I/O). It runs with `python -m rpg` and the engine has tests.

## What works
- Full playthrough: take potion → go north → attack ×3 → `YOU WIN`
  ([actions/0002 — Fight loop and command parser](../actions/0002-fight-loop-and-cli.md)).
- `python -m unittest` → 3/3 green
  ([actions/0003 — Engine smoke tests green](../actions/0003-engine-tests-green.md)).
- Combat is RNG-injected, so the crit branch is deterministically tested.

## In flight / half-done
- Nothing half-done. The world is intentionally two rooms — the hardcoded model
  is a deliberate v1 choice ([decisions/0002 — Hardcoded world vs data-driven content](../decisions/0002-hardcoded-vs-data-driven.md)).

## Next steps
1. If a second encounter is added, that's a fresh action entry — and it would
   stress-test whether [decisions/0002 — Hardcoded world vs data-driven content](../decisions/0002-hardcoded-vs-data-driven.md)
   should be superseded by a data-driven model.
2. Consider a `main.py`-level playthrough test (currently only the engine is tested).

## Gotchas
- `engine.py` must stay I/O-free and take `roll` as a parameter — that injection
  is what makes combat testable. Don't call `random` or `print` from it.
- Run commands from the `fixture/` directory so the `rpg` package imports
  correctly (`python -m rpg`, `python -m unittest`).
