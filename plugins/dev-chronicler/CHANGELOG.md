# Changelog

All notable changes to **dev-chronicler** are documented here. The format
loosely follows [Keep a Changelog](https://keepachangelog.com/); versions match
the `version` field in `.claude-plugin/plugin.json`.

## 0.4.2

### Fixed
- **Force logging through the engine.** The `SessionStart` hook and the skill now
  state emphatically: log via the bundled engine (`allocate`/`handover`) and fill
  the file it prints — **never hand-create** files in `decisions/`/`actions/`, and
  **never read another plugin version from `~/.claude/plugins/cache`**. Hand-rolled
  entries were producing malformed (date-prefixed, type-less, wrongly-`Accepted`)
  files, and the agent had been mis-picking an older cached version.
- **Numbering is no longer poisoned by stray date-named files.** `maxNumber` skips
  `YYYY-MM-DD-…` names, so a malformed hand-rolled file can't make the next entry
  jump to e.g. `2027`. (doctor still flags the stray file.)

## 0.4.1

### Fixed
- **`init` now activates the chronicle in the current session.** The `SessionStart`
  hook is gated on the chronicle already existing, so running `/dev-chronicler:init`
  mid-session left that session un-primed (nothing logged until a restart). The
  `init` command/skill now tell the agent to adopt the logging discipline
  immediately, and the engine's init message says so — no restart needed. Future
  sessions are still primed automatically by the hook.

## 0.4.0

Applies findings from a cited review of decision-record and engineering-log
practice (Nygard, Fowler, MADR, Conventional Commits, Google SRE, the Pragmatic
Programmer, lab-notebook reproducibility rules). See the README "Principles &
sources" section.

### Added
- **Action episode types.** `allocate action` now requires `--type`
  (`feat|fix|docs|refactor|test|chore`, Conventional Commits) and encodes it in
  the filename: `NNNN-<type>-slug.md`.
- **Decision acceptance.** New ADRs start `**Status:** Proposed`. `pending` lists
  un-accepted decisions and `accept <NNNN>` (and `/dev-chronicler:accept`) lets a
  *human* mark one `Accepted` (confirmed correct). The agent never blocks on this;
  `SessionStart` reminds it when decisions are pending.
- Three cheap `doctor` checks (warnings): action filename has a valid type,
  decision has a `**Status:**` line, action `Commands` section is non-empty.

### Changed
- Tightened the decision skeleton/guidance: a required "because" rationale,
  alternatives with pros/cons + rejection reason, consequences that include the
  negatives. Tightened the action skeleton: what-&-why (not keystrokes), concrete
  outcomes incl. negative results, exact reproducible commands, episode altitude.
- `migrate` now **keeps** `Proposed`/`Accepted` status lines (only converts the
  old `Status: Superseded by NNNN` into a marker).

## 0.3.1

### Fixed
- `doctor` no longer false-flags `[[` inside inline code (e.g. a
  `Callable[[Entity], None]` type annotation or pandas `df[[col]]`) as an
  Obsidian wikilink. It now strips inline-code spans and matches a complete
  `[[...]]` token. Surfaced by the end-to-end eval runner on real generated output.

## 0.3.0

### Added
- `doctor` subcommand / `/dev-chronicler:doctor` — validates chronicle health:
  broken relative links, leftover `[[wikilinks]]`, unfilled skeleton
  placeholders, and missing required sections. Exits non-zero on errors;
  supports `--json`.
- `migrate` subcommand / `/dev-chronicler:migrate` — upgrades a chronicle made
  by an older version: removes `## Index` blocks, drops `**Status:**`
  Proposed/Accepted lines, converts `**Status:** Superseded by NNNN` into a
  `**Superseded by:** [link]`, and rewrites `[[wikilinks]]` as relative links.
  Supports `--dry-run`.
- `handover` now **creates** the file from a skeleton (and accepts `--title`),
  rather than only printing a path.

### Changed
- Cleaned up the `allocate` retry loop (removed dead code; the comment now
  matches behaviour) and rejected a value-less `--slug`.

### Tested / CI
- Added `doctor`, `migrate`, and `manifests` test suites. The manifests guard
  fails CI if the three version fields drift apart or if `plugin.json` re-declares
  the auto-loaded `hooks/hooks.json`.

## 0.2.2

### Fixed
- Cross-links now use **standard relative Markdown links** instead of Obsidian
  `[[wikilinks]]`, which didn't render on GitHub or in IDE previews.

## 0.2.1

### Fixed
- Removed the redundant `"hooks": "./hooks/hooks.json"` reference from
  `plugin.json`. The standard hooks file is auto-loaded, so the explicit
  reference caused a "Duplicate hooks file detected" load error.

## 0.2.0

### Added
- Per-command model defaults (`init` → haiku; `action`/`decision`/`readme` →
  opus; `handover` → sonnet).

### Changed
- Removed the persisted README index and the Proposed/Accepted status lifecycle.
  Entries are derived live by the `SessionStart` hook, so nothing can drift. A
  lightweight `**Superseded by:**` marker is kept for reversed decisions.

## 0.1.0

### Added
- Initial release: `init`, `allocate` (action/decision), `handover`, `status`;
  `SessionStart` (handover memory injection) and `Stop` (opt-in logging nudge)
  hooks; the `dev-chronicler` skill and namespaced slash commands.
