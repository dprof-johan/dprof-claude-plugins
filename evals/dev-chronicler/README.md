# dev-chronicler eval

An eval for the [`dev-chronicler`](../../plugins/dev-chronicler) plugin, built
around a small sample project. The scenario: a tiny text RPG that already has a
chronicle (the **seed**), then a single, tightly-specified extension (add a sword
that buffs attack). The eval measures whether the plugin chronicles that
extension well — and the **golden** doubles as a concrete showcase of "good."

Keeping the code change tiny and the prompts very specific keeps variance low, so
the signal is about the *plugin's* output (the new ADR, actions, README update,
and handover), not about how the agent codes.

The golden embodies the plugin's **sourced quality bar** (typed action filenames,
decision `Status`, "because" rationales, alternatives with pros/cons, negative
results, reproducible commands). The judge's rubric scores candidates against
those same principles — see the plugin README's "Principles & sources".

> Layout note: this lives at `evals/<plugin-name>/` so the repo can hold evals
> for more plugins over time.

## Contents

| Path | What it is |
|---|---|
| `seed/` | The project **before** the extension: the RPG (`python -m rpg`) + its existing chronicle (ADRs 0001–0002, actions 0001–0003, a handover). The runner copies this as the starting point. |
| `golden/` | The **expected** project **after** the extension: `seed/` advanced by the sword change — ADR 0003, actions 0004–0005, an updated `rpg/README.md`, and a new handover. The judge's reference standard; tweak it to define the target. |
| `prompts/session.json` | The very specific extension prompts the runner feeds to a headless `claude -p`. |
| `runner.js` | End-to-end: copy `seed/` → temp, drive the prompts via `claude -p`, then run the structural eval + judge on the result vs `golden/`. |
| `runner.test.js` | Runner plumbing self-test via `--dry-run` (copy + eval chaining, no model). |
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

The sample projects are real and runnable:

```bash
cd evals/dev-chronicler/seed     # base RPG (pre-extension)
python -m rpg                    # play
python -m unittest               # 3/3 green

cd ../golden                     # post-extension (with the sword)
python -m unittest               # 4/4 green
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

## End-to-end runner

`runner.js` ties it together: copy `seed/` → temp, drive `prompts/session.json`
through a headless `claude -p` (plugin loaded, `decision_log_mode=auto`) to make
the sword extension and chronicle it, then score the result with the structural
eval and the judge versus `golden/`.

```bash
node evals/dev-chronicler/runner.js               # full live run (uses your subscription via claude -p)
node evals/dev-chronicler/runner.js --keep        # keep the temp project to inspect what was generated
node evals/dev-chronicler/runner.js --json        # machine-readable combined result
node evals/dev-chronicler/runner.js --dry-run      # copy seed + score it, NO model (plumbing only)
```

It generates with `--dangerously-skip-permissions` so the headless agent can edit
files and run the tests unattended (pass `--no-skip-permissions` to opt out). The
live path is non-deterministic and spends quota, so it is **never** a CI gate —
only the `--dry-run` self-test runs in CI.

> The live generation path (5 `claude -p` turns that edit files and run Python in
> headless mode) was built and its plumbing validated via `--dry-run`; the first
> real end-to-end generation is best run on your machine, where your subscription
> is logged in.

## How the pieces fit

`seed/` → `runner.js` copies it → `prompts/session.json` drive `claude -p` to
generate the extension chronicle → `structural-eval.js` scores structure →
`judge.js` compares content to `golden/`.
