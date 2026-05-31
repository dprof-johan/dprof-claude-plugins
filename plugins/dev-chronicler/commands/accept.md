---
description: Review decisions not yet Accepted (human-confirmed) and let the user confirm each.
argument-hint: "[NNNN to accept directly]"
model: inherit
---

Use the **dev-chronicler** skill, `accept` procedure.

**Accepted** means the *human* has confirmed a decision record is correct — so
only act on the user's explicit confirmation; never accept on their behalf.

If `$ARGUMENTS` names a decision number and the user has confirmed it, accept that
one directly. Otherwise list the pending (non-Accepted) decisions (`pending`),
show each briefly, ask which the user wants to accept, and run `accept <NNNN>` for
each they confirm. Leave the rest Proposed (and fix a record if they flag a problem).

If the project isn't initialised yet, tell the user to run `/dev-chronicler:init`
first.
