_Illustrative example bundled with the dev-chronicler skill. Not a real entry._

# 0013 — Empty `safetyChecks` ground truth treated as N/A for the safety bucket

**Date:** 2026-05-13

## Context

8 of the 72 dataset ground-truth files ship `"safetyChecks": {}` (an empty
object) alongside full `guardrailCheck` and `mealAnalysis` blocks — the
annotators' convention for "no safety expectations for this benign sample."
A crash on this shape was masking ~11 pp of score on every model
([actions/0052 — load-gt empty-safetyChecks fix](../actions/0052-load-gt-empty-safety-checks-fix.md)). The fix is settled; the open
question is how those 8 samples *should* score once they parse.

## Decision

Exclude samples with empty `safetyChecks` from the **safety score mean**
(n=64, not 72). They still count toward latency and token aggregates — the agent
ran on them; the work just isn't scoreable against an absent ground truth.

## Alternatives considered

- **Score them as implicit all-True** (no safety concerns expected → reward the
  model for finding none). Rejected: inflates the safety mean by ~11 pp with
  unearned points, and conflates "correctly cautious" with "nothing to find."
- **Keep them at 0** (the pre-fix behaviour). Rejected: penalises the model for
  ground truth that doesn't exist; it's the bug, not a policy.
- **Drop the 8 samples entirely** from all metrics. Rejected: their latency and
  token costs are real and belong in those aggregates.

## Consequences

- The safety bucket reports `mean (n=64)` and the README must state the n
  explicitly so the number isn't mistaken for the full set.
- Comparisons across models stay fair (same 64 samples for everyone).
- One more place where the eval departs from naive "score all 72" — documented
  here so it reads as judgment, not an oversight.

## Related
- [actions/0052 — load-gt empty-safetyChecks fix](../actions/0052-load-gt-empty-safety-checks-fix.md) — the episode that surfaced this.
- [0009 — F1 for ingredient scoring](0009-f1-for-ingredient-scoring.md) — the other deliberate departure from brief literalism.
