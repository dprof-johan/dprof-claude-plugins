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
argument-hint: "[init|action|decision|handover|readme|doctor|migrate|accept] [topic]"
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

**Always go through this engine, and only this one.** Two rules that matter:

- **Never hand-create files** in `decisions/`, `actions/`, or `handovers/`. The
  engine assigns the number, the action type, the `Status`, the filename, and the
  skeleton — improvising a file by hand produces malformed names (e.g. date-prefixed)
  that break numbering and fail `doctor`.
- **Use the engine bundled with *this* loaded skill** at the path above. Do **not**
  go searching `~/.claude/plugins/cache` for a "latest" version — you're already
  running the right one; reading another cached copy will use the wrong format.

Subcommands:

- `init [--root <name>]` — scaffold the chronicle (folders + READMEs + marker).
- `allocate decision --slug <slug> [--title "<title>"]` — reserve the next `NNNN`
  decision and create a skeleton; **prints the file path** for you to fill in.
- `allocate action --type <feat|fix|docs|refactor|test|chore> --slug <slug> [--title "<title>"]`
  — same, for an action. The **type is required** and goes in the filename
  (`NNNN-<type>-slug.md`).
- `handover --slug <slug> [--title "<title>"]` — create a timestamped handover
  from a skeleton and **print its path** for you to fill in.
- `status` — JSON: whether the chronicle is active, plus counts and latest entries.
- `pending [--json]` — list decisions not yet **Accepted** (human-confirmed).
- `accept <NNNN>` — mark a decision **Accepted**. Run this only when the *human*
  has confirmed the record; never set it yourself unprompted.
- `doctor [--json]` — check health: broken relative links, leftover
  `[[wikilinks]]`, unfilled placeholders, missing sections, plus cheap quality
  checks (action type in filename, decision has a Status, Commands non-empty).
- `migrate [--dry-run]` — bring a chronicle made by an older version up to the
  current format (drop index blocks, convert old `Status: Superseded` + wikilinks).

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

1. Choose a short kebab-case `slug`, a human title, and a **type** — one of
   `feat | fix | docs | refactor | test | chore` (Conventional Commits; classifies
   the episode and goes in the filename).
2. `allocate action --type <type> --slug <slug> --title "<title>"` → get the path.
3. Fill in the skeleton with `Edit`:
   - **What I did** — what changed and **why** (the intent), not keystrokes.
   - **Outcome** — concrete result with evidence: numbers, pass/fail, before→after.
     Record **what failed or you ruled out** too — negative results stop the next
     agent repeating a dead end. Keep it blameless and factual.
   - **Commands** — the **exact, runnable** commands, in a fenced block, so the
     result can be reproduced (pair outcomes with the command that produced them).
   - **Notes / related** — why it mattered / next step; link a decision with a
     relative path, e.g. `[decisions/NNNN — Title](../decisions/NNNN-slug.md)`.
4. Right altitude: one entry per *episode*, written while it's fresh — not per
   file-edit, not per keystroke.

## Procedure: `decision` — record/propose an ADR

A decision is non-trivial if a reasonable reviewer would ask "why did you do it
that way?" — architecture, model/library choice, scope cut, a deviation from a
brief, a trade-off. Renames, formatter choices, and obvious wiring do not need one.

Behaviour depends on **decision_log_mode** (surfaced at session start):

- **propose** (default): draft the ADR content in the conversation first, ask
  what should go in it, iterate on phrasing with the user, and only write the
  file once they're happy.
- **auto**: write the ADR directly without the confirmation round-trip.

