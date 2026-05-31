"use strict";

// Self-tests for the LLM-as-judge harness, run with the deterministic `mock`
// backend so they need no model, no auth, and no network — safe for CI. They
// guard the *plumbing*: verdict shape, score bounds, and that the golden scores
// strictly higher than an obviously-worse chronicle.

const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const JUDGE = path.join(__dirname, "judge.js");
const ENGINE = path.join(__dirname, "..", "..", "plugins", "dev-chronicler", "scripts", "chronicle.js");
const GOLDEN = path.join(__dirname, "golden");

function judge(candidateDir) {
  const out = execFileSync(process.execPath, [JUDGE, candidateDir, "--backend", "mock", "--json"], { encoding: "utf8" });
  return JSON.parse(out);
}

test("mock judge returns a well-formed verdict for the golden", () => {
  const v = judge(GOLDEN);
  assert.equal(v.dimensions.length, 5);
  for (const d of v.dimensions) {
    assert.ok(d.score >= 1 && d.score <= 5, `${d.key} score in range`);
    assert.ok(typeof d.rationale === "string");
  }
  assert.ok(v.overall >= 1 && v.overall <= 5);
});

test("the golden scores near the top", () => {
  const v = judge(GOLDEN);
  assert.ok(v.overall >= 4, `golden overall ${v.overall} should be >= 4`);
});

test("a deficient chronicle scores strictly lower than the golden", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "dcw-judge-"));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: proj };
  execFileSync(process.execPath, [ENGINE, "init"], { env });
  // One thin decision with a wikilink; no actions, no handover.
  fs.writeFileSync(
    path.join(proj, "dev-chronicler", "decisions", "0001-x.md"),
    "# 0001 — X\n\n**Date:** 2026-01-01\n\n## Context\nSee [[0002-y]].\n"
  );

  const golden = judge(GOLDEN);
  const weak = judge(proj);
  assert.ok(weak.overall < golden.overall, `weak ${weak.overall} should be < golden ${golden.overall}`);
});
