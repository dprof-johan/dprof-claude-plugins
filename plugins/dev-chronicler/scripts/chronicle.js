#!/usr/bin/env node
/*
 * dev-chronicler engine.
 *
 * One file, no dependencies. Shared by the slash commands and the hooks so
 * there is exactly one code path for allocating entry numbers.
 *
 * Subcommands:
 *   init      --root <name>                         scaffold the chronicle in a project
 *   allocate  decision --slug <s> [--title "<t>"] [--root <name>]
 *   allocate  action   --type <feat|fix|docs|refactor|test|chore> --slug <s> [--title "<t>"]
 *                                                   atomically reserve the next NNNN and create a
 *                                                   skeleton entry; prints its path. Actions encode
 *                                                   the type in the filename (NNNN-<type>-slug.md).
 *   pending   [--root <name>] [--json]              list decisions not yet Accepted (human-confirmed)
 *   accept    <NNNN> [--root <name>]                mark a decision Accepted (human-confirmed)
 *   handover  --slug <s> [--title "<t>"] [--root <name>]
 *                                                   create a timestamped handover from a
 *                                                   skeleton; prints its path
 *   status    [--root <name>]                       print whether active + a short summary (JSON)
 *   doctor    [--root <name>] [--json]              check chronicle health (links, wikilinks,
 *                                                   placeholders, sections); exits 1 on errors
 *   migrate   [--root <name>] [--dry-run]           bring an old chronicle up to the current
 *                                                   format (drop index blocks & status, fix links)
 *
 * Project root is taken from $CLAUDE_PROJECT_DIR, falling back to the cwd.
 * The chronicle root folder name defaults to "dev-chronicler" and can be
 * overridden with --root (or $CHRONICLE_ROOT).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const KIND_DIR = { decision: "decisions", action: "actions", handover: "handovers" };
const FOLDERS = Object.values(KIND_DIR);

// Short, fixed set of action episode types (Conventional Commits — kept small to
// limit type-selection friction). Encoded into the action filename: NNNN-<type>-slug.
const ACTION_TYPES = ["feat", "fix", "docs", "refactor", "test", "chore"];
const ACTION_TYPE_RE = /^\d{4}-(feat|fix|docs|refactor|test|chore)-.+\.md$/;

// Decision human-confirmation statuses (a separate axis from the supersede marker).
const DECISION_STATUSES = ["Proposed", "Accepted"];

// Required section headings per entry kind — used by `doctor`.
const REQUIRED_SECTIONS = {
  decisions: ["Context", "Decision", "Alternatives considered", "Consequences"],
  actions: ["What I did", "Outcome", "Commands", "Notes / related"],
};

// Substrings that only appear in an unfilled skeleton; their presence means the
// entry was allocated but never filled in.
const PLACEHOLDER_MARKERS = [
  "_What is the situation",
  "_The choice we made",
  "_Each serious option",
  "_What this commits us",
  "_Relative Markdown links",
  "_What changed and",
  "_Concrete result",
  "_Exact, runnable commands",
  "_Why this mattered",
];

// ---------- arg parsing ----------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ---------- path helpers ----------

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function rootName(flags) {
  // Precedence: explicit --root > CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT (the
  // harness-resolved userConfig value: user override or schema default) >
  // legacy CHRONICLE_ROOT > built-in default.
  return (
    (flags.root && flags.root !== true && flags.root) ||
    process.env.CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT ||
    process.env.CHRONICLE_ROOT ||
    "dev-chronicler"
  );
}

function rootDir(flags) {
  return path.join(projectRoot(), rootName(flags));
}

function markerPath(flags) {
  return path.join(rootDir(flags), ".chronicler.json");
}

function isActive(flags) {
  return fs.existsSync(markerPath(flags));
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "entry";
}

function titleCase(slug) {
  return slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ---------- index / entry reading ----------

function listEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort();
}

function firstHeading(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^#\s+(.*\S)\s*$/);
      if (m) return m[1];
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function maxNumber(dir) {
  let max = 0;
  for (const f of listEntries(dir)) {
    // Ignore date-style names (YYYY-MM-DD-…): those are malformed hand-rolled
    // entries (or stray handovers), and a 4-digit year would otherwise poison
    // the sequence (e.g. 2026-05-31-… → "next" = 2027). doctor flags them.
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) continue;
    const n = parseInt(f.slice(0, 4), 10);
    if (n > max) max = n;
  }
  return max;
}

// Read a decision's **Status:** value (Proposed / Accepted / ...), or null.
function statusOf(file) {
  try {
    const m = fs.readFileSync(file, "utf8").match(/^\*\*Status:\*\*\s*(.+?)\s*$/m);
    if (m) return m[1].trim();
  } catch (_) {
    /* ignore */
  }
  return null;
}

