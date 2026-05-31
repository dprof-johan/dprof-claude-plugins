"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { mkProject, mkDataDir, run, engine, SESSION_START, STOP_NUDGE } = require("./helpers");

const HOUR = 60 * 60 * 1000;

function backdate(file, ms) {
  const t = (Date.now() - ms) / 1000;
  fs.utimesSync(file, t, t);
}

// ---------- SessionStart ----------

test("session_start is silent on an un-initialised project", () => {
  const proj = mkProject();
  const r = run(SESSION_START, ["--root", "dev-chronicler", "--mode", "propose"], { project: proj });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "", "no context injected");
});

test("session_start injects mode, recent actions, and decisions when active", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  engine(["allocate", "action", "--type", "chore", "--slug", "scaffolded", "--title", "Scaffolded toolchain"], { project: proj });
  engine(["allocate", "decision", "--slug", "evals", "--title", "Evals platform"], { project: proj });

  const r = run(SESSION_START, ["--root", "dev-chronicler", "--mode", "auto"], { project: proj });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /decision_log_mode = \*\*auto\*\*/);
  assert.match(ctx, /Scaffolded toolchain/);
  assert.match(ctx, /Evals platform/);
});

test("session_start surfaces the latest handover body", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const hPath = engine(["handover", "--slug", "state"], { project: proj }).stdout.trim();
  fs.writeFileSync(hPath, "# Handover\n\nThe walking skeleton is green.\n");

  const r = run(SESSION_START, ["--root", "dev-chronicler", "--mode", "propose"], { project: proj });
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Latest handover/);
  assert.match(ctx, /walking skeleton is green/);
});

test("session_start flags a superseded decision in the list", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const d1 = engine(["allocate", "decision", "--slug", "use-sqlite", "--title", "Use SQLite"], { project: proj }).stdout.trim();
  engine(["allocate", "decision", "--slug", "use-postgres", "--title", "Use Postgres"], { project: proj });
  // Reverse 0001 by adding a Superseded-by marker near the top (no status field).
  const marker = "**Superseded by:** [0002 — Use Postgres](0002-use-postgres.md)";
  const body = fs.readFileSync(d1, "utf8").replace("**Date:**", `${marker}\n**Date:**`);
  fs.writeFileSync(d1, body);

  const r = run(SESSION_START, ["--root", "dev-chronicler", "--mode", "propose"], { project: proj });
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Use SQLite.*superseded by \[0002 — Use Postgres\]\(0002-use-postgres\.md\)/);
  assert.doesNotMatch(ctx, /Use Postgres.*superseded/, "the live decision is not flagged");
});

test("session_start reads config from CLAUDE_PLUGIN_OPTION_* env vars (no flags)", () => {
  // Mirrors how the hook actually runs: hooks.json no longer passes
  // ${user_config.*} as flags, so the script must pick up the harness-exported
  // CLAUDE_PLUGIN_OPTION_* env vars. This is the path that was broken under
  // --plugin-dir (unresolved ${user_config.*} hard-failed the whole hook).
  const proj = mkProject();
  engine(["init"], { project: proj });
  engine(["allocate", "decision", "--slug", "evals", "--title", "Evals platform"], { project: proj });

  const r = run(SESSION_START, [], {
    project: proj,
    env: { CLAUDE_PLUGIN_OPTION_DECISION_LOG_MODE: "auto" },
  });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /decision_log_mode = \*\*auto\*\*/);
  assert.match(ctx, /Evals platform/);
});

test("session_start honours a custom chronicle_root via env var", () => {
  const proj = mkProject();
  engine(["init"], { project: proj, env: { CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT: "docs/chronicle" } });

  const r = run(SESSION_START, [], {
    project: proj,
    env: { CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT: "docs/chronicle" },
  });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /docs\/chronicle/);
});

// ---------- Stop nudge ----------

test("stop_nudge is silent when disabled", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const r = run(STOP_NUDGE, ["--root", "dev-chronicler", "--nudge", "off"], { project: proj });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("stop_nudge is silent right after init (chronicle too fresh)", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const data = mkDataDir();
  const r = run(STOP_NUDGE, ["--root", "dev-chronicler", "--nudge", "on"], {
    project: proj,
    env: { CLAUDE_PLUGIN_DATA: data },
  });
  assert.equal(r.stdout.trim(), "", "suppressed within the freshness window");
});

test("stop_nudge fires once when work is stale, then is rate-limited", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const data = mkDataDir();
  // Age the marker beyond the window so the 'just created' guard passes.
  backdate(path.join(proj, "dev-chronicler", ".chronicler.json"), 2 * HOUR);

  const first = run(STOP_NUDGE, ["--root", "dev-chronicler", "--nudge", "on"], {
    project: proj,
    env: { CLAUDE_PLUGIN_DATA: data },
  });
  const ctx = JSON.parse(first.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /action-log entry/i);

  // Second call immediately after → rate-limited by the state file.
  const second = run(STOP_NUDGE, ["--root", "dev-chronicler", "--nudge", "on"], {
    project: proj,
    env: { CLAUDE_PLUGIN_DATA: data },
  });
  assert.equal(second.stdout.trim(), "", "rate-limited within the window");
});

test("stop_nudge stays silent when an action was logged recently", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const data = mkDataDir();
  backdate(path.join(proj, "dev-chronicler", ".chronicler.json"), 2 * HOUR);
  // A freshly written action entry → agent is clearly logging.
  engine(["allocate", "action", "--type", "feat", "--slug", "just-logged"], { project: proj });

  const r = run(STOP_NUDGE, ["--root", "dev-chronicler", "--nudge", "on"], {
    project: proj,
    env: { CLAUDE_PLUGIN_DATA: data },
  });
  assert.equal(r.stdout.trim(), "", "recent action suppresses the nudge");
});

test("stop_nudge is silent on an un-initialised project", () => {
  const proj = mkProject();
  const r = run(STOP_NUDGE, ["--root", "dev-chronicler", "--nudge", "on"], { project: proj });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("stop_nudge reads config from CLAUDE_PLUGIN_OPTION_* env vars (no flags)", () => {
  // The hook runs with no flags; --nudge off must still be honoured via the
  // harness-exported env var.
  const proj = mkProject();
  engine(["init"], { project: proj });
  const r = run(STOP_NUDGE, [], {
    project: proj,
    env: { CLAUDE_PLUGIN_OPTION_STOP_NUDGE: "off" },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "", "stop_nudge=off via env suppresses the nudge");
});

test("stop_nudge fires (no flags) when stale, reading root from env var", () => {
  const proj = mkProject();
  engine(["init"], { project: proj, env: { CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT: "log" } });
  const data = mkDataDir();
  backdate(path.join(proj, "log", ".chronicler.json"), 2 * HOUR);

  const r = run(STOP_NUDGE, [], {
    project: proj,
    env: { CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT: "log", CLAUDE_PLUGIN_DATA: data },
  });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /action-log entry/i);
  assert.match(ctx, /\blog\/actions\//, "nudge references the custom root");
});
