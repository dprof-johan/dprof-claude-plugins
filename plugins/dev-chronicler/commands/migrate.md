---
description: Bring an older chronicle up to the current format (drop index blocks & Proposed/Accepted status, convert wikilinks to relative links).
argument-hint: ""
model: inherit
---

Use the **dev-chronicler** skill, `migrate` procedure, to upgrade a chronicle
that was created by an earlier version of the plugin.

Run the engine's `migrate` subcommand. By default it rewrites files in place;
mention that `--dry-run` previews the changes first. After migrating, run
`doctor` to confirm the chronicle is clean, and report what changed.

If the project isn't initialised yet, tell the user to run `/dev-chronicler:init`
first.
