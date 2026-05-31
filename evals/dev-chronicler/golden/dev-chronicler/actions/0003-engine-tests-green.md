# 0003 — Engine smoke tests green

**Date:** 2026-05-31

## What I did
- Added `tests/test_engine.py` with three dependency-free `unittest` cases:
  a non-crit attack deals exactly the attacker's power, a high roll (>= 0.8) adds
  one "critical" damage, and `build_world()` ships the goblin and the potion.
- Used a fake `roll` (`lambda: 0.0` / `lambda: 0.9`) to make the crit branch
  deterministic — the payoff of injecting RNG back in [0001 — Scaffold the engine and hardcoded world](0001-scaffold-engine-and-world.md).

## Outcome
- `python -m unittest` → 3 tests, 3 passing, 0 failures.
- Combat math is now pinned; a future content change can't silently break the
  crit rule without turning a test red.

## Commands
```
python -m unittest
# -> Ran 3 tests ... OK
```

## Notes / related
- Closes the walking-skeleton milestone summarised in the latest handover.