// ---------- skeletons ----------

function skeleton(kind, num, title) {
  const nnnn = String(num).padStart(4, "0");
  if (kind === "decision") {
    return [
      `# ${nnnn} — ${title}`,
      "",
      "**Status:** Proposed",
      `**Date:** ${today()}`,
      "",
      "## Context",
      "",
      "_What is the situation — the forces at play (technical, product, constraints) and what triggered this decision._",
      "",
      "## Decision",
      "",
      "_The choice we made, stated plainly, with its rationale: \"we will X **because** Y\". The because is required._",
      "",
      "## Alternatives considered",
      "",
      "_Each serious option weighed, with its pros/cons and why it was rejected — not just a bare name._",
      "",
      "## Consequences",
      "",
      "_What this commits us to — including the negative and neutral consequences and follow-on obligations, not just the upsides._",
      "",
      "## Related",
      "",
      "_Relative Markdown links — another decision: [NNNN — Title](NNNN-slug.md); an action: [actions/NNNN-type — Title](../actions/NNNN-type-slug.md)._",
      "",
    ].join("\n");
  }
  // action
  return [
    `# ${nnnn} — ${title}`,
    "",
    `**Date:** ${today()}`,
    "",
    "## What I did",
    "- _What changed and **why** — the intent and the change, not keystrokes._",
    "",
    "## Outcome",
    "- _Concrete result: numbers, pass/fail, before→after. Note what failed or you ruled out._",
    "",
    "## Commands",
    "_Exact, runnable commands so the result can be reproduced._",
    "",
    "## Notes / related",
    "- _Why this mattered / next step; link a decision: [decisions/NNNN — Title](../decisions/NNNN-slug.md)._",
    "",
  ].join("\n");
}

function handoverSkeleton(title) {
  return [
    `# Handover — ${title}`,
    "",
    `**Date:** ${now()}`,
    "",
    "## Where things stand",
    "- ",
    "",
    "## What works",
    "- ",
    "",
    "## In flight / half-done",
    "- ",
    "",
    "## Next steps",
    "1. ",
    "",
    "## Gotchas",
    "- ",
    "",
  ].join("\n");
}

// ---------- subcommands ----------

