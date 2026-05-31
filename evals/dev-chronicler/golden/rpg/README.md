# rpg/ — tiny text RPG

A two-room, text-only RPG: explore, grab a potion, and beat the goblin. Runs on
the Python 3 standard library, no dependencies
([ADR 0001](../dev-chronicler/decisions/0001-language-and-deps.md)).

## Run it

```
python -m rpg        # play
python -m unittest   # run the engine tests
```

## Files

| File | What it is | Notes |
|---|---|---|
| `engine.py` | Pure rules: `Entity`, `Item`, `Room`, `resolve_attack` | **I/O-free**, RNG injected — keep it that way so combat stays testable |
| `content.py` | `build_world()` — the hardcoded world | Hardcoded on purpose ([ADR 0002](../dev-chronicler/decisions/0002-hardcoded-vs-data-driven.md)) |
| `main.py` | Command parser + fight loop | The only module that does I/O; seams injected for scripted playthroughs |
| `__main__.py` | `python -m rpg` entry point | One line |
| `tests/test_engine.py` | Engine smoke tests | 3 cases ([action 0003](../dev-chronicler/actions/0003-engine-tests-green.md)) |

## Background

How this was built and why lives in the chronicle:
[decisions](../dev-chronicler/decisions/), [actions](../dev-chronicler/actions/),
and the [latest handover](../dev-chronicler/handovers/2026-05-31-1042-rpg-walking-skeleton.md).
