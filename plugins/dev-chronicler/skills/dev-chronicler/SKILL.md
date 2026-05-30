---
name: dev-chronicler
description: >-
  Maintain this project's development chronicle — a human-readable log of
  decisions and actions that doubles as handover memory for agents. Use when a
  meaningful work episode just finished (record an action), when a non-trivial
  decision was made (record/propose a decision), when scaffolding the chronicle
  in a project (init), when writing a handover summary, or when creating a
  localized README for a directory. Also consult it whenever you are about to
  write into the chronicle and need the format and discipline.
argument-hint: "[init|action|decision|handover|readme] [topic]"
allowed-tools: Bash, Read, Edit, Write, Glob
---

# dev-chronicler

Keep a development **chronicle** that serves two readers at once:

1. **A human** — a narrative of what was done and why, skimmable later.
2. **A future agent** — handover memory, injected at the start of each session
   so a fresh agent inherits the project's reasoning and recent work.

The chronicle lives in a visible folder (default `dev-chronicler/`) with three
subfolders:

| Subfolder | Captures | Numbering |
|---|---|---|
| `decisions/` | **why** a path was chosen (ADRs) | sequential `NNNN` |
| `actions/` | **what** was actually done (build journal) | sequential `NNNN` |
| `handovers/` | **where things stand** (point-in-time snapshots) | timestamped |

## The engine

All entry numbering goes through one script, so numbers are allocated
atomically (safe even if subagents log concurrently). Invoke it as:

```
node "${CLAUDE_SKILL_DIR}/../../scripts/chronicle.js" <subcommand> [args]
```

Subcommands:

- `init [--root <name>]` — scaffold the chronicle (folders + READMEs + marker).
- `allocate decision|action --slug <slug> [--title "<title>"]` — atomically
  reserve the next `NNNN` and create a skeleton entry; **prints the file path**
  for you to fill in.
- `handover --slug <slug>` — print the path for a new timestamped handover.
- `status` — JSON: whether the chronicle is active, plus counts and latest entries.

There is no index to maintain: the folder listing *is* the index for a human
browsing, and the `SessionStart` hook derives the recent-entries list live from
the files, so it can never drift.

Run `status` first if unsure whether the project is initialised.

## Gating — only act when the project opted in

The chronicle is active only when `<root>/.chronicler.json` exists (created by
`init`). If you're asked to log but the project isn't initialised, **don't
create stray files** — tell the user to run `/dev-chronicler:init` first.

---

## Procedure: `action` — record a work episode

Add an entry **after a meaningful work episode**, not after every file edit
(`git log` already captures edits). An episode is something a future reader
would want as a discrete unit: installing/configuring tooling, a non-trivial
command run, resolving a class of issues, a push / CI validation, an
experiment or eval run, hitting unexpected behaviour and handling it.

This is **automatic** — when such an episode completes, log it without being
asked. If you're missing a detail you need to write a faithful entry (the exact
command, the outcome, a number), **ask the user a brief clarifying question**
rather than guessing or padding.

Steps:

1. Choose a short kebab-case `slug` and a human title.
2. `allocate action --slug <slug> --title "<title>"` → get the file path.
3. Fill in the skeleton with `Edit`:
   - **What I did** — bullets, concrete.
   - **Outcome** — what resulted (numbers, pass/fail, what changed).
   - **Commands** — the exact commands run, in a fenced block.
   - **Notes / related** — link decisions with a relative path, e.g.
     `[decisions/NNNN — Title](../decisions/NNNN-slug.md)`.
4. Err on too much detail — easier to trim later than to reconstruct.

## Procedure: `decision` — record/propose an ADR

A decision is non-trivial if a reasonable reviewer would ask "why did you do it
that way?" — architecture, model/library choice, scope cut, a deviation from a
brief, a trade-off. Renames, formatter choices, and obvious wiring do not need one.

Behaviour depends on **decision_log_mode** (surfaced at session start):

- **propose** (default): draft the ADR content in the conversation first, ask
  what should go in it, iterate on phrasing with the user, and only write the
  file once they're happy.
- **auto**: write the ADR directly without the confirmation round-trip.

Steps:

