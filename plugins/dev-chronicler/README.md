# dev-chronicler

A Claude Code plugin that keeps an automatic, human-readable **chronicle** of
the decisions and actions taken while developing a project — and feeds that
chronicle back to fresh agents as **handover memory** at the start of each
session.

It captures the practice of keeping a decision log (the *why*), an action log
(the *what*), and localized READMEs, and turns it into something that maintains
itself and primes the next agent automatically.

## What it creates in a project

A single visible folder (default `dev-chronicler/`) with three subfolders:

```
dev-chronicler/
├── decisions/   # ADRs — why a path was chosen (sequential NNNN)
├── actions/     # build journal — what was actually done (sequential NNNN)
└── handovers/   # point-in-time "where things stand" snapshots (timestamped)
```

Localized `README.md` files live next to the code they describe, not in this folder.

## Behaviour

- **Action entries are automatic.** After a meaningful work *episode* (not every
  file edit), the agent records what happened, asking a brief clarifying question
  if it's missing a concrete detail.
- **Decision entries are proposed by default.** When a non-trivial decision is
  made, the agent drafts an ADR and confirms with you before writing it. Flip
  `decision_log_mode` to `auto` to have it written directly.
- **Handover memory on session start.** A `SessionStart` hook injects the latest
  handover, recent action episodes, and recent decisions into a fresh agent's
  context — so it inherits the project's reasoning without you re-explaining it.
- **Dormant until you opt in.** Nothing happens in a project until you run
  `/dev-chronicler:init`. With no chronicle present, the hooks no-op silently, so
  installing the plugin globally is safe across all your repos.

## Install

```
/plugin marketplace add dprof-johan/dprof-claude-plugins
/plugin install dev-chronicler@dprof-claude-plugins
```

Then, in any project you want to chronicle: `/dev-chronicler:init`.

## Commands

All commands are namespaced and tab-completable as `/dev-chronicler:<name>`.

| Command | What it does |
|---|---|
| `/dev-chronicler:init` | Scaffold the chronicle + add a CLAUDE.md stub |
| `/dev-chronicler:action` | Record an action-log entry for the last episode |
| `/dev-chronicler:decision` | Record an ADR |
| `/dev-chronicler:handover` | Create a timestamped handover snapshot |
| `/dev-chronicler:readme` | Create/refresh a localized directory README |
| `/dev-chronicler:doctor` | Check chronicle health (links, wikilinks, placeholders, sections, types) |
| `/dev-chronicler:migrate` | Upgrade a chronicle made by an older plugin version |
| `/dev-chronicler:accept` | Review decisions and let the human mark them Accepted (confirmed) |

## Configuration

Set when the plugin is enabled (stored per-user); all optional:

| Option | Default | Meaning |
|---|---|---|
| `decision_log_mode` | `propose` | `propose` = draft ADRs and confirm; `auto` = write directly |
| `chronicle_root` | `dev-chronicler` | Name of the chronicle folder in a project |
| `stop_nudge` | `on` | `on` = gently remind to log if an episode looks unlogged; `off` = never |

## How it works

- The chronicle is driven by the `dev-chronicler` **skill** (the format and
  discipline) plus a small **engine** (`scripts/chronicle.js`) that allocates
  entry numbers atomically — so numbers never collide, even with concurrent
  subagents. There's no index to maintain: the `SessionStart` hook derives the
  recent-entries list live from the files, so it can't drift.
- The engine also offers `doctor` (validate links/wikilinks/placeholders/sections/
  types), `migrate` (upgrade an older chronicle), and `pending`/`accept`.
- Cross-links are **standard relative Markdown links** so they render on GitHub
  and in IDEs. Action files are named `NNNN-<type>-slug.md`.
- **Decision acceptance**: new ADRs are `Proposed`; the *human* marks them
  `Accepted` (confirmed correct) via `/dev-chronicler:accept` — the agent writes
  them and keeps working, never blocking on acceptance. `SessionStart` reminds it
  when some are pending.
