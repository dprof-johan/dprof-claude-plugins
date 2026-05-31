"use strict";

// Guards the structural eval harness: the golden must score 10/10, and an
// obviously-deficient chronicle must fail. Runnable via `node --test` from this
// directory (CI does this against the committed golden).

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HARNESS = path.join(__dirname, "structural-eval.js");
const ENGINE = path.join(__dirname, "..", "..", "plugins", "dev-chronicler", "scripts", "chronicle.js");

function runHarness(projectDir) {
  try {
    const out = execFileSync(process.execPath, [HARNESS, projectDir, "--json"], { encoding: "utf8" });
    return { status: 0, json: JSON.parse(out) };
  } catch (e) {
    return { status: e.status || 1, json: e.stdout ? JSON.parse(e.stdout) : null };
  }
}

test("the golden chronicle scores 10/10 and passes", () => {
  const r = runHarness(path.join(__dirname, "golden"));
  assert.equal(r.status, 0, "harness exits 0 for the golden");
  assert.equal(r.json.ok, true);
  assert.equal(r.json.score.passed, r.json.score.total);
  assert.equal(r.json.score.total, 10);
});

test("a deficient chronicle fails the structural eval", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "dcw-eval-"));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: proj };
  execFileSync(process.execPath, [ENGINE, "init"], { env });
  // One decision only, containing a wikilink (doctor error) — far short of the bar.
  const dec = path.join(proj, "dev-chronicler", "decisions", "0001-x.md");
  fs.writeFileSync(dec, "# 0001 — X\n\n**Date:** 2026-01-01\n\n## Context\nSee [[0002-y]].\n");

  const r = runHarness(proj);
  assert.notEqual(r.status, 0, "harness exits non-zero for a deficient chronicle");
  assert.equal(r.json.ok, false);
  assert.ok(r.json.score.passed < r.json.score.total);
  // Specific failures we expect to see.
  const failed = new Set(r.json.checks.filter((c) => !c.pass).map((c) => c.id));
  assert.ok(failed.has("doctor-clean"), "wikilink trips doctor");
  assert.ok(failed.has("decisions>=2"));
  assert.ok(failed.has("handover>=1"));
});
