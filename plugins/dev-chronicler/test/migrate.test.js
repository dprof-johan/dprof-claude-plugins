"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { mkProject, engine } = require("./helpers");

function decisionsDir(proj) {
  return path.join(proj, "dev-chronicler", "decisions");
}
function write(p, body) {
  fs.writeFileSync(p, body);
}
function read(p) {
  return fs.readFileSync(p, "utf8");
}

// Build an old-format chronicle (pre-0.2): Status lines, wikilinks, an index block.
function seedOldChronicle(proj) {
  engine(["init"], { project: proj });
  const d = decisionsDir(proj);
  write(
    path.join(d, "0001-use-sqlite.md"),
    "# 0001 — Use SQLite\n\n**Status:** Superseded by 0002\n\n## Context\nSee [[actions/0009-bootstrap]] and [[0002-use-postgres]].\n"
  );
  write(
    path.join(d, "0002-use-postgres.md"),
    "# 0002 — Use Postgres\n\n**Status:** Accepted\n\n## Context\nScaling.\n"
  );
  write(
    path.join(d, "README.md"),
    "# Decisions\n\n## Index\n\n<!-- chronicle:index:start -->\n- [0001](0001-use-sqlite.md)\n<!-- chronicle:index:end -->\n"
  );
}

test("migrate --dry-run lists files without writing", () => {
  const proj = mkProject();
  seedOldChronicle(proj);
  const before = read(path.join(decisionsDir(proj), "0001-use-sqlite.md"));

  const r = engine(["migrate", "--dry-run"], { project: proj });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would change/);
  assert.match(r.stdout, /0001-use-sqlite\.md/);
  assert.equal(read(path.join(decisionsDir(proj), "0001-use-sqlite.md")), before, "dry-run left the file untouched");
});

test("migrate keeps Proposed/Accepted status and converts old Superseded status into a marker", () => {
  const proj = mkProject();
  seedOldChronicle(proj);
  engine(["migrate"], { project: proj });

  const d1 = read(path.join(decisionsDir(proj), "0001-use-sqlite.md"));
  const d2 = read(path.join(decisionsDir(proj), "0002-use-postgres.md"));

  assert.match(d2, /^\*\*Status:\*\* Accepted$/m, "valid status line is kept");
  assert.match(d1, /\*\*Superseded by:\*\* \[0002 — Use Postgres\]\(0002-use-postgres\.md\)/);
  assert.doesNotMatch(d1, /\*\*Status:\*\* Superseded/, "old 'Status: Superseded by' converted away");
});

test("migrate converts wikilinks to relative Markdown links", () => {
  const proj = mkProject();
  seedOldChronicle(proj);
  engine(["migrate"], { project: proj });

  const d1 = read(path.join(decisionsDir(proj), "0001-use-sqlite.md"));
  assert.doesNotMatch(d1, /\[\[/, "no wikilinks remain");
  // same-folder link resolves the heading; cross-folder link uses ../actions/
  assert.match(d1, /\[0002 — Use Postgres\]\(0002-use-postgres\.md\)/);
  assert.match(d1, /\[actions\/0009-bootstrap\]\(\.\.\/actions\/0009-bootstrap\.md\)/);
});

test("migrate strips the generated index block from a folder README", () => {
  const proj = mkProject();
  seedOldChronicle(proj);
  engine(["migrate"], { project: proj });

  const readme = read(path.join(decisionsDir(proj), "README.md"));
  assert.doesNotMatch(readme, /chronicle:index/);
  assert.doesNotMatch(readme, /## Index/);
});

test("migrate leaves a migrated chronicle clean for doctor", () => {
  const proj = mkProject();
  seedOldChronicle(proj);
  engine(["migrate"], { project: proj });
  // The cross-folder action target doesn't exist, so doctor will flag that one
  // broken link — but there must be no wikilinks left.
  const r = engine(["doctor"], { project: proj });
  assert.doesNotMatch(r.stdout, /wikilink/i, "no wikilinks after migrate");
});

test("migrate is idempotent — a current chronicle is a no-op", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  engine(["allocate", "decision", "--slug", "x", "--title", "X"], { project: proj });

  const r = engine(["migrate"], { project: proj });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nothing to change/);
});
