---
description: Write a timestamped handover snapshot of where the project stands, for the next agent.
argument-hint: "[focus / milestone label]"
model: inherit
---

Use the **dev-chronicler** skill, `handover` procedure, to write a point-in-time
handover snapshot for whoever (human or agent) picks this up next.

`$ARGUMENTS`, if present, is a focus or milestone label for the snapshot (it also
seeds the filename slug). Synthesize from recent `actions/` entries and any
open/recent `decisions/`: what works, what's in flight, what's next, and the
gotchas. This is what gets injected into the next session, so make it complete
but tight.

If the project isn't initialised yet, tell the user to run `/dev-chronicler:init`
first.