1. Choose a `slug` and title.
2. `allocate decision --slug <slug> --title "<title>"` → get the file path.
3. Fill in: **Context** (situation/constraint/trigger), **Decision** (the choice,
   plainly), **Alternatives considered** (each rejected option + why),
   **Consequences** (what it commits us to, what we now can't do).
4. Cross-link related ADRs with a relative path: `[NNNN — Title](NNNN-slug.md)`
   for another decision, `[actions/NNNN — Title](../actions/NNNN-slug.md)` for an action.
5. **Supersede, don't delete.** A decision is in force simply by existing —
   there's no Proposed/Accepted status to set. When a decision is *reversed*,
   leave the old file in place and add a `**Superseded by:** [NNNN — Title](NNNN-slug.md)`
   line near the top, pointing at its replacement — the history is the value. (The
   `SessionStart` hook surfaces that marker so a fresh agent won't follow a
   reversed decision.)

## Procedure: `handover` — snapshot where things stand

A handover is a fresh-agent briefing: current state, what's in flight, open
questions, next steps, gotchas. It's the first thing injected next session.

Steps:

1. `handover --slug <short-slug>` → get a timestamped path.
2. Write the file at that path: a concise but complete snapshot. Pull from recent
   `actions/` and any open/recent `decisions/`. Favour: *what works, what's
   half-done, what's next, what would trip someone up.*

## Procedure: `init` — scaffold the chronicle

1. Confirm the root folder name (default `dev-chronicler`; honour an existing
   one if the project already has decision/action logs).
2. Run `init [--root <name>]`.
3. Write a short **CLAUDE.md stub** into the project so the behaviour is on even
   when this skill isn't loaded. Keep it terse and point here for detail, e.g.:

   ```markdown
   ## dev-chronicler

   This project keeps a development chronicle in `dev-chronicler/`
   (decisions/ = why, actions/ = what, handovers/ = where things stand).

   - After a meaningful work *episode*, record an action entry (not per edit).
   - When a non-trivial decision is made, propose an ADR (or write it directly
     if decision_log_mode = auto).
   - Cross-link with relative Markdown links; supersede ADRs rather than deleting them.
   - See the `dev-chronicler` skill for the format and the engine commands.
   ```

   If a `CLAUDE.md` already exists, append this section; don't clobber it.

## Procedure: `readme` — localized directory README

A first-class part of the chronicle: a `README.md` *next to the code* in a
subsystem directory, orienting a reader and linking back into the chronicle.
Good ones include: what the directory is for, a status table of the notable
files, "kept-for-audit / delete-safe" annotations for throwaway artifacts, and
back-links like `(see actions/0012, ADR 0007)`. Create or refresh it in place
(it does **not** live under the chronicle root).

---

## What a good entry looks like

The chronicle is only useful if a future reader — especially a fresh agent —
can actually rely on it. Hold every entry to these:

- **The resume test.** Could someone pick up the work from this entry alone,
  without asking you to re-explain? If not, it's missing context.
- **Concrete outcomes, not vibes.** "Ran the tests ✅" is nearly useless. Give
  numbers, pass/fail, before→after, and the file/commit/experiment it refers to.
- **Reasoning, not just narration.** For decisions especially: the constraint,
  the options you ruled out, and *why*. "Chose Postgres" tells a reviewer nothing.
- **Negative results are first-class.** An experiment you tried and reverted,
  with the reason, is as valuable as a win — it stops the next agent re-running it.
- **Self-contained but linked.** Cross-link with relative Markdown links instead
  of duplicating; don't make the reader hunt, but don't restate a whole ADR either.
- **Right altitude.** Action = work *episode*, not keystrokes. Decision =
  something a reviewer would question, not a rename or a formatter choice.

Quick contrasts:

| Weak | Good |
|---|---|
| "Ran the tests. ✅" | "`pytest -q` → 157 tests, 4 failing in scoring on empty `safetyChecks`; coerced `{}`→None in `GroundTruth`, suite green. [decisions/0013 — empty safetyChecks as N/A](../decisions/0013-empty-safety-checks-as-na.md)" |
| "Switched to Postgres." | Context (SQLite write-locking under the eval harness), Decision, Alternatives (kept-SQLite rejected because…), Consequences (ops cost, a migration step). |
| "Tweaked the prompt." | "meal_v4 added a rubric + glycemic fields: no score lift, +45% per-sample cost. Reverted; meal_v1 stays locked. [0048 — meal-v4 sweep](0048-meal-v4-sweep.md)" |

Worked examples live alongside this skill in `examples/` — read them when you
want a concrete model for an action, a decision, or a handover:

- `examples/action.md` — a bug-fix episode (symptom → blast radius → fix → why it wasn't caught).
- `examples/decision.md` — an ADR with real alternatives and consequences.
- `examples/handover.md` — a snapshot that primes the next agent.

## Conventions (all entry types)

- **Err on too much detail.** Trimming later is cheap; reconstruction isn't.
- **Cross-link** with standard relative Markdown links so they render on GitHub
  and in IDEs: `[NNNN — Title](NNNN-slug.md)` within the same folder,
  `[actions/NNNN — Title](../actions/NNNN-slug.md)` or
  `[decisions/NNNN — Title](../decisions/NNNN-slug.md)` across folders.
- **Supersede, don't delete.** Reverse a decision by adding a
  `**Superseded by:** [NNNN — Title](NNNN-slug.md)` line to the old ADR, not by removing it.
- **Negative results are first-class.** A reverted experiment, documented with
  the reasoning, is as valuable as a win.