function cmdAllocate(positional, flags) {
  const kind = positional[0];
  if (kind !== "decision" && kind !== "action") {
    fail(`allocate expects "decision" or "action", got "${kind}"`);
  }
  if (!flags.slug || flags.slug === true) fail("allocate requires --slug <value>");
  if (!isActive(flags)) {
    fail(
      `dev-chronicler is not initialised in this project ` +
        `(no ${rootName(flags)}/.chronicler.json). Run /dev-chronicler:init first.`
    );
  }
  // Actions carry a fixed episode type in their filename: NNNN-<type>-slug.md.
  let typeSeg = "";
  if (kind === "action") {
    const t = flags.type && flags.type !== true ? String(flags.type).toLowerCase() : "";
    if (!ACTION_TYPES.includes(t)) {
      fail(`allocate action requires --type <${ACTION_TYPES.join("|")}>`);
    }
    typeSeg = t + "-";
  }
  const dir = path.join(rootDir(flags), KIND_DIR[kind]);
  fs.mkdirSync(dir, { recursive: true });
  const slug = slugify(flags.slug);
  const title = flags.title && flags.title !== true ? String(flags.title) : titleCase(slug);

  // Reserve a number with verify-after-write, so two concurrent writers can
  // never end up sharing a number.
  for (let attempt = 0; attempt < 50; attempt++) {
    const num = maxNumber(dir) + 1;
    const nnnn = String(num).padStart(4, "0");
    const name = `${nnnn}-${typeSeg}${slug}.md`;
    const full = path.join(dir, name);
    let fd;
    try {
      fd = fs.openSync(full, "wx"); // O_EXCL: fails if the exact name exists
    } catch (e) {
      if (e.code === "EEXIST") {
        // Another writer already holds this exact name; the next maxNumber()
        // call will see their file, so simply retrying advances to a free
        // number.
        continue;
      }
      throw e;
    }
    fs.writeSync(fd, skeleton(kind, num, title));
    fs.closeSync(fd);
    // Verify we are the sole owner of this number.
    const sharing = listEntries(dir).filter((f) => f.startsWith(`${nnnn}-`));
    if (sharing.length > 1) {
      fs.unlinkSync(full); // lost the race — drop ours and try the next number
      continue;
    }
    process.stdout.write(full + "\n");
    return;
  }
  fail("could not allocate an entry number after 50 attempts");
}

function cmdHandover(_positional, flags) {
  if (!isActive(flags)) fail("dev-chronicler is not initialised in this project.");
  const dir = path.join(rootDir(flags), KIND_DIR.handover);
  fs.mkdirSync(dir, { recursive: true });
  const rawSlug = flags.slug && flags.slug !== true ? flags.slug : "handover";
  const slug = slugify(rawSlug);
  const title = flags.title && flags.title !== true ? String(flags.title) : titleCase(slug);
  const full = path.join(dir, `${timestamp()}-${slug}.md`);
  // Create the file with a skeleton (like allocate does) so the agent has a
  // structured snapshot to fill in. If one already exists this minute, leave
  // it untouched and just print the path.
  if (!fs.existsSync(full)) fs.writeFileSync(full, handoverSkeleton(title));
  process.stdout.write(full + "\n");
}

function cmdStatus(_positional, flags) {
  const active = isActive(flags);
  const out = { active, root: rootName(flags) };
  if (active) {
    for (const [kind, sub] of Object.entries(KIND_DIR)) {
      const dir = path.join(rootDir(flags), sub);
      const entries = listEntries(dir);
      out[sub] = {
        count: entries.length,
        latest: entries.length ? firstHeading(path.join(dir, entries[entries.length - 1])) : null,
      };
    }
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

// Decisions not yet human-confirmed (Status !== Accepted). "Accepted" means a
// human has confirmed the record is correct — it is never set automatically.
function pendingDecisions(flags) {
  const dir = path.join(rootDir(flags), KIND_DIR.decision);
  return listEntries(dir)
    .map((f) => ({ file: f, title: firstHeading(path.join(dir, f)) || f, status: statusOf(path.join(dir, f)) || "Proposed" }))
    .filter((d) => d.status !== "Accepted");
}

function cmdPending(_positional, flags) {
  if (!isActive(flags)) fail("dev-chronicler is not initialised in this project.");
  const pending = pendingDecisions(flags);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ pending }, null, 2) + "\n");
    return;
  }
  if (!pending.length) {
    process.stdout.write("pending: all decisions are Accepted.\n");
    return;
  }
  process.stdout.write(`pending: ${pending.length} decision(s) awaiting acceptance:\n`);
  for (const d of pending) process.stdout.write(`  ${d.file}  [${d.status}]  ${d.title}\n`);
}

