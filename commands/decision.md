---
description: Record (or, in propose mode, draft) an ADR for a non-trivial decision.
argument-hint: "[the decision to capture]"
---

Use the **dev-chronicler** skill, `decision` procedure, to capture a non-trivial
decision as an ADR.

`$ARGUMENTS`, if present, describes the decision to capture. Honour the current
**decision_log_mode**: in `propose` mode, draft the ADR and iterate with the
user before writing it; in `auto` mode, write it directly.

If the project isn't initialised yet, tell the user to run `/dev-chronicler:init`
first.