- Three **hooks**: `SessionStart` (inject handover memory), `Stop` (an opt-in,
  heavily rate-limited reminder to log), and `PreToolUse` (a guard that blocks
  hand-creating files under the chronicle root, so entries always go through the
  engine — the engine writes via `fs`, not the Write tool, so it's never blocked).

The `chronicle_root` (and the legacy `CHRONICLE_ROOT` env var) are treated as
trusted configuration — they're joined to the project path without sanitising,
so don't point them at untrusted input.

## Principles & sources

The quality bar the skill/templates enforce isn't invented — it's drawn from
established, primarily-primary published guidance. Each rule below links to its
source. (Caveat: these are professional **conventions and expert opinion**, not
measured empirical evidence; the lab-notebook/SRE rules are adapted by analogy.)

**Decision records (ADRs)**

- One decision per record, kept short — *"Large documents are never kept up to
  date."* — Michael Nygard, [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (2011, primary) · Martin Fowler, [Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html) (primary).
- The Decision states a **rationale** ("…because…"); record a decision when it's a
  *justified design choice tied to a requirement* — [MADR](https://adr.github.io/madr/) (primary, v4.0.0).
- **Alternatives** list each serious option with pros/cons + why rejected — Fowler; MADR.
- **Consequences** include the negatives/neutral, not just upsides — Nygard.
- **Supersede, don't delete** a reversed decision — Nygard.

**Action / build-journal entries**

- Lead with a **typed prefix** (feat/fix/docs/refactor/test/chore) — [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) (primary).
- Structure as actions → **impact/outcome** → root cause → next step, written
  **blamelessly**, recording **negative results** — [Google SRE Book, *Postmortem Culture*](https://sre.google/sre-book/postmortem-culture/) (primary).
- Write **contemporaneously**, at episode altitude (what you did + learned) — *The
  Pragmatic Programmer*, "Engineering Daybook" (primary) · [Ten Simple Rules for a Lab Notebook](https://pmc.ncbi.nlm.nih.gov/articles/PMC4565690/) (peer-reviewed).
- **Reproducibility**: record how every result was produced (exact commands) —
  Ten Simple Rules; [Sandve et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3812051/) (peer-reviewed).
- **Curate for humans**, link rather than dump raw diffs — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Chris Beams, [How to Write a Git Commit Message](https://cbea.ms/git-commit/) (convention blogs).

These were gathered and adversarially fact-checked via the repo's own
[deep-research workflow](../../evals/dev-chronicler); the `evals/` golden chronicle is the worked example of the bar in practice.

## Requirements

- **Node.js** must be on `PATH` (the engine and hooks run via `node`). Node was
  chosen over Python specifically because the `node` command name is identical on
  Windows, macOS, and Linux, whereas `python` vs `python3` differs by platform.
  No npm dependencies — standard library only.

## Development

This plugin lives in the [`dprof-johan/dprof-claude-plugins`](https://github.com/dprof-johan/dprof-claude-plugins)
marketplace repo under `plugins/dev-chronicler/`. Run dev commands from this
plugin directory:

```bash
# from plugins/dev-chronicler/
claude --plugin-dir .      # load this working copy directly (no install)
# edit, then /reload-plugins in-session to pick up skill/command/hook changes;
# hook *scripts* take effect immediately (run fresh each time).

node --test                # run the test suite (engine + hooks + manifests)
npm run validate:json      # check the plugin JSON manifests parse

# validate the whole marketplace (manifests + frontmatter + hooks), from repo root:
claude plugin validate ..  # or:  cd ..  &&  claude plugin validate .
```

Tests are zero-dependency (`node:test`) and spin up throwaway project dirs to
exercise the engine and hook scripts (`engine`, `hooks`, `doctor`, `migrate`,
`manifests`). The skill/command markdown is prose, so it's validated
behaviourally (`--plugin-dir .`), not unit-tested.

See [`CHANGELOG.md`](CHANGELOG.md) for the per-version history.

## Status

Early (`0.4.x`). The `Stop` nudge is the most experimental piece; if it ever
feels noisy, set `stop_nudge` to `off`.

## Layout

```
plugins/dev-chronicler/
├── .claude-plugin/plugin.json   # manifest + userConfig
├── skills/dev-chronicler/SKILL.md  # the format spec, discipline, engine usage
├── commands/                    # init, action, decision, handover, readme, doctor, migrate, accept
├── hooks/hooks.json             # SessionStart + Stop wiring
├── scripts/chronicle.js         # the engine (numbering + doctor + migrate)
├── scripts/session_start.js     # SessionStart hook
├── scripts/stop_nudge.js        # Stop hook
├── scripts/pretool_guard.js     # PreToolUse hook (blocks hand-created entries)
└── CHANGELOG.md                 # per-version history
```

The repo root holds the marketplace manifest (`.claude-plugin/marketplace.json`)
that lists this plugin via `./plugins/dev-chronicler`.
