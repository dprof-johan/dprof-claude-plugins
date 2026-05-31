# 0005 — Pin the sword's attack buff

**Date:** 2026-05-31

## What I did
- Added `test_sword_in_hall_buffs_attack` to `tests/test_engine.py`: build the
  world and assert the hall's item is a `sword` with `attack_bonus == 2`.
- Chose a content-level assertion (the world wires the sword correctly) over
  re-testing the arithmetic in `use`, which lives in the I/O loop.

## Outcome
- `python -m unittest` → 4 tests, 4 passing (was 3).
- Dropping the sword or changing its buff now turns the suite red.

## Commands
```
python -m unittest
# -> Ran 4 tests ... OK
```

## Notes / related
- Pins the behaviour added in [0004 — Add a sword that buffs attack](0004-feat-add-sword-attack-buff.md).
