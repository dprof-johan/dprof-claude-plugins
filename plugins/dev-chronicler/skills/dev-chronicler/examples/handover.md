_Illustrative example bundled with the dev-chronicler skill. Not a real entry._

# Handover — end of optimisation phase, pre-submission

**Date:** 2026-05-14

## Where things stand
The three-agent pipeline (guardrail → meal → safety) is complete and green.
Canonical 72-sample eval has run for all enabled models. `gpt-4.1-mini` is the
recommended model ([actions/0049 — stage-3 sweep complete](../actions/0049-stage3-sweep-complete.md)). The README's results
table is generated from logged runs by `scripts/build_deliverable_table.py` —
**do not hand-edit numbers there.**

## What works
- Full suite: 157 tests, green. Lint clean.
- Eval harness + offline rescorer; results viewer at `localhost:8765`.
- Parallel guardrail+meal in the pipeline (~31% E2E P50 cut) — [decisions/0015 — parallel guardrail and meal](../decisions/0015-parallel-guardrail-and-meal.md).

## In flight / half-done
- Eval CLI and pipeline batch are still two code paths; unification deferred
  on purpose ([decisions/0011 — keep dual eval track](../decisions/0011-keep-dual-eval-track.md)). Fine to ship as-is.
- Meal composite ceilings ~78/100 on the meal bucket — believed to be annotator
  calibration, not a missing optimisation ([actions/0057 — generalist vs overfit](../actions/0057-generalist-vs-overfit.md)).

## Next steps
1. Final secrets scan across history before submission (gitleaks).
2. Re-run `build_deliverable_table.py` if any new canonical run lands.
3. Record the Loom walkthrough.

## Gotchas
- `safetyChecks: {}` samples are excluded from the safety mean (n=64) — see
  [decisions/0013 — empty safetyChecks as N/A](../decisions/0013-empty-safety-checks-as-na.md). The number is *meant* to be n=64.
- Promptfoo is pinned and run via `npx`; on a fresh Linux box it needs a working
  `better-sqlite3` native build ([actions/0065 — Linux promptfoo episode](../actions/0065-linux-promptfoo-episode.md)).
- Never commit `.env`; the key is project-scoped and rate-limited.
