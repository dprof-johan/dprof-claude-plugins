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
  handover, recent action episodes, and the decision index into a fresh agent's
  context — so it inherits the project's reasoning without you re-explaining it.
- **Dormant until you opt in.** Nothing happens in a project until you run
  `/dev-chronicler:init`. With no chronicle present, the hooks no-op silently, so
  installing the plugin globally is safe across all your repos.

## Install

```
/plugin marketplace add dprof-johan/claude-plugins-dev-chronicler
/plugin install dev-chronicler@dev-chronicler
```

Then, in any project you want to chronicle: `/dev-chronicler:init`.

## Commands

All commands are namespaced and tab-completable as `/dev-chronicler:<name>`.

| Command | What it does |
|---|---|
| `/dev-chronicler:init` | Scaffold the chronicle + add a CLAUDE.md stub |
| `/dev-chronicler:action` | Record an action-log entry for the last episode |
| `/dev-chronicler:decision` | Record (or, in propose mode, draft) an ADR |
| `/dev-chronicler:handover` | Write a timestamped handover snapshot |
| `/dev-chronicler:readme` | Create/refresh a localized directory README |

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
  entry numbers atomically and regenerates README indexes — so numbers never
  collide (even with concurrent subagents) and indexes never drift.
- Two **hooks**: `SessionStart` (inject handover memory) and `Stop` (an opt-in,
  heavily rate-limited reminder to log).

## Requirements

- **Node.js** must be on `PATH` (the engine and hooks run via `node`). Node was
  chosen over Python specifically because the `node` command name is identical on
  Windows, macOS, and Linux, whereas `python` vs `python3` differs by platform.
  No npm dependencies — standard library only.

## Development

```bash
claude --plugin-dir .      # load this working copy directly (no install)
# edit, then /reload-plugins in-session to pick up skill/command/hook changes;
# hook *scripts* take effect immediately (run fresh each time).

node --test                # run the test suite (engine + hooks)
npm run validate:json      # check the JSON manifests parse
claude plugin validate .   # validate manifests + frontmatter + hooks
```

Tests are zero-dependency (`node:test`) and spin up throwaway project dirs to
exercise the engine and hook scripts. The skill/command markdown is prose, so
it's validated behaviourally (`--plugin-dir .`), not unit-tested.

## Status

Early (`0.1.0`). The `Stop` nudge is the most experimental piece; if it ever
feels noisy, set `stop_nudge` to `off`.

## Layout

```
.claude-plugin/plugin.json   # manifest + userConfig + hooks reference
skills/dev-chronicler/SKILL.md  # the format spec, discipline, engine usage
commands/                    # init, action, decision, handover, readme
hooks/hooks.json             # SessionStart + Stop wiring
scripts/chronicle.js         # the engine (atomic numbering + index rebuild)
scripts/session_start.js     # SessionStart hook
scripts/stop_nudge.js        # Stop hook
```
