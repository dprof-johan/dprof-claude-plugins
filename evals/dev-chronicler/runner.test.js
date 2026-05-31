"use strict";

// Guards the runner's plumbing without a model: --dry-run copies the seed and
// runs structural + (mock) judge on it, so we verify the copy + eval chaining
// produces a combined result. The live generation path (claude -p) is not
// exercised here — it's non-deterministic and spends quota.

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const path = require("path");

const RUNNER = path.join(__dirname, "runner.js");

function dryRun() {
  const out = execFileSync(process.execPath, [RUNNER, "--dry-run", "--json"], { encoding: "utf8" });
  return JSON.parse(out);
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
