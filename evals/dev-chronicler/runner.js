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
const { execFileSync, spawn } = require("child_process");

const HERE = __dirname;

// All progress goes to stderr so stdout stays clean (pure JSON under --json).
function log(msg = "") {
  process.stderr.write(msg + "\n");
}
function snippet(s, n = 120) {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}
function toolHint(block) {
  const i = block.input || {};
  if (i.file_path) return " " + path.basename(i.file_path);
  if (i.command) return " " + snippet(i.command, 70);
  if (i.path) return " " + i.path;
  if (i.pattern) return " /" + snippet(i.pattern, 40) + "/";
  return "";
}
function fmtCost(c) {
  return typeof c === "number" ? "$" + c.toFixed(3) : "$?";
}
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

// Drive one headless turn, streaming the agent's activity live to stderr.
// Resolves with the session id so the next turn can --resume.
function runClaudeTurn(prompt, { cwd, pluginDir, model, sessionId, skipPermissions }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, CLAUDE_PLUGIN_OPTION_DECISION_LOG_MODE: "auto" };
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--plugin-dir", pluginDir];
    if (model) args.push("--model", model);
    if (skipPermissions) args.push("--dangerously-skip-permissions");
    if (sessionId) args.push("--resume", sessionId);

    const child = spawn("claude", args, { cwd, env });
    let buf = "";
    let session = sessionId;
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch (_) {
          continue;
        }
        if (ev.type === "system" && ev.subtype === "init") {
          session = ev.session_id || session;
          log(`     · model ${ev.model || "?"}, session ${String(ev.session_id || "").slice(0, 8)}`);
        } else if (ev.type === "assistant" && ev.message && Array.isArray(ev.message.content)) {
          for (const b of ev.message.content) {
            if (b.type === "text" && b.text && b.text.trim()) log(`     💬 ${snippet(b.text)}`);
            else if (b.type === "tool_use") log(`     ⚙ ${b.name}${toolHint(b)}`);
          }
        } else if (ev.type === "result") {
          session = ev.session_id || session;
          log(`     ✓ ${ev.num_turns || "?"} turns · ${fmtCost(ev.total_cost_usd)} · ${Math.round((ev.duration_ms || 0) / 1000)}s`);
        }
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}${stderr ? ": " + snippet(stderr, 200) : ""}`));
      else resolve(session);
    });
  });
}

function runNode(script, args) {
  // structural-eval exits non-zero when it finds errors, but still prints its
  // JSON verdict — so capture stdout regardless of exit code.
  try {
    const out = execFileSync(process.execPath, [script, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout);
      } catch (_) {
        /* fall through */
      }
    }
    throw e;
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const seed = path.resolve(flags.seed || path.join(HERE, "seed"));
  const golden = path.resolve(flags.golden || path.join(HERE, "golden"));
  const promptsFile = path.resolve(flags.prompts || path.join(HERE, "prompts", "session.json"));
  const pluginDir = path.resolve(flags.pluginDir || DEFAULT_PLUGIN);
  const backend = flags.backend || (flags.dryRun ? "mock" : "cli");

  const session = JSON.parse(fs.readFileSync(promptsFile, "utf8"));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "dcw-run-"));
  const candidate = path.join(work, "project");

  log(`╶─ dev-chronicler eval runner ──────────────`);
  log(`   mode:    ${flags.dryRun ? "dry-run (no model)" : "live"}`);
  log(`   seed:    ${seed}`);
  log(`   golden:  ${golden}`);
  log(`   judge:   ${backend}${flags.model ? " (" + flags.model + ")" : ""}`);
  log("");

  try {
    log(`▸ Preparing workspace`);
    copyDir(seed, candidate);
    log(`     copied seed → ${candidate}`);
    log("");

    if (flags.dryRun) {
      log(`▸ Generation: skipped (dry-run)`);
    } else {
      log(`▸ Generating: ${session.steps.length} prompted turns via claude -p`);
      let sessionId;
      let n = 0;
      for (const step of session.steps) {
        n++;
        log(`  → [${n}/${session.steps.length}] ${step.id}${step.note ? " — " + step.note : ""}`);
        sessionId = await runClaudeTurn(step.prompt, {
          cwd: candidate,
          pluginDir,
          model: flags.model,
          sessionId,
          skipPermissions: flags.skipPermissions,
        });
      }
    }
    log("");

    log(`▸ Scoring: structural eval`);
    const structural = runNode(STRUCTURAL, [candidate, "--json"]);
    log(`     ${structural.score.passed}/${structural.score.total} — ${structural.ok ? "PASS" : "FAIL"}`);

    log(`▸ Scoring: LLM judge (${backend})${backend === "cli" || backend === "api" ? " — querying model, please wait…" : ""}`);
    const judge = runNode(JUDGE, [candidate, "--golden", golden, "--backend", backend, "--json", ...(flags.model ? ["--model", flags.model] : [])]);
    log(`     overall ${judge.overall}/5`);
    log("");

    const result = {
      mode: flags.dryRun ? "dry-run" : "live",
      candidate,
      structural: { ok: structural.ok, score: structural.score },
      judge: { ok: judge.dimensions ? true : false, overall: judge.overall, dimensions: judge.dimensions },
    };

    if (flags.json) {
      process.stdout.write(JSON.stringify({ ...result, structuralChecks: structural.checks, judgeFull: judge }, null, 2) + "\n");
    } else {
      const out = [];
      out.push(`=== eval result (${result.mode}, judge: ${backend}) ===`);
      out.push("");
      out.push(`structural: ${structural.score.passed}/${structural.score.total} — ${structural.ok ? "PASS" : "FAIL"}`);
      for (const c of structural.checks || []) out.push(`   ${c.pass ? "✓" : "✗"} ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
      out.push("");
      out.push(`judge overall: ${judge.overall}/5`);
      for (const d of judge.dimensions || []) {
        out.push(`   ${d.score}/5  ${d.title || d.key}`);
        if (d.rationale) out.push(`         ${snippet(d.rationale, 200)}`);
      }
      if (judge.summary) {
        out.push("");
        out.push(`   summary: ${judge.summary}`);
      }
      process.stdout.write(out.join("\n") + "\n");
    }

    if (!structural.ok) process.exitCode = 1;
  } finally {
    if (flags.keep) log(`\n(kept working dir: ${candidate})`);
    else rmrf(work);
  }
}

main().catch((e) => {
  process.stderr.write(`runner: ${e.message}\n`);
  process.exit(1);
});
