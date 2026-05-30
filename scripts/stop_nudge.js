#!/usr/bin/env node
/*
 * Stop hook for dev-chronicler — a gentle, heavily-damped reminder to log a
 * work episode if one looks missing.
 *
 * The Stop event fires at the END OF EVERY TURN, so this is deliberately
 * conservative to avoid nagging:
 *   - Gated: silent unless the project has a chronicle.
 *   - Off switch: --nudge off  -> never fires.
 *   - Freshness: if any action entry was modified within the window, the
 *     agent is clearly already logging — stay silent.
 *   - Rate limit: at most one nudge per window (state file), regardless of
 *     how many turns occur.
 *
 * Usage: node stop_nudge.js [--root <name>] [--nudge on|off]
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const WINDOW_MS = 30 * 60 * 1000; // 30 minutes

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

function stateFile(base) {
  const dir = process.env.CLAUDE_PLUGIN_DATA || os.tmpdir();
  const key = crypto.createHash("sha1").update(base).digest("hex").slice(0, 12);
  return path.join(dir, `dev-chronicler-nudge-${key}.json`);
}

function newestActionMtime(actionsDir) {
  if (!fs.existsSync(actionsDir)) return 0;
  let newest = 0;
  for (const f of fs.readdirSync(actionsDir)) {
    if (!/^\d{4}-.*\.md$/.test(f)) continue;
    try {
      const m = fs.statSync(path.join(actionsDir, f)).mtimeMs;
      if (m > newest) newest = m;
    } catch (_) {}
  }
  return newest;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  // Config precedence: explicit --flag (tests) > CLAUDE_PLUGIN_OPTION_* (the
  // value the harness resolves from userConfig — the user's override, or the
  // schema default) > legacy env var > built-in floor. Reading the env var
  // rather than baking ${user_config.*} into the hook command means an
  // unresolved option is simply absent, not a hard hook failure (which is what
  // happens for --plugin-dir-loaded plugins).
  const nudge =
    flags.nudge && flags.nudge !== true
      ? flags.nudge
      : process.env.CLAUDE_PLUGIN_OPTION_STOP_NUDGE || "on";
  if (nudge === "off") process.exit(0);

  const root =
    flags.root && flags.root !== true
      ? flags.root
      : process.env.CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT || process.env.CHRONICLE_ROOT || "dev-chronicler";
  const base = path.join(projectRoot(), root);
  const marker = path.join(base, ".chronicler.json");

  // Gate.
  if (!fs.existsSync(marker)) process.exit(0);

  const now = Date.now();

  // If an action entry was just written, the agent is already logging — quiet.
  const actionsDir = path.join(base, "actions");
  if (now - newestActionMtime(actionsDir) < WINDOW_MS) process.exit(0);

  // If the chronicle itself was only just created, give it room before nudging.
  try {
    if (now - fs.statSync(marker).mtimeMs < WINDOW_MS) process.exit(0);
  } catch (_) {}

  // Rate limit via state file.
  const sf = stateFile(base);
  try {
    const st = JSON.parse(fs.readFileSync(sf, "utf8"));
    if (st.lastNudge && now - st.lastNudge < WINDOW_MS) process.exit(0);
  } catch (_) {
    /* no/!invalid state — proceed */
  }

  try {
    fs.writeFileSync(sf, JSON.stringify({ lastNudge: now }));
  } catch (_) {}

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          "dev-chronicler: no action-log entry has been recorded recently. If meaningful " +
          "work happened in this session, record it in " +
          root +
          "/actions/ (use /dev-chronicler:action, or write one directly). Skip this if the " +
          "session was only discussion or reading.",
      },
    })
  );
  process.exit(0);
}

main();
