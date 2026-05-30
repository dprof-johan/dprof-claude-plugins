"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { mkProject, engine, engineAsync } = require("./helpers");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("init scaffolds folders, marker, and READMEs; status reports active", () => {
  const proj = mkProject();
  const r = engine(["init"], { project: proj });
  assert.equal(r.status, 0, r.stderr);

  const base = path.join(proj, "dev-chronicler");
  for (const sub of ["decisions", "actions", "handovers"]) {
    assert.ok(fs.existsSync(path.join(base, sub)), `${sub}/ exists`);
    assert.ok(fs.existsSync(path.join(base, sub, "README.md")), `${sub}/README.md exists`);
  }
  assert.ok(fs.existsSync(path.join(base, ".chronicler.json")), "marker exists");

  const status = JSON.parse(engine(["status"], { project: proj }).stdout);
  assert.equal(status.active, true);
  assert.equal(status.actions.count, 0);
});

test("allocate assigns sequential, per-kind numbers and writes a skeleton", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });

  const a1 = engine(["allocate", "action", "--slug", "first", "--title", "First"], { project: proj });
  const a2 = engine(["allocate", "action", "--slug", "second"], { project: proj });
  const d1 = engine(["allocate", "decision", "--slug", "pick-db", "--title", "Pick a DB"], { project: proj });

  assert.match(a1.stdout.trim(), /actions[/\\]0001-first\.md$/);
  assert.match(a2.stdout.trim(), /actions[/\\]0002-second\.md$/);
  assert.match(d1.stdout.trim(), /decisions[/\\]0001-pick-db\.md$/, "decisions number independently");

  const body = read(a1.stdout.trim());
  assert.match(body, /^# 0001 — First$/m);
  assert.match(body, /## What I did/);
  assert.match(body, /## Outcome/);

  const adr = read(d1.stdout.trim());
  assert.doesNotMatch(adr, /\*\*Status:\*\*/, "no Proposed/Accepted status line");
  assert.match(adr, /\*\*Date:\*\*/);
  assert.match(adr, /## Alternatives considered/);
});

test("handover prints a timestamped path", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });

  const p1 = engine(["handover", "--slug", "alpha"], { project: proj }).stdout.trim();
  assert.match(p1, /handovers[/\\]\d{4}-\d{2}-\d{2}-\d{4}-alpha\.md$/);
  // handover only prints the path; the agent writes the file.
});

test("allocate on an un-initialised project fails loudly without writing files", () => {
  const proj = mkProject();
  const r = engine(["allocate", "action", "--slug", "nope"], { project: proj });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not initialised/i);
  assert.ok(!fs.existsSync(path.join(proj, "dev-chronicler")), "no folder created");
});

test("custom --root is honoured", () => {
  const proj = mkProject();
  engine(["init", "--root", "chronicle"], { project: proj });
  const a = engine(["allocate", "action", "--slug", "x", "--root", "chronicle"], { project: proj });
  assert.match(a.stdout.trim(), /[/\\]chronicle[/\\]actions[/\\]0001-x\.md$/);
});

test("concurrent allocations never share a number", async () => {
  const proj = mkProject();
  engine(["init"], { project: proj });

  const N = 12;
  const runs = Array.from({ length: N }, (_, i) =>
    engineAsync(["allocate", "action", "--slug", `episode-${i}`], { project: proj })
  );
  const results = await Promise.all(runs);
  for (const r of results) assert.equal(r.status, 0, r.stderr);

  const files = fs
    .readdirSync(path.join(proj, "dev-chronicler", "actions"))
    .filter((f) => /^\d{4}-/.test(f));
  assert.equal(files.length, N, "one file per allocation");
  const numbers = files.map((f) => f.slice(0, 4));
  assert.equal(new Set(numbers).size, N, "all numbers are unique");
});
