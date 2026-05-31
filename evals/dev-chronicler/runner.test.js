"use strict";

// Guards the runner's plumbing without a model: --dry-run copies the seed and
// runs structural + (mock) judge on it, so we verify the copy + eval chaining
// produces a combined result. The live generation path (claude -p) is not
// exercised here — it's non-deterministic and spends quota.

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RUNNER = path.join(__dirname, "runner.js");
const ENGINE = path.join(__dirname, "..", "..", "plugins", "dev-chronicler", "scripts", "chronicle.js");

// Run the runner; tolerate a non-zero exit (it exits 1 when structural fails) and
// still parse the JSON it printed.
function runRunner(args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [RUNNER, ...args], { encoding: "utf8" }));
  } catch (e) {
    if (e.stdout) return JSON.parse(e.stdout);
    throw e;
  }
}

function dryRun() {
  return runRunner(["--dry-run", "--json"]);
}

test("dry-run chains structural + judge into one result", () => {
  const r = dryRun();
  assert.equal(r.mode, "dry-run");
  // structural eval ran and the seed is well-formed
  assert.equal(r.structural.ok, true);
  assert.equal(r.structural.score.total, 10);
  assert.equal(r.structural.score.passed, 10);
  // judge ran (mock backend) and produced a full per-dimension verdict
  assert.equal(r.judge.dimensions.length, 5);
  assert.ok(r.judge.overall >= 1 && r.judge.overall <= 5);
});

test("a structurally-failing candidate still completes the pipeline (no crash)", () => {
  // Guards runNode: structural-eval exits non-zero on errors but prints JSON, so
  // the runner must keep going (run the judge, report) rather than throwing.
  const seed = fs.mkdtempSync(path.join(os.tmpdir(), "dcw-seed-"));
  execFileSync(process.execPath, [ENGINE, "init"], { env: { ...process.env, CLAUDE_PROJECT_DIR: seed } });
  // A real wikilink → doctor error → structural fails.
  fs.writeFileSync(
    path.join(seed, "dev-chronicler", "decisions", "0001-x.md"),
    "# 0001 — X\n\n**Date:** 2026-01-01\n\n## Context\nSee [[0002-y]].\n"
  );

  const r = runRunner(["--dry-run", "--seed", seed, "--json"]);
  assert.equal(r.structural.ok, false, "structural reports failure rather than crashing the runner");
  assert.equal(r.judge.dimensions.length, 5, "judge still ran after a failing structural eval");
});
