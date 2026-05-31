# Decisions

Lightweight ADRs (Architecture Decision Records). One decision per file,
numbered sequentially. Captures **why** a path was chosen.

## Format

```
# NNNN — Title

**Date:** YYYY-MM-DD

## Context
## Decision
## Alternatives considered
## Consequences
## Related
```

## Conventions

- A decision is in force simply by existing — there is no Proposed/Accepted
  status to maintain.
- Err on too much detail — easier to trim later than to reconstruct.
- Cross-link with **standard relative Markdown links** (they render on GitHub
  and in IDEs): `[NNNN — Title](NNNN-slug.md)` for another decision,
  `[actions/NNNN — Title](../actions/NNNN-slug.md)` for an action.
- When a decision is reversed, **don't delete it.** Add a
  `**Superseded by:** [NNNN — Title](NNNN-slug.md)` line near the top, pointing
  at its replacement. The history is the value.
