#!/usr/bin/env node
/*
 * PreToolUse guard for dev-chronicler.
 *
 * Stops the agent from hand-creating chronicle files. Decision/action/handover
 * entries — and the init scaffolding — must come from the engine, which writes
 * via `fs` (not the Write tool), so the engine itself is never blocked. Editing
 * an existing engine-made file (filling a skeleton) is allowed; creating a NEW
 * file by hand anywhere under the chronicle root is denied with a pointer to the
 * engine.
 *
 * Reads the PreToolUse JSON from stdin; matched to the Write tool in hooks.json.
 * Fails OPEN (allows) on any error so a bug can never block legitimate writes.
 */

"use strict";

const fs = require("fs");
const path = require("path");

function allow() {
  process.exit(0); // no output → normal permission flow
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (_) {
    return allow();
  }
  if (!input || input.tool_name !== "Write") return allow();
  const file = input.tool_input && input.tool_input.file_path;
  if (!file) return allow();

  const root =
    process.env.CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT || process.env.CHRONICLE_ROOT || "dev-chronicler";
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const base = path.join(projectDir, root);

  const abs = path.resolve(projectDir, file);
  const rel = path.relative(base, abs);
  const underChronicle = rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  if (!underChronicle) return allow(); // not chronicle territory

  // Allow editing/overwriting a file the engine already created (filling a skeleton).
  if (fs.existsSync(abs)) return allow();

  // New file under the chronicle root, written by hand → block, point to the engine.
  const eng = process.env.CLAUDE_PLUGIN_ROOT
    ? `node "${process.env.CLAUDE_PLUGIN_ROOT}/scripts/chronicle.js"`
    : "the dev-chronicler engine (scripts/chronicle.js)";
  return deny(
    `dev-chronicler: don't hand-create files under ${root}/. Use the engine so the number, ` +
      `type, status and format are correct: run \`${eng} init\` to scaffold, or ` +
      `\`allocate decision|action --type <t> --slug <s>\` / \`handover --slug <s>\` to add an entry, ` +
      `then fill the file it prints. (Editing an existing entry is allowed.)`
  );
}

main();
