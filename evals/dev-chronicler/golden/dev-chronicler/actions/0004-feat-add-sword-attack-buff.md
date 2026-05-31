# 0004 — Add a sword that buffs attack

**Date:** 2026-05-31

## What I did
- Added an optional `attack_bonus: int = 0` field to `Item` (engine.py).
- Placed a `sword` (attack_bonus=2) in the hall, alongside the goblin (content.py).
- Made the `use` command apply `hero.attack += item.attack_bonus` as well as the
  existing `heal` (main.py), per
  [decisions/0003 — Modelling item effects](../decisions/0003-item-effects-modeling.md).

## Outcome
- Playthrough: go north → take → use sword → attack rises 3→5, so the goblin
  (7 HP) falls in two hits instead of three.
- `engine.py` stayed I/O-free; only `main.py` mutates the hero's stats.

## Commands
```
printf 'go north\ntake\nuse sword\nattack\nattack\nquit\n' | python -m rpg
# -> "You use the sword. HP 10, attack 5." ... YOU WIN
```

## Notes / related
- Implements [decisions/0003 — Modelling item effects](../decisions/0003-item-effects-modeling.md);
  pinned by [0005 — Pin the sword's attack buff](0005-test-pin-sword-buff-test.md).
