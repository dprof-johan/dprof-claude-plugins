#!/usr/bin/env node
/*
 * SessionStart hook for dev-chronicler.
 *
 * Gated: if the project has no chronicle (no <root>/.chronicler.json) this
 * exits silently and injects nothing — so installing the plugin changes
 * nothing in projects that haven't run /dev-chronicler:init.
 *
 * When active, it injects handover memory into the fresh agent's context:
 * the latest handover, the most recent action episodes, the decision index,
 * and the current decision-log mode.
 *
 * Usage: node session_start.js [--root <name>] [--mode <propose|auto>]
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HANDOVER_CAP = 3500; // chars of the latest handover to inject
const RECENT_ACTIONS = 6;
const RECENT_DECISIONS = 10;

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) flags[k] = true;
      else (flags[k] = v), i++;
    }
  }
  return flags;
}

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function listEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
}

function listHandovers(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.md$/.test(f) && f !== "README.md").sort();
}

function firstHeading(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^#\s+(.*\S)\s*$/);
      if (m) return m[1];
    }
  } catch (_) {}
  return null;
}

function statusOf(file) {
  try {
    const m = fs.readFileSync(file, "utf8").match(/^\*\*Status:\*\*\s*(.+?)\s*$/m);
    if (m) return m[1].trim();
  } catch (_) {}
  return null;
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    })
  );
  process.exit(0);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const root = flags.root && flags.root !== true ? flags.root : process.env.CHRONICLE_ROOT || "dev-chronicler";
  const mode = flags.mode && flags.mode !== true ? flags.mode : "propose";
  const base = path.join(projectRoot(), root);

  // Gate: do nothing unless this project has been initialised.
  if (!fs.existsSync(path.join(base, ".chronicler.json"))) process.exit(0);

  const out = [];
  out.push(
    `# dev-chronicler — project handover memory\n` +
      `This project keeps a development chronicle in \`${root}/\`. As you work:\n` +
      `- Log meaningful work *episodes* to \`${root}/actions/\` (via \`/dev-chronicler:action\`), ` +
      `not every file edit.\n` +
      (mode === "auto"
        ? `- decision_log_mode = **auto**: when a non-trivial decision is made, write the ADR directly.\n`
        : `- decision_log_mode = **propose**: when a non-trivial decision is made, draft an ADR and confirm before writing.\n`) +
      `- See the \`dev-chronicler\` skill for the format and discipline.`
  );

  // Latest handover (the curated "where things stand").
  const hDir = path.join(base, "handovers");
  const handovers = listHandovers(hDir);
  if (handovers.length) {
    const latest = handovers[handovers.length - 1];
    let body = "";
    try {
      body = fs.readFileSync(path.join(hDir, latest), "utf8");
    } catch (_) {}
    if (body.length > HANDOVER_CAP) body = body.slice(0, HANDOVER_CAP) + "\n…(truncated; read the full handover file)";
    out.push(`## Latest handover (\`${root}/handovers/${latest}\`)\n\n${body.trim()}`);
  }

  // Recent action episodes (pointers, newest last).
  const aDir = path.join(base, "actions");
  const actions = listEntries(aDir);
  if (actions.length) {
    const recent = actions.slice(-RECENT_ACTIONS);
    const lines = recent.map((f) => `- [${firstHeading(path.join(aDir, f)) || f}](${root}/actions/${f})`);
    out.push(
      `## Recent actions (${actions.length} total, showing last ${recent.length})\n\n${lines.join("\n")}`
    );
  }

  // Decision index (pointers + status).
  const dDir = path.join(base, "decisions");
  const decisions = listEntries(dDir);
  if (decisions.length) {
    const recent = decisions.slice(-RECENT_DECISIONS);
    const lines = recent.map((f) => {
      const st = statusOf(path.join(dDir, f));
      return `- [${firstHeading(path.join(dDir, f)) || f}](${root}/decisions/${f})${st ? ` — ${st}` : ""}`;
    });
    out.push(
      `## Decisions (${decisions.length} total, showing last ${recent.length})\n\n${lines.join("\n")}`
    );
  }

  if (!handovers.length && !actions.length && !decisions.length) {
    out.push(`_The chronicle is initialised but empty. Start logging as work happens._`);
  }

  emit(out.join("\n\n"));
}

main();
