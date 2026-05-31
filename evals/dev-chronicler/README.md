# dev-chronicler eval

An eval for the [`dev-chronicler`](../../plugins/dev-chronicler) plugin, built
around a small sample project and an exemplary ("golden") chronicle of how it was
built. It exists to (a) measure whether the plugin produces a good chronicle and
(b) double as a concrete showcase of what "good" looks like.

> Layout note: this lives at `evals/<plugin-name>/` so the repo can hold evals
> for more plugins over time.

## Contents

| Path | What it is |
|---|---|
| `fixture/` | The subject: a tiny, stdlib-only Python text RPG (`python -m rpg`). The thing a chronicle would describe. |
| `golden/` | The **ideal** end state: the fixture's chronicle (`golden/dev-chronicler/`) plus the localized `golden/rpg/README.md`. Hand-authored to exemplify the skill's "what good looks like." |
| `prompts/session.json` | A scripted prompt sequence that *should* reproduce a chronicle like the golden when run against a fresh copy of the fixture. Used by the future live runner; today it documents intent. |
| `structural-eval.js` | Phase-1 harness: objective, deterministic structural checks on a chronicle. Reuses the engine's `doctor`. |
| `structural.test.js` | Self-tests for the harness (golden passes 10/10; a deficient chronicle fails). |

## Phase 1 — structural eval (now)

Objective checks, no model, no golden comparison. Run it:

```bash
node evals/dev-chronicler/structural-eval.js            # scores the bundled golden
node evals/dev-chronicler/structural-eval.js <projectDir>  # score any chronicle
node evals/dev-chronicler/structural-eval.js --json     # machine-readable
```

It reuses `dev-chronicler doctor` (broken links, leftover wikilinks, unfilled
placeholders, missing sections) and adds coverage/cross-reference checks
(≥2 decisions, ≥2 actions, ≥1 handover, decisions↔actions cross-linked, the
latest handover references entries, a localized README links back in). Exit code
is non-zero if any check fails, so it gates CI against the golden.

The fixture itself is real and runnable:

```bash
cd evals/dev-chronicler/fixture
python -m rpg        # play
python -m unittest   # 3/3 green
```

## Phase 2 — LLM-as-judge (next)

A deeper eval that judges the *content* of an agent-generated chronicle against
the golden output files with an LLM rubric (altitude, the "resume test",
reasoning quality, faithful outcomes). This is intentionally **not** a CI gate —
it's costly and non-deterministic. The golden files here are the baseline it
compares against; tweak them to define the target.

## How the pieces fit

`prompts/session.json` → (live runner, future) → a fresh chronicle →
`structural-eval.js` scores its structure → (Phase 2) an LLM judge compares its
content to `golden/`.