// Mark a decision Accepted (human-confirmed). Mechanical edit so the Status line
// can't be mistyped. Takes the NNNN number (or a filename).
function cmdAccept(positional, flags) {
  if (!isActive(flags)) fail("dev-chronicler is not initialised in this project.");
  const which = positional[0];
  if (!which) fail("accept requires a decision number, e.g. `accept 0003`");
  const dir = path.join(rootDir(flags), KIND_DIR.decision);
  const nnnn = String(which).replace(/\D/g, "").padStart(4, "0");
  const file = listEntries(dir).find((f) => f.startsWith(nnnn + "-") || f === which);
  if (!file) fail(`no decision matching "${which}" in ${rootName(flags)}/decisions/`);
  const full = path.join(dir, file);
  let text = fs.readFileSync(full, "utf8");
  if (/^\*\*Status:\*\*/m.test(text)) {
    text = text.replace(/^\*\*Status:\*\*.*$/m, "**Status:** Accepted");
  } else {
    // No status line — insert one right after the H1 title.
    text = text.replace(/^(#\s+.*\n)/, `$1\n**Status:** Accepted\n`);
  }
  fs.writeFileSync(full, text);
  process.stdout.write(`accepted ${KIND_DIR.decision}/${file}\n`);
}

function cmdInit(_positional, flags) {
  const root = rootName(flags);
  const base = rootDir(flags);
  fs.mkdirSync(base, { recursive: true });
  for (const sub of Object.values(KIND_DIR)) {
    fs.mkdirSync(path.join(base, sub), { recursive: true });
  }
  // Marker = the gate. Its presence is what makes the plugin "kick in".
  const marker = markerPath(flags);
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(
      marker,
      JSON.stringify({ chronicler: 1, root, created: today() }, null, 2) + "\n"
    );
  }
  writeIfAbsent(path.join(base, "decisions", "README.md"), decisionsReadme());
  writeIfAbsent(path.join(base, "actions", "README.md"), actionsReadme());
  writeIfAbsent(path.join(base, "handovers", "README.md"), handoversReadme());
  writeIfAbsent(path.join(base, "README.md"), rootReadme(root));
  process.stdout.write(
    `initialised ${root}/ (decisions, actions, handovers). ` +
      `The chronicle is active now — start logging episodes and decisions this session; no restart needed.\n`
  );
}

function writeIfAbsent(file, content) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, content);
}

// ---------- scaffolded README bodies ----------

function decisionsReadme() {
  return `# Decisions

Lightweight ADRs (Architecture Decision Records). One decision per file (kept
short — a page or so), numbered sequentially. Captures **why** a path was chosen.

## Format

\`\`\`
# NNNN — Title

**Status:** Proposed | Accepted
**Date:** YYYY-MM-DD

## Context
## Decision
## Alternatives considered
## Consequences
## Related
\`\`\`

## Conventions

- **One decision per entry**, kept short — large records go stale and unread
  (Nygard; Fowler).
- **Decision states a rationale**: "we will X **because** Y" — justification is
  not optional (MADR).
- **Alternatives** = each serious option with its pros/cons and why it was
  rejected, not a bare list of names (Fowler; MADR).
- **Consequences** must include the negatives/neutral and follow-on obligations,
  not just the upsides (Nygard).
- Cross-link with **relative Markdown links** (they render on GitHub and IDEs):
  \`[NNNN — Title](NNNN-slug.md)\`; an action: \`[actions/NNNN-type — Title](../actions/NNNN-type-slug.md)\`.
- **Supersede, don't delete.** When a decision is reversed, add a
  \`**Superseded by:** [NNNN — Title](NNNN-slug.md)\` line near the top (Nygard).
- **Status / acceptance.** New decisions start **Proposed**. A *human* marks one
  **Accepted** once they've confirmed it's correct — the agent never waits for
  that. Review pending ones any time with \`/dev-chronicler:accept\`.

See the project README's "Principles & sources" for the citations behind these.
`;
}

