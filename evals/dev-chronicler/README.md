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
| `judge.js` | Phase-2 LLM-as-judge: scores a candidate chronicle against the golden on a rubric (1–5 per dimension). |
| `judge.test.js` | Self-tests for the judge, using the deterministic `mock` backend (no model, CI-safe). |

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

## Phase 2 — LLM-as-judge

Judges the *content* of a candidate chronicle against the golden on a rubric
(coverage & altitude, decision reasoning, faithful outcomes, the "resume test",
linking & handover), scoring each 1–5 with a rationale plus an overall. Run it:

```bash
node evals/dev-chronicler/judge.js <candidateDir>     # judge a chronicle vs the golden
node evals/dev-chronicler/judge.js                    # golden-vs-golden smoke test
node evals/dev-chronicler/judge.js <dir> --json       # machine-readable verdict
node evals/dev-chronicler/judge.js <dir> --min 4      # exit non-zero if overall < 4
```

It is intentionally **not** a CI gate — judging content is costly and
non-deterministic. The golden files are the baseline it compares against; tweak
them to define the target. (Only the `mock`-backed `judge.test.js` runs in CI.)

### Backends and billing

Pick with `--backend` or `$DEVCHRON_JUDGE_BACKEND`:

- **`cli`** (default) — shells out to `claude -p`. It uses whatever the Claude
  Code CLI is logged into, and the harness **scrubs `ANTHROPIC_API_KEY`** from the
  child environment so a Pro/Max **subscription** login is used rather than
  pay-per-token API billing. Pass `--model sonnet|opus|haiku` to choose the model.
  > Note: per Anthropic's announced billing change (~June 2026), subscription
  > `claude -p` usage may draw from a separate "Agent SDK credit" allotment
  > rather than your interactive limits — verify against your account.
- **`api`** — calls the Anthropic Messages API directly (needs
  `ANTHROPIC_API_KEY`); predictable pay-per-token billing. `--model` sets the
  model (default `claude-sonnet-4-6`).
- **`mock`** — deterministic heuristic stand-in (no model/auth/network); used by
  the self-tests and handy for checking plumbing.

The live `cli`/`api` runs were validated for plumbing via the `mock` backend and
the documented commands; running them for real spends subscription or API quota.

## How the pieces fit

`prompts/session.json` → (live runner, future) → a fresh chronicle →
`structural-eval.js` scores its structure → (Phase 2) an LLM judge compares its
content to `golden/`.