Record a decision when there is a **justified design choice tied to a real
requirement** (MADR's test) — not for renames or obvious wiring.

Steps:

1. Choose a `slug` and title.
2. `allocate decision --slug <slug> --title "<title>"` → get the file path. It
   starts at **`**Status:** Proposed`** (see acceptance below).
3. Fill in:
   - **Context** — the *forces* at play (technical, product, constraints) and the
     trigger; value-neutral.
   - **Decision** — the choice plainly, **with its rationale**: "we will X
     **because** Y". The *because* is required (MADR).
   - **Alternatives considered** — each serious option with its **pros/cons and
     why it was rejected** — not a bare list of names (Fowler).
   - **Consequences** — what it commits us to, including the **negative and neutral**
     consequences and follow-on obligations, not just the upsides (Nygard).
4. Cross-link related ADRs with a relative path: `[NNNN — Title](NNNN-slug.md)`
   for another decision, `[actions/NNNN-type — Title](../actions/NNNN-type-slug.md)` for an action.
5. **Supersede, don't delete.** When a decision is *reversed*, leave the old file
   and add a `**Superseded by:** [NNNN — Title](NNNN-slug.md)` line near the top
   (Nygard). This is a separate axis from Status (below).

### Acceptance (human-confirmed correctness)

New decisions are **Proposed**. **Accepted** means a *human* has confirmed the
record is correct — so **only the human grants it**, via `/dev-chronicler:accept`.
**Never wait** for acceptance and never set it yourself: write the ADR Proposed and
keep working. At a natural pause (the `SessionStart` hook will remind you when some
are pending), offer to walk the user through accepting — `pending` lists them,
`accept <NNNN>` marks one. (This is distinct from **decision_log_mode** above,
which only governs whether you draft-and-confirm *content* before writing.)

## Procedure: `handover` — snapshot where things stand

A handover is a fresh-agent briefing: current state, what's in flight, open
questions, next steps, gotchas. It's the first thing injected next session.

Steps:

1. `handover --slug <short-slug> [--title "<title>"]` → creates a timestamped
   file from a skeleton and prints its path.
2. Fill in that file with `Edit`: a concise but complete snapshot. Pull from
   recent `actions/` and any open/recent `decisions/`. Favour: *what works,
   what's half-done, what's next, what would trip someone up.*

## Procedure: `init` — scaffold the chronicle

1. Confirm the root folder name (default `dev-chronicler`; honour an existing
   one if the project already has decision/action logs).
2. **Scaffold with the engine — run exactly this** (do not `mkdir` the folders or
   write the marker/READMEs by hand):

   ```
   node "${CLAUDE_SKILL_DIR}/../../scripts/chronicle.js" init
   ```

   (append `--root <name>` for a custom folder). This creates the folders, the
   `.chronicler.json` marker (the gate the hooks rely on), and the README
   scaffolding. A hand-rolled init has no marker, so the hooks never fire.
3. Write a short **CLAUDE.md stub** into the project so the behaviour is on even
   when this skill isn't loaded. Keep it terse and point here for detail, e.g.:

   ```markdown
   ## dev-chronicler

   This project keeps a development chronicle in `dev-chronicler/`
   (decisions/ = why, actions/ = what, handovers/ = where things stand).

   - After a meaningful work *episode*, record an action entry (not per edit);
     actions carry a type (feat/fix/docs/refactor/test/chore) in the filename.
   - When a non-trivial decision is made, write an ADR with a "because" rationale,
     real alternatives, and the downsides. New ADRs are Proposed; only the human
     marks them Accepted (`/dev-chronicler:accept`) — never wait on that.
   - Cross-link with relative Markdown links; supersede ADRs rather than deleting them.
   - See the `dev-chronicler` skill for the format and the engine commands.
   ```

   If a `CLAUDE.md` already exists, append this section; don't clobber it.

4. **Activate in this session.** The `SessionStart` hook is gated on the chronicle
   already existing, so it primes only *future* sessions — not the one you just
   ran `init` in. So don't tell the user to restart: continue *this* session with
   the chronicle active, following the action/decision/handover discipline from
   now on. (Future sessions get primed automatically by the hook.)

## Procedure: `readme` — localized directory README

A first-class part of the chronicle: a `README.md` *next to the code* in a
subsystem directory, orienting a reader and linking back into the chronicle.
Good ones include: what the directory is for, a status table of the notable
files, "kept-for-audit / delete-safe" annotations for throwaway artifacts, and
back-links into the chronicle. Create or refresh it in place (it does **not**
live under the chronicle root).

Make the back-links **real relative links** so they're clickable on GitHub and
in IDEs — compute the path from this directory up to the chronicle root, e.g.
from `src/eval/` to a decision: `[ADR 0007](../../dev-chronicler/decisions/0007-slug.md)`.

## Procedure: `doctor` — check chronicle health

Run `doctor` to validate the chronicle and report issues:

1. `doctor` (add `--json` for machine-readable output).
2. Summarise: **errors** (broken relative links, leftover `[[wikilinks]]`) first,
   then **warnings** (unfilled skeleton placeholders, missing sections).
3. Offer to fix the concrete ones — a broken link usually means a wrong relative
   path or a renamed file; a wikilink should become a relative Markdown link.

## Procedure: `accept` — let the human confirm decisions

**Accepted** = a human has confirmed the decision record is correct. You never set
it yourself and you never block on it.

1. `pending` → list decisions still **Proposed**.
2. For each, briefly show the user the decision and ask whether it's correct.
3. On their yes, `accept <NNNN>`. On no, leave it Proposed (and fix the record if
   they point out a problem).

Surface this at a natural pause when the `SessionStart` hook reports pending
decisions — don't interrupt mid-task, and don't wait for the answer to continue.

## Procedure: `migrate` — upgrade an older chronicle

For a chronicle created by an earlier plugin version (it still has `## Index`
blocks, an old `**Status:** Superseded by NNNN` line, or `[[wikilinks]]`):

1. `migrate --dry-run` → preview which files would change.
2. `migrate` → rewrite in place: drop index blocks, convert `[[wikilinks]]` to
   relative links, and turn an old `**Status:** Superseded by NNNN` into a
   `**Superseded by:** [link]` marker. (Proposed/Accepted status lines are kept.)
3. `doctor` → confirm the result is clean. Note: old action files won't have a
   type prefix in their name; `doctor` will warn — rename them `NNNN-<type>-slug`.

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
| "Tweaked the prompt." | "meal_v4 added a rubric + glycemic fields: no score lift, +45% per-sample cost. Reverted; meal_v1 stays locked. [0048 — meal-v4 sweep](0048-test-meal-v4-sweep.md)" |

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
- **Reproducibility.** Record how every result was produced (exact commands), in
  enough detail to re-derive it.
- **Write while it's fresh, at episode altitude.** Contemporaneous, curated for a
  human reader — link to artifacts rather than pasting raw diffs/logs.

These conventions are drawn from published practice — Nygard's ADRs, Fowler,
MADR, Conventional Commits, the Google SRE postmortem culture, the Pragmatic
Programmer's engineering daybook, and lab-notebook reproducibility rules. See the
plugin **README → "Principles & sources"** for the citations.
