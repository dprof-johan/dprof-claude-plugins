#!/usr/bin/env node
/*
 * End-to-end eval runner for dev-chronicler.
 *
 * Closes the loop: prompts -> generated chronicle -> scored against the golden.
 * It copies the SEED project (the base RPG + its existing chronicle) into a temp
 * dir, drives a headless `claude -p` session through prompts/session.json (with
 * the plugin loaded and decision_log_mode=auto) to make one tiny, fully-specified
 * extension and chronicle it, then runs the structural eval and the LLM judge on
 * the result versus the golden.
 *
 * The generation step is non-deterministic and spends subscription/API quota, so
 * this is a local tool, never a CI gate. `--dry-run` skips generation entirely
 * (copies the seed and scores it as-is) to exercise the copy + eval plumbing with
 * no model — that path is what the self-tests and CI use.
 *
 * Usage:
 *   node runner.js [--dry-run] [--keep] [--json]
 *                  [--seed <dir>] [--golden <dir>] [--prompts <file>]
 *                  [--plugin-dir <dir>] [--model <m>] [--backend cli|api|mock]
 *                  [--no-skip-permissions]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const REPO_ROOT = path.join(HERE, "..", "..");
const STRUCTURAL = path.join(HERE, "structural-eval.js");
const JUDGE = path.join(HERE, "judge.js");
const DEFAULT_PLUGIN = path.join(REPO_ROOT, "plugins", "dev-chronicler");

function parseArgs(argv) {
  const flags = { skipPermissions: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--keep") flags.keep = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--no-skip-permissions") flags.skipPermissions = false;
    else if (a === "--seed") flags.seed = argv[++i];
    else if (a === "--golden") flags.golden = argv[++i];
    else if (a === "--prompts") flags.prompts = argv[++i];
    else if (a === "--plugin-dir") flags.pluginDir = argv[++i];
    else if (a === "--model") flags.model = argv[++i];
    else if (a === "--backend") flags.backend = argv[++i];
  }
  return flags;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === "__pycache__" || ent.name.endsWith(".pyc")) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// Drive one headless turn; returns the session id so the next turn can --resume.
function runClaudeTurn(prompt, { cwd, pluginDir, model, sessionId, skipPermissions }) {
  const env = { ...process.env, CLAUDE_PLUGIN_OPTION_DECISION_LOG_MODE: "auto" };
  const args = ["-p", prompt, "--output-format", "json", "--plugin-dir", pluginDir];
  if (model) args.push("--model", model);
  if (skipPermissions) args.push("--dangerously-skip-permissions");
  if (sessionId) args.push("--resume", sessionId);
  const raw = execFileSync("claude", args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const envelope = JSON.parse(raw);
  return envelope.session_id || sessionId;
}

function runNode(script, args) {
  const out = execFileSync(process.execPath, [script, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const seed = path.resolve(flags.seed || path.join(HERE, "seed"));
  const golden = path.resolve(flags.golden || path.join(HERE, "golden"));
  const promptsFile = path.resolve(flags.prompts || path.join(HERE, "prompts", "session.json"));
  const pluginDir = path.resolve(flags.pluginDir || DEFAULT_PLUGIN);
  const backend = flags.backend || (flags.dryRun ? "mock" : "cli");

  const session = JSON.parse(fs.readFileSync(promptsFile, "utf8"));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "dcw-run-"));
  const candidate = path.join(work, "project");

  try {
    copyDir(seed, candidate);

    if (flags.dryRun) {
      if (!flags.json) process.stdout.write(`[dry-run] copied seed → ${candidate}; skipping generation\n`);
    } else {
      let sessionId;
      for (const step of session.steps) {
        if (!flags.json) process.stdout.write(`→ ${step.id}\n`);
        sessionId = runClaudeTurn(step.prompt, {
          cwd: candidate,
          pluginDir,
          model: flags.model,
          sessionId,
          skipPermissions: flags.skipPermissions,
        });
      }
    }

    const structural = runNode(STRUCTURAL, [candidate, "--json"]);
    const judge = runNode(JUDGE, [candidate, "--golden", golden, "--backend", backend, "--json", ...(flags.model ? ["--model", flags.model] : [])]);

    const result = {
      mode: flags.dryRun ? "dry-run" : "live",
      candidate,
      structural: { ok: structural.ok, score: structural.score },
      judge: { ok: judge.dimensions ? true : false, overall: judge.overall, dimensions: judge.dimensions },
    };

    if (flags.json) {
      process.stdout.write(JSON.stringify({ ...result, structuralChecks: structural.checks, judgeFull: judge }, null, 2) + "\n");
    } else {
      process.stdout.write(`\n=== eval runner (${result.mode}, judge backend: ${backend}) ===\n`);
      process.stdout.write(`structural: ${structural.score.passed}/${structural.score.total} — ${structural.ok ? "PASS" : "FAIL"}\n`);
      process.stdout.write(`judge overall: ${judge.overall}/5\n`);
      for (const d of judge.dimensions || []) process.stdout.write(`   ${d.score}/5  ${d.title || d.key}\n`);
      if (judge.summary) process.stdout.write(`   ${judge.summary}\n`);
    }

    if (!structural.ok) process.exitCode = 1;
  } finally {
    if (flags.keep) process.stdout.write(`(kept working dir: ${candidate})\n`);
    else rmrf(work);
  }
}

main();
