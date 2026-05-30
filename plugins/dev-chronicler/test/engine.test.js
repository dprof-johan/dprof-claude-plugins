"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { mkProject, engine, engineAsync } = require("./helpers");

function read(p) {
  return fs.readFileSync(p, "utf8");
}
function indexBlock(readme) {
  const m = read(readme).match(/index:start -->\n([\s\S]*?)\n<!-- chronicle:index:end/);
  return m ? m[1] : "";
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
  assert.match(adr, /\*\*Status:\*\* Proposed/);
  assert.match(adr, /## Alternatives considered/);
});

test("allocate rebuilds the README index", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  engine(["allocate", "action", "--slug", "did-a-thing", "--title", "Did a thing"], { project: proj });

  const idx = indexBlock(path.join(proj, "dev-chronicler", "actions", "README.md"));
  assert.match(idx, /\[0001 — Did a thing\]\(0001-did-a-thing\.md\)/);
});

test("decision index reflects an edited Status after reindex (supersede flow)", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const d1 = engine(["allocate", "decision", "--slug", "use-sqlite", "--title", "Use SQLite"], { project: proj }).stdout.trim();
  engine(["allocate", "decision", "--slug", "use-postgres", "--title", "Use Postgres"], { project: proj });

  fs.writeFileSync(d1, read(d1).replace("**Status:** Proposed", "**Status:** Superseded by 0002"));
  const r = engine(["reindex", "decision"], { project: proj });
  assert.equal(r.status, 0, r.stderr);

  const idx = indexBlock(path.join(proj, "dev-chronicler", "decisions", "README.md"));
  assert.match(idx, /\[0001 — Use SQLite\]\(0001-use-sqlite\.md\) — Superseded by 0002/);
  assert.match(idx, /\[0002 — Use Postgres\]\(0002-use-postgres\.md\) — Proposed/);
});

test("handover prints a timestamped path and reindexes newest-first", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });

  const p1 = engine(["handover", "--slug", "alpha"], { project: proj }).stdout.trim();
  assert.match(p1, /handovers[/\\]\d{4}-\d{2}-\d{2}-\d{4}-alpha\.md$/);
  // handover only prints the path; the agent writes the file. Simulate two.
  fs.writeFileSync(p1, "# Handover alpha\n");
  const p2 = path.join(path.dirname(p1), "2099-01-01-0000-omega.md");
  fs.writeFileSync(p2, "# Handover omega\n");
  engine(["reindex", "handover"], { project: proj });

  const idx = indexBlock(path.join(proj, "dev-chronicler", "handovers", "README.md"));
  const lines = idx.trim().split("\n");
  assert.match(lines[0], /omega/, "newest (2099) listed first");
  assert.match(lines[1], /alpha/);
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
