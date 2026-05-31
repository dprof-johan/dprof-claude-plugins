# 0002 — Fight loop and command parser

**Date:** 2026-05-30

## What I did
- Wrote `main.py` — the only module that does I/O — with a `run(input_fn,
  output_fn, roll)` loop. Injecting the three I/O seams means a scripted
  playthrough can drive the whole game without a terminal.
- Implemented the command parser: `look`, `go <dir>`, `take`, `use <item>`,
  `attack`, `quit`, plus a help fallback for unknown input.
- Wired win/lose: attacking trades blows via `resolve_attack`; killing the goblin
  prints `YOU WIN` and returns; hero HP reaching 0 prints `GAME OVER`.
- Added `__main__.py` so the game runs as `python -m rpg`.

## Outcome
- A scripted playthrough (take potion → go north → attack ×3) reaches `YOU WIN`.
- The hero can die if you skip the potion and trade enough blows — both branches
  exercised by hand.

## Commands
```
printf 'take potion\ngo north\nattack\nattack\nattack\nquit\n' | python -m rpg
# -> ends in: YOU WIN
```

## Notes / related
- Builds on [0001 — Scaffold the engine and hardcoded world](0001-scaffold-engine-and-world.md); uses `resolve_attack` from the engine.