function actionsReadme() {
  return `# Actions

A chronological build journal. One file per meaningful work *episode*.
Captures **what** was actually done. Files are named \`NNNN-<type>-slug.md\`.

## Format

\`\`\`
# NNNN — Title

**Date:** YYYY-MM-DD

## What I did      (what changed and WHY — not keystrokes)
## Outcome         (concrete result + numbers; what failed / was ruled out)
## Commands        (exact, runnable commands — reproducibility)
## Notes / related (why it mattered / next step; links)
\`\`\`

## Conventions

- **Type prefix** in the filename — one of \`feat | fix | docs | refactor | test |
  chore\` (Conventional Commits), so entries are scannable and machine-groupable.
- **Right altitude**: one entry per work *episode*, written while it's fresh — not
  per file-edit (\`git log\` covers those), not per keystroke (engineering daybook).
- **Concrete outcomes**: numbers, pass/fail, before→after — paired with the
  command/evidence that produced them (lab-notebook reproducibility standard).
- **Negative results are first-class**: record what failed or you ruled out — it
  stops the next reader repeating a dead end (SRE blameless postmortems).

See the project README's "Principles & sources" for the citations behind these.
`;
}

function handoversReadme() {
  return `# Handovers

Point-in-time snapshots of *where things stand*, for the next agent or
teammate picking up the work. Named by timestamp, so they sort oldest→newest.
Unlike decisions/actions these are not a cross-linked chain — the latest one is
usually the one that matters.
`;
}

function rootReadme(root) {
  return `# ${root}

The development chronicle for this project, maintained by the
[dev-chronicler](https://github.com/dprof-johan/dprof-claude-plugins/tree/main/plugins/dev-chronicler) plugin.

- [\`decisions/\`](decisions/) — **why** we chose what we chose (ADRs).
- [\`actions/\`](actions/) — **what** we actually did (build journal).
- [\`handovers/\`](handovers/) — **where things stand** snapshots for the next agent.

Together they are both a human-readable narrative of the project and a
handover-memory store that fresh agents are given at the start of a session.
`;
}

// ---------- doctor: validate chronicle health ----------

// Validate one relative Markdown link target against the filesystem. Skips
// external/absolute links and non-`.md` targets (we only own intra-chronicle
// links). Pushes a broken-link error if a relative `.md` target doesn't exist.
function checkLink(file, target, line, issues) {
  let t = String(target).trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(t) || t.includes("://") || t.startsWith("/")) return;
  t = t.replace(/#.*$/, ""); // drop any anchor
  if (!t || !t.endsWith(".md")) return;
  const resolved = path.resolve(path.dirname(file), t);
  if (!fs.existsSync(resolved)) {
    issues.push({ level: "error", line, message: `broken link: ${target}` });
  }
}

// Return the meaningful (non-placeholder, non-bullet, non-fence) content of a
// `## heading` section, or "" if it's effectively empty.
function sectionBody(text, heading) {
  const re = new RegExp("^##\\s+" + heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "m");
  const m = re.exec(text);
  if (!m) return "";
  const after = text.slice(m.index + m[0].length);
  const next = after.search(/^##\s+/m);
  const body = next === -1 ? after : after.slice(0, next);
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== "-" && !l.startsWith("_") && !l.startsWith("```"))
    .join("");
}

