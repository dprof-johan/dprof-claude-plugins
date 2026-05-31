---
description: Record an action-log entry for the work episode that just completed.
argument-hint: "[short description of the episode]"
model: inherit
---

Use the **dev-chronicler** skill, `action` procedure, to record a build-journal
entry for the work episode that just completed.

`$ARGUMENTS`, if present, is a hint about what the episode was about — use it to
pick the **type** (feat/fix/docs/refactor/test/chore), slug, and title, and to
focus the entry. If you're missing a concrete detail needed to write a faithful
entry (an exact command, an outcome, a number), ask a brief clarifying question
rather than guessing.

If the project isn't initialised yet, tell the user to run `/dev-chronicler:init`
first instead of creating stray files.
