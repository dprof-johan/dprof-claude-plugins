"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { mkProject, engine } = require("./helpers");

// Write a fully-filled decision so it doesn't trip placeholder/section checks.
function writeDecision(proj, name, body) {
  const f = path.join(proj, "dev-chronicler", "decisions", name);
  fs.writeFileSync(f, body);
  return f;
}

const FULL_DECISION = `# 0001 — Use SQLite

**Status:** Accepted
**Date:** 2026-05-13

## Context
Some context.

## Decision
Use SQLite.

## Alternatives considered
Postgres — too heavy.

## Consequences
Single-writer.

## Related
`;

test("doctor reports a healthy chronicle with exit 0", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  writeDecision(proj, "0001-use-sqlite.md", FULL_DECISION);

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /chronicle is healthy/);
});

test("doctor flags a leftover wikilink as an error (exit 1)", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  writeDecision(proj, "0001-use-sqlite.md", FULL_DECISION.replace("## Related\n", "## Related\nSee [[0002-other]].\n"));

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /wikilink/i);
});

test("doctor does not flag `[[` inside inline code as a wikilink", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  // A Python type annotation in inline code legitimately contains `[[`.
  writeDecision(
    proj,
    "0001-use-sqlite.md",
    FULL_DECISION.replace("Postgres — too heavy.", "Considered a `Callable[[Entity], None]` hook and pandas `df[[col]]`; too heavy.")
  );

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /wikilink/i);
});

test("doctor flags a broken relative link as an error (exit 1)", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  writeDecision(proj, "0001-use-sqlite.md", FULL_DECISION.replace("## Related\n", "## Related\n- [missing](0099-nope.md)\n"));

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /broken link: 0099-nope\.md/);
});

test("doctor accepts a valid cross-folder relative link", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  const action = engine(["allocate", "action", "--type", "feat", "--slug", "did-it", "--title", "Did it"], { project: proj }).stdout.trim();
  // Fill the action (incl. Commands, so it's a clean entry).
  fs.writeFileSync(action, "# 0001 — Did it\n\n**Date:** 2026-05-13\n\n## What I did\n- x\n\n## Outcome\n- y\n\n## Commands\n```\nmake\n```\n\n## Notes / related\n- done\n");
  writeDecision(
    proj,
    "0001-use-sqlite.md",
    FULL_DECISION.replace("## Related\n", "## Related\n- [actions/0001 — Did it](../actions/0001-feat-did-it.md)\n")
  );

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 0, r.stdout);
});

test("doctor warns on an unfilled placeholder but does not error", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  // A freshly allocated, unfilled decision still has skeleton hint lines.
  engine(["allocate", "decision", "--slug", "tbd", "--title", "TBD"], { project: proj });

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 0, "placeholders are warnings, not errors");
  assert.match(r.stdout, /unfilled skeleton placeholder/);
});

test("doctor warns (not errors) on missing action type, missing status, empty Commands", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  // Action with NO type prefix in the filename and an empty Commands section.
  fs.writeFileSync(
    path.join(proj, "dev-chronicler", "actions", "0001-untyped.md"),
    "# 0001 — Untyped\n\n**Date:** 2026-05-13\n\n## What I did\n- x\n\n## Outcome\n- y\n\n## Commands\n\n## Notes / related\n- z\n"
  );
  // Decision with no Status line.
  writeDecision(proj, "0001-no-status.md", "# 0001 — No status\n\n**Date:** 2026-05-13\n\n## Context\nc\n\n## Decision\nd\n\n## Alternatives considered\na\n\n## Consequences\ncons\n\n## Related\n");

  const r = engine(["doctor", "--json"], { project: proj });
  const v = JSON.parse(r.stdout);
  assert.equal(v.ok, true, "all three are warnings, not errors");
  const msgs = v.warnings.map((w) => w.message).join(" | ");
  assert.match(msgs, /action filename should be NNNN-<type>/);
  assert.match(msgs, /missing a \*\*Status:\*\* line/);
  assert.match(msgs, /Commands section is empty/);
});

test("doctor flags a Superseded-by marker pointing at a missing file", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  writeDecision(
    proj,
    "0001-use-sqlite.md",
    FULL_DECISION.replace("**Date:**", "**Superseded by:** [0099 — gone](0099-gone.md)\n**Date:**")
  );

  const r = engine(["doctor"], { project: proj });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /broken link: 0099-gone\.md/);
});

test("doctor --json emits a machine-readable verdict", () => {
  const proj = mkProject();
  engine(["init"], { project: proj });
  writeDecision(proj, "0001-use-sqlite.md", FULL_DECISION.replace("## Related\n", "## Related\nSee [[x]].\n"));

  const r = engine(["doctor", "--json"], { project: proj });
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0].message, /wikilink/i);
});

test("doctor on an un-initialised project fails loudly", () => {
  const proj = mkProject();
  const r = engine(["doctor"], { project: proj });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not initialised/i);
});
