# 0001 — Language and dependencies

**Date:** 2026-05-30

## Context

We want a tiny, self-contained text RPG that runs with a single command and zero
setup, on any OS. It's a teaching/demo artifact, not a product, so build speed
and "clone-and-run" matter more than performance or extensibility.

## Decision

Write it in **Python 3 using the standard library only** — no third-party
packages, no build step. Run it with `python -m rpg`; test it with
`python -m unittest`.

## Alternatives considered

- **Node.js / JavaScript.** Rejected: a text RPG needs nothing Node offers over
  Python here, and Python's stdlib `unittest` plus `dataclasses` keep the sample
  shorter and more readable for a demo.
- **A game framework (e.g. pygame, a TUI library).** Rejected: overkill for a
  two-room, text-only loop, and it reintroduces the dependency we're avoiding.

## Consequences

- Zero install beyond a Python 3 interpreter (already common on dev machines and
  CI images).
- We hand-roll the command parser and the fight loop — fine at this size.
- Python must be present to run it; an accepted cost for a demo.

## Related
- [0002 — Hardcoded world vs data-driven content](0002-hardcoded-vs-data-driven.md) — builds on this one.
- [actions/0001 — Scaffold the engine and hardcoded world](../actions/0001-scaffold-engine-and-world.md) — where this was first applied.
