---
description: Scaffold the dev-chronicler chronicle (decisions/actions/handovers) into this project and add a CLAUDE.md stub.
argument-hint: "[root-folder-name]"
model: sonnet
---

Use the **dev-chronicler** skill, `init` procedure, to scaffold the development
chronicle in this project.

**Scaffold by running the engine — do NOT create the folders, the
`.chronicler.json` marker, or the READMEs by hand.** The skill's `init` procedure
gives the exact command (`node "${CLAUDE_SKILL_DIR}/../../scripts/chronicle.js"
init`). Run that; it creates the folders, the marker, and the README scaffolding.
Hand-rolling them produces a broken chronicle (no marker, wrong filenames).

If `$ARGUMENTS` is non-empty, treat it as the desired root folder name (pass it as
`--root <name>`); otherwise use the default (`dev-chronicler`), unless the project
already has an established decision/action log folder worth reusing — in which
case ask before choosing.

After scaffolding, write (or append) the CLAUDE.md stub as described in the skill.

**Then activate the chronicle for the rest of *this* session** — don't wait for a
restart. The `SessionStart` hook only primes *future* sessions, so from now on in
this conversation follow the dev-chronicler discipline directly: record an action
after each meaningful work episode, propose/record decisions as they're made, and
write handovers — always **through the engine** (`allocate`/`handover`), never by
hand. Tell the user the chronicle is now active for this session.
