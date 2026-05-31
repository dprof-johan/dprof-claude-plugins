"use strict";

// Tests for the PreToolUse guard: hand-creating a NEW file under the chronicle
// root is denied (with a pointer to the engine); editing an existing entry and
// writing anywhere outside the chronicle are allowed.

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { mkProject, engine } = require("./helpers");

const GUARD = path.join(__dirname, "..", "scripts", "pretool_guard.js");

// Run the guard with a PreToolUse payload on stdin; returns {decision, raw}.
function guard(toolInput, { project, toolName = "Write" } = {}) {
  const env = { ...process.env };
  if (project) env.CLAUDE_PROJECT_DIR = project;
  const payload = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  const raw = execFileSync(process.execPath, [GUARD], { input: payload, env, encoding: "utf8" });
  let decision = null;
  if (raw.trim()) {
    try {
      decision = JSON.parse(raw).hookSpecificOutput.permissionDecision;
    } catch (_) {}
  }
  return { decision, raw };
}

test("denies hand-creating a new file under the chronicle root", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const r = guard({ file_path: path.join(proj, "dev-chronicler", "actions", "9999-hand-rolled.md"), content: "# nope" }, { project: proj });
  assert.equal(r.decision, "deny");
  assert.match(r.raw, /Use the engine/);
});

test("allows editing/overwriting an existing engine-made entry", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const made = engine(["allocate", "action", "--type", "feat", "--slug", "real"], { project: proj }).stdout.trim();
  const r = guard({ file_path: made, content: "# filled in" }, { project: proj });
  assert.equal(r.decision, null, "no deny for an existing file");
});

test("allows writing files outside the chronicle (e.g. source, CLAUDE.md)", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  assert.equal(guard({ file_path: path.join(proj, "src", "main.py"), content: "x" }, { project: proj }).decision, null);
  assert.equal(guard({ file_path: path.join(proj, "CLAUDE.md"), content: "x" }, { project: proj }).decision, null);
});

test("blocks hand-rolled init (writing a README into the chronicle root)", () => {
  const proj = mkProject();
  // No engine init — simulate the agent improvising the chronicle by hand.
  const r = guard({ file_path: path.join(proj, "dev-chronicler", "README.md"), content: "# Chronicle" }, { project: proj });
  assert.equal(r.decision, "deny");
});

test("ignores non-Write tools", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const r = guard({ file_path: path.join(proj, "dev-chronicler", "actions", "9999-x.md") }, { project: proj, toolName: "Read" });
  assert.equal(r.decision, null);
});