function scanEntry(file, sub) {
  const issues = [];
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return [{ level: "error", line: 0, message: `cannot read file: ${e.message}` }];
  }
  const headings = new Set();
  let inFence = false;
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine;
    const ln = i + 1;
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const h = line.match(/^##\s+(.*\S)\s*$/);
    if (h) headings.add(h[1].trim());

    // Strip inline-code spans before checking link/wikilink syntax, so code like
    // `Callable[[Entity], None]` or pandas `df[[col]]` isn't mistaken for a link.
    const scan = line.replace(/`[^`]*`/g, "");

    // A real Obsidian wikilink is a complete `[[...]]` token (not just a stray
    // `[[`, which appears in nested generics/indexers).
    if (/\[\[[^\]\n]+\]\]/.test(scan)) {
      issues.push({ level: "error", line: ln, message: "Obsidian wikilink — use a relative Markdown link instead" });
    }

    if (PLACEHOLDER_MARKERS.some((p) => line.includes(p))) {
      issues.push({ level: "warning", line: ln, message: "unfilled skeleton placeholder" });
      return; // don't link-check the example links inside a hint line
    }

    const sup = line.match(/^\*\*Superseded by:\*\*\s*(.+?)\s*$/);
    if (sup) {
      const linkm = sup[1].match(/\]\(([^)]+)\)/);
      if (!linkm) {
        issues.push({ level: "warning", line: ln, message: `"Superseded by" marker is not a resolvable link: ${sup[1]}` });
      } else {
        checkLink(file, linkm[1], ln, issues);
      }
      return;
    }

    const re = /\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(scan))) checkLink(file, m[1], ln, issues);
  });

  for (const s of REQUIRED_SECTIONS[sub] || []) {
    if (!headings.has(s)) issues.push({ level: "warning", line: 0, message: `missing section: ## ${s}` });
  }

  // Cheap mechanical quality checks (warnings — never fail the build).
  const base = path.basename(file);
  if (sub === "actions" && !ACTION_TYPE_RE.test(base)) {
    issues.push({ level: "warning", line: 0, message: `action filename should be NNNN-<type>-slug (type: ${ACTION_TYPES.join("|")})` });
  }
  if (sub === "decisions" && !/^\*\*Status:\*\*/m.test(text)) {
    issues.push({ level: "warning", line: 0, message: "decision is missing a **Status:** line (Proposed or Accepted)" });
  }
  if (sub === "actions" && !sectionBody(text, "Commands")) {
    issues.push({ level: "warning", line: 0, message: "Commands section is empty — record the exact commands run (reproducibility)" });
  }
  return issues;
}

function cmdDoctor(_positional, flags) {
  if (!isActive(flags)) fail("dev-chronicler is not initialised in this project.");
  const base = rootDir(flags);
  const all = [];
  for (const sub of FOLDERS) {
    const dir = path.join(base, sub);
    for (const f of listEntries(dir)) {
      for (const is of scanEntry(path.join(dir, f), sub)) {
        all.push({ file: `${sub}/${f}`, ...is });
      }
    }
  }
  const errors = all.filter((x) => x.level === "error");
  const warnings = all.filter((x) => x.level === "warning");

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2) + "\n");
  } else {
    for (const x of all) {
      const where = x.line ? `${x.file}:${x.line}` : x.file;
      process.stdout.write(`${x.level === "error" ? "✗" : "⚠"} ${where} — ${x.message}\n`);
    }
    process.stdout.write(
      all.length
        ? `\ndoctor: ${errors.length} error(s), ${warnings.length} warning(s)\n`
        : "doctor: chronicle is healthy — no issues found\n"
    );
  }
  if (errors.length) process.exit(1);
}

// ---------- migrate: bring an old chronicle up to the current format ----------

