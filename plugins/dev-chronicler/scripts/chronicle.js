#!/usr/bin/env node
/*
 * dev-chronicler engine.
 *
 * One file, no dependencies. Shared by the slash commands and the hooks so
 * there is exactly one code path for allocating entry numbers.
 *
 * Subcommands:
 *   init      --root <name>                         scaffold the chronicle in a project
 *   allocate  <decision|action> --slug <s> [--title "<t>"] [--root <name>]
 *                                                   atomically reserve the next NNNN and
 *                                                   create a skeleton entry; prints its path
 *   handover  --slug <s> [--root <name>]            print the path for a new timestamped handover
 *   status    [--root <name>]                       print whether active + a short summary (JSON)
 *
 * Project root is taken from $CLAUDE_PROJECT_DIR, falling back to the cwd.
 * The chronicle root folder name defaults to "dev-chronicler" and can be
 * overridden with --root (or $CHRONICLE_ROOT).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const KIND_DIR = { decision: "decisions", action: "actions", handover: "handovers" };

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
    flags.root ||
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
    const n = parseInt(f.slice(0, 4), 10);
    if (n > max) max = n;
  }
  return max;
}

// ---------- skeletons ----------

function skeleton(kind, num, title) {
  const nnnn = String(num).padStart(4, "0");
  if (kind === "decision") {
    return [
      `# ${nnnn} — ${title}`,
      "",
      `**Date:** ${today()}`,
      "",
      "## Context",
      "",
      "_What is the situation, what is the constraint, what triggered this decision._",
      "",
      "## Decision",
      "",
      "_The choice we made, stated plainly._",
      "",
      "## Alternatives considered",
      "",
      "_Each rejected option, with the reason we rejected it._",
      "",
      "## Consequences",
      "",
      "_What this commits us to. What we now can't do. What we might regret._",
      "",
      "## Related",
      "",
      "_Relative Markdown links — another decision: [NNNN — Title](NNNN-slug.md); an action: [actions/NNNN — Title](../actions/NNNN-slug.md)._",
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
    "- ",
    "",
    "## Outcome",
    "- ",
    "",
    "## Commands",
    "",
    "## Notes / related",
    "- _Relative Markdown links — a decision: [decisions/NNNN — Title](../decisions/NNNN-slug.md); another action: [NNNN — Title](NNNN-slug.md)._",
    "",
  ].join("\n");
}

// ---------- subcommands ----------

function cmdAllocate(positional, flags) {
  const kind = positional[0];
  if (kind !== "decision" && kind !== "action") {
    fail(`allocate expects "decision" or "action", got "${kind}"`);
  }
  if (!flags.slug) fail("allocate requires --slug");
  if (!isActive(flags)) {
    fail(
      `dev-chronicler is not initialised in this project ` +
        `(no ${rootName(flags)}/.chronicler.json). Run /dev-chronicler:init first.`
    );
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
    const name = `${nnnn}-${slug}.md`;
    const full = path.join(dir, name);
    let fd;
    try {
      fd = fs.openSync(full, "wx"); // O_EXCL: fails if the exact name exists
    } catch (e) {
      if (e.code === "EEXIST") {
        // Same slug already used this number — bump the slug and retry.
        flags.slug = `${slug}-${num}`;
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
  const slug = slugify(flags.slug || "handover");
  const name = `${timestamp()}-${slug}.md`;
  process.stdout.write(path.join(dir, name) + "\n");
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
  process.stdout.write(`initialised ${root}/ (decisions, actions, handovers)\n`);
}

function writeIfAbsent(file, content) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, content);
}

// ---------- scaffolded README bodies ----------

function decisionsReadme() {
  return `# Decisions

Lightweight ADRs (Architecture Decision Records). One decision per file,
numbered sequentially. Captures **why** a path was chosen.

## Format

\`\`\`
# NNNN — Title

**Date:** YYYY-MM-DD

## Context
## Decision
## Alternatives considered
## Consequences
## Related
\`\`\`

## Conventions

- A decision is in force simply by existing — there is no Proposed/Accepted
  status to maintain.
- Err on too much detail — easier to trim later than to reconstruct.
- Cross-link with **standard relative Markdown links** (they render on GitHub
  and in IDEs): \`[NNNN — Title](NNNN-slug.md)\` for another decision,
  \`[actions/NNNN — Title](../actions/NNNN-slug.md)\` for an action.
- When a decision is reversed, **don't delete it.** Add a
  \`**Superseded by:** [NNNN — Title](NNNN-slug.md)\` line near the top, pointing
  at its replacement. The history is the value.
`;
}

function actionsReadme() {
  return `# Actions

A chronological build journal. One file per meaningful work *episode*.
Captures **what** was actually done.

## Format

\`\`\`
# NNNN — Title

**Date:** YYYY-MM-DD

## What I did
## Outcome
## Commands
## Notes / related
\`\`\`

## When to add an entry

Add when something *happened* worth remembering as a discrete episode:
installing a tool, running a meaningful command, resolving a class of issues,
pushing/validating CI, hitting unexpected behaviour and handling it.

**Don't** add an entry for every file edit — \`git log\` already captures those.
One entry should answer "what happened in this work session?" for a later reader.
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
    default:
      fail(`unknown subcommand "${cmd || ""}". Expected init|allocate|handover|status.`);
  }
}

main();
