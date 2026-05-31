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

test("handover creates a timestamped file from a skeleton", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });

  const p1 = engine(["handover", "--slug", "alpha", "--title", "Alpha snapshot"], { project: proj }).stdout.trim();
  assert.match(p1, /handovers[/\\]\d{4}-\d{2}-\d{2}-\d{4}-alpha\.md$/);
  assert.ok(fs.existsSync(p1), "handover file was created");
  const body = read(p1);
  assert.match(body, /^# Handover — Alpha snapshot$/m);
  assert.match(body, /## Where things stand/);
  assert.match(body, /## Next steps/);
});

test("handover defaults the slug to 'handover' when none is given", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const p = engine(["handover"], { project: proj }).stdout.trim();
  assert.match(p, /handovers[/\\]\d{4}-\d{2}-\d{2}-\d{4}-handover\.md$/);
  assert.ok(fs.existsSync(p));
});

test("init is idempotent — re-running doesn't clobber edits", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const readme = path.join(proj, "dev-chronicler", "decisions", "README.md");
  fs.writeFileSync(readme, "# Decisions\n\nHand-edited sentinel.\n");
  const marker = path.join(proj, "dev-chronicler", ".chronicler.json");
  const created = JSON.parse(read(marker)).created;

  const r = engine(["init"], { project: proj });
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(readme), /Hand-edited sentinel/, "existing README left untouched");
  assert.equal(JSON.parse(read(marker)).created, created, "marker not rewritten");
});

test("status reports counts and the latest entry per kind", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  engine(["allocate", "action", "--slug", "first", "--title", "First episode"], { project: proj });
  engine(["allocate", "action", "--slug", "second", "--title", "Second episode"], { project: proj });
  engine(["allocate", "decision", "--slug", "a-choice", "--title", "A choice"], { project: proj });

  const s = JSON.parse(engine(["status"], { project: proj }).stdout);
  assert.equal(s.active, true);
  assert.equal(s.actions.count, 2);
  assert.equal(s.actions.latest, "0002 — Second episode");
  assert.equal(s.decisions.count, 1);
  assert.equal(s.handovers.count, 0);
});

test("slugify normalises messy slugs and falls back to 'entry'", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const a = engine(["allocate", "action", "--slug", "Hello, World!!  Again"], { project: proj });
  assert.match(a.stdout.trim(), /actions[/\\]0001-hello-world-again\.md$/);
  const b = engine(["allocate", "action", "--slug", "***"], { project: proj });
  assert.match(b.stdout.trim(), /actions[/\\]0002-entry\.md$/);
});

test("allocate rejects a value-less --slug", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const r = engine(["allocate", "action", "--slug"], { project: proj });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /requires --slug/i);
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
