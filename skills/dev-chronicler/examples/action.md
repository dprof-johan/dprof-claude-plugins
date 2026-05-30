_Illustrative example bundled with the dev-chronicler skill. Not a real entry._

# 0052 — `_load_gt` crashed on empty `safetyChecks`; eval was under-reporting every model

**Date:** 2026-05-13

## What I did
- While inspecting guardrail "misses" in the cleanest 4.1-mini run (scored
  87.5%), noticed the numbers didn't add up: 9 rows scored 0, but only 1 had a
  real prediction/ground-truth diff.
- Traced the other 8 to a pydantic `ValidationError` raised inside
  `assertions.py::_load_gt`, not in the scoring logic. All 8 ship
  `"safetyChecks": {}` (the annotators' "no safety expectations" convention).
- Fixed it in three places: `GroundTruth.safetyChecks` is now `SafetyChecks |
  None` with a `before` validator coercing `{}`→`None`; `assert_safety`
  short-circuits to 1.0 when GT is absent; the aggregator excludes those rows
  from the safety mean (n drops 72→64) but keeps them in latency/token aggregates.
- Added 4 regression tests covering the schema, the assertion, and the aggregator skip.

## Outcome
- Every score in every prior run was depressed ~11 pp on each bucket (uniform
  bias, so model *ordering* held, but absolute numbers were wrong).
- Offline rescore (no API spend) of the two cleanest runs: guardrail
  88.9%→100% and 87.5%→98.6%; safety 73.6%→82.8% and 75.0%→84.4% (n=64).
- 157 tests pass; ruff clean. Meal rescore needs ~$0.10 of fresh judge calls — held for go-ahead.

## Commands
```powershell
uv run python scripts/rescore_offline.py experiments\r3-serial experiments\r4-serial
uv run pytest -q
```

## Notes / related
- [[decisions/0013-empty-safety-checks-as-na]] — the design decision this bug forced.
- Why it escaped: no test exercised the `{}` shape, and the aggregator silently
  absorbed `error` rows as score=0.