function migrateFile(file, sub, base, dryRun) {
  const orig = fs.readFileSync(file, "utf8");
  let text = orig;
  // Only numbered entries get the status/wikilink rewrites; folder READMEs (which
  // contain example syntax in their format blocks) get only index-block removal.
  const isEntry = /^\d{4}-.*\.md$/.test(path.basename(file));

  // 1. Remove generated index blocks (with an optional "## Index" heading).
  text = text.replace(
    /\n?#{1,6}[ \t]*Index[ \t]*\n+<!-- chronicle:index:start -->[\s\S]*?<!-- chronicle:index:end -->[ \t]*\n?/g,
    "\n"
  );
  text = text.replace(/<!-- chronicle:index:start -->[\s\S]*?<!-- chronicle:index:end -->[ \t]*\n?/g, "");

  if (!isEntry) {
    text = text.replace(/\n{3,}/g, "\n\n");
    if (text === orig) return false;
    if (!dryRun) fs.writeFileSync(file, text);
    return true;
  }

  // 2. Status lines: keep Proposed/Accepted (valid); convert an old
  //    "Status: Superseded by NNNN" into the standalone Superseded-by marker.
  text = text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\*\*Status:\*\*\s*(.+?)\s*$/);
      if (!m) return line;
      const val = m[1].trim();
      if (/^(Proposed|Accepted)$/i.test(val)) return line; // valid status — keep
      const sm = val.match(/^Superseded by\s+#?(\d{3,4})/i);
      if (sm) {
        const num = sm[1].padStart(4, "0");
        const dir = path.join(base, "decisions");
        const target = (fs.existsSync(dir) ? listEntries(dir) : []).find((x) => x.startsWith(num + "-"));
        if (target) {
          const heading = firstHeading(path.join(dir, target)) || num;
          const rel = sub === "decisions" ? target : `../decisions/${target}`;
          return `**Superseded by:** [${heading}](${rel})`;
        }
      }
      return `**Superseded by:** ${val.replace(/^Superseded by\s+/i, "")}`;
    })
    .filter((l) => l !== null)
    .join("\n");

  // 3. Wikilinks -> relative Markdown links.
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_full, innerRaw) => {
    const inner = innerRaw.trim();
    let targetSub = sub || "decisions";
    let slug = inner;
    const slash = inner.indexOf("/");
    if (slash !== -1 && FOLDERS.includes(inner.slice(0, slash))) {
      targetSub = inner.slice(0, slash);
      slug = inner.slice(slash + 1);
    }
    const rel = targetSub === sub ? `${slug}.md` : `../${targetSub}/${slug}.md`;
    const targetFile = path.join(base, targetSub, `${slug}.md`);
    const linkText = fs.existsSync(targetFile) ? firstHeading(targetFile) || inner : inner;
    return `[${linkText}](${rel})`;
  });

  // 4. Tidy up blank-line runs left by removed lines/blocks.
  text = text.replace(/\n{3,}/g, "\n\n");

  if (text === orig) return false;
  if (!dryRun) fs.writeFileSync(file, text);
  return true;
}

function cmdMigrate(_positional, flags) {
  if (!isActive(flags)) fail("dev-chronicler is not initialised in this project.");
  const base = rootDir(flags);
  const dryRun = !!flags["dry-run"];

  const targets = [];
  for (const sub of FOLDERS) {
    const dir = path.join(base, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".md")) targets.push({ file: path.join(dir, f), sub });
    }
  }
  const rootMd = path.join(base, "README.md");
  if (fs.existsSync(rootMd)) targets.push({ file: rootMd, sub: "" });

  const changed = [];
  for (const { file, sub } of targets) {
    if (migrateFile(file, sub, base, dryRun)) changed.push(path.relative(base, file).split(path.sep).join("/"));
  }

  if (!changed.length) {
    process.stdout.write("migrate: nothing to change — chronicle is already current\n");
    return;
  }
  process.stdout.write(`migrate${dryRun ? " (dry-run)" : ""}: ${changed.length} file(s) ${dryRun ? "would change" : "updated"}:\n`);
  for (const c of changed) process.stdout.write(`  ${c}\n`);
}

// ---------- entry point ----------

function fail(msg) {
  process.stderr.write(`chronicle: ${msg}\n`);
  process.exit(1);
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional.shift();
  switch (cmd) {
    case "init":
      return cmdInit(positional, flags);
    case "allocate":
      return cmdAllocate(positional, flags);
    case "handover":
      return cmdHandover(positional, flags);
    case "status":
      return cmdStatus(positional, flags);
    case "doctor":
      return cmdDoctor(positional, flags);
    case "migrate":
      return cmdMigrate(positional, flags);
    case "pending":
      return cmdPending(positional, flags);
    case "accept":
      return cmdAccept(positional, flags);
    default:
      fail(`unknown subcommand "${cmd || ""}". Expected init|allocate|handover|status|doctor|migrate|pending|accept.`);
  }
}

main();
