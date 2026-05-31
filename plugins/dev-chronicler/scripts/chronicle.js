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
  "_Each rejected option",
  "_What this commits us",
  "_Relative Markdown links",
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

    if (line.includes("[[")) {
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
    while ((m = re.exec(line))) checkLink(file, m[1], ln, issues);
  });

  for (const s of REQUIRED_SECTIONS[sub] || []) {
    if (!headings.has(s)) issues.push({ level: "warning", line: 0, message: `missing section: ## ${s}` });
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

  // 1. Remove generated index blocks (with an optional "## Index" heading).
  text = text.replace(
    /\n?#{1,6}[ \t]*Index[ \t]*\n+<!-- chronicle:index:start -->[\s\S]*?<!-- chronicle:index:end -->[ \t]*\n?/g,
    "\n"
  );
  text = text.replace(/<!-- chronicle:index:start -->[\s\S]*?<!-- chronicle:index:end -->[ \t]*\n?/g, "");

  // 2. Status lines: drop Proposed/Accepted; convert Superseded/Reverted.
  text = text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\*\*Status:\*\*\s*(.+?)\s*$/);
      if (!m) return line;
      const val = m[1].trim();
      if (/^(Proposed|Accepted)$/i.test(val)) return null; // drop the line entirely
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
    default:
      fail(`unknown subcommand "${cmd || ""}". Expected init|allocate|handover|status|doctor|migrate.`);
  }
}

main();
