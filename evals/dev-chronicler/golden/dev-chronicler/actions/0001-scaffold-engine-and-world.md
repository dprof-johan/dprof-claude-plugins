# 0001 — Scaffold the engine and hardcoded world

**Date:** 2026-05-30

## What I did
- Created the `rpg/` package with an I/O-free `engine.py`: `Item`, `Entity`
  (with an `alive` property), `Room` dataclasses, and `resolve_attack(attacker,
  defender, roll)` that injects the random source so combat is testable.
- Added `content.py` with `build_world()` returning `(hero, rooms, start_room)` —
  two rooms (entrance, hall), a goblin in the hall, a potion in the entrance.
- Kept all randomness behind the injected `roll` callable; `engine.py` imports no
  I/O and no `random`.

## Outcome
- `import rpg.engine` and `rpg.content.build_world()` work; world has the
  expected goblin and potion. No game loop yet — that's [0002 — Fight loop and command parser](0002-fight-loop-and-cli.md).

## Commands
```
python -c "from rpg.content import build_world; print(build_world()[2])"
# -> entrance
```

## Notes / related
- Implements [decisions/0001 — Language and dependencies](../decisions/0001-language-and-deps.md) and [decisions/0002 — Hardcoded world vs data-driven content](../decisions/0002-hardcoded-vs-data-driven.md).
