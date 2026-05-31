#!/usr/bin/env node
/*
 * Structural eval for a dev-chronicler chronicle.
 *
 * Phase 1 of the dev-chronicler eval: objective, deterministic checks on a
 * chronicle's *structure* — no LLM, no golden comparison. It reuses the engine's
 * `doctor` (links / wikilinks / placeholders / sections) and layers on
 * coverage and cross-referencing checks, then prints a scored report.
 *
 * Usage:
 *   node structural-eval.js [projectDir] [--root <name>] [--json]
 *
 * `projectDir` defaults to the bundled golden chronicle. It is the directory
 * that *contains* the chronicle root (e.g. `dev-chronicler/`) and any localized
 * READMEs. Exits non-zero if any check fails — so it can gate CI against the
 * golden, and later score a freshly agent-generated chronicle the same way.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ENGINE = path.join(__dirname, "..", "..", "plugins", "dev-chronicler", "scripts", "chronicle.js");
const GOLDEN = path.join(__dirname, "golden");

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a === "--root") flags.root = argv[++i];
    else positional.push(a);
  }
  return { flags, positional };
}

function listEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
}
function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return "";
  }
}

// Run the engine's doctor and return its parsed JSON verdict.
function runDoctor(projectDir, root) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  if (root) env.CLAUDE_PLUGIN_OPTION_CHRONICLE_ROOT = root;
  const args = [ENGINE, "doctor", "--json"];
  try {
    const out = execFileSync(process.execPath, args, { env, encoding: "utf8" });
    return JSON.parse(out);
  } catch (e) {
    // doctor exits 1 when it finds errors, but still prints JSON to stdout.
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout);
      } catch (_) {
        /* fall through */
      }
    }
    return { ok: false, errors: [{ message: `doctor failed to run: ${e.message}` }], warnings: [] };
  }
}

// Find a localized README (outside the chronicle root) that links back into the
// chronicle, and confirm at least one such link resolves.
function localizedBacklink(projectDir, base) {
  const stack = [projectDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (full === base || ent.name === ".git" || ent.name === "node_modules") continue;
        stack.push(full);
      } else if (ent.name.toLowerCase() === "readme.md") {
        const text = read(full);
        const re = /\]\(([^)]+\.md)\)/g;
        let m;
        while ((m = re.exec(text))) {
          const target = m[1].replace(/#.*$/, "");
          if (/^(https?:|\/)/i.test(target) || target.includes("://")) continue;
          const resolved = path.resolve(path.dirname(full), target);
          if (resolved.startsWith(base + path.sep) && fs.existsSync(resolved)) {
            return { file: path.relative(projectDir, full).split(path.sep).join("/"), link: target };
          }
        }
      }
    }
  }
  return null;
}

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const projectDir = path.resolve(positional[0] || GOLDEN);
  const root = flags.root || "dev-chronicler";
  const base = path.join(projectDir, root);

  const decisionsDir = path.join(base, "decisions");
  const actionsDir = path.join(base, "actions");
  const handoversDir = path.join(base, "handovers");

  const decisions = listEntries(decisionsDir);
  const actions = listEntries(actionsDir);
  const handovers = listEntries(handoversDir);

  const verdict = runDoctor(projectDir, root);
  const placeholderWarnings = verdict.warnings.filter((w) => /placeholder/i.test(w.message));
  const sectionWarnings = verdict.warnings.filter((w) => /missing section/i.test(w.message));

  const decisionLinksAction = decisions.some((f) => read(path.join(decisionsDir, f)).includes("](../actions/"));
  const actionLinksDecision = actions.some((f) => read(path.join(actionsDir, f)).includes("](../decisions/"));

  const latestHandover = handovers.length ? read(path.join(handoversDir, handovers[handovers.length - 1])) : "";
  const handoverRefs = latestHandover.includes("](../actions/") || latestHandover.includes("](../decisions/");

  const backlink = localizedBacklink(projectDir, base);

  const checks = [
    { id: "initialised", label: "chronicle is initialised", pass: fs.existsSync(path.join(base, ".chronicler.json")) },
    { id: "doctor-clean", label: "doctor reports no errors", pass: verdict.ok, detail: `${verdict.errors.length} error(s)` },
    { id: "decisions>=2", label: "at least 2 decisions", pass: decisions.length >= 2, detail: `${decisions.length}` },
    { id: "actions>=2", label: "at least 2 actions", pass: actions.length >= 2, detail: `${actions.length}` },
    { id: "handover>=1", label: "at least 1 handover", pass: handovers.length >= 1, detail: `${handovers.length}` },
    { id: "no-placeholders", label: "no unfilled placeholders", pass: placeholderWarnings.length === 0, detail: `${placeholderWarnings.length}` },
    { id: "sections-complete", label: "all required sections present", pass: sectionWarnings.length === 0, detail: `${sectionWarnings.length} missing` },
    { id: "cross-linked", label: "decisions and actions cross-link", pass: decisionLinksAction && actionLinksDecision },
    { id: "handover-refs", label: "latest handover references entries", pass: handoverRefs },
    { id: "localized-readme", label: "a localized README links back in", pass: !!backlink, detail: backlink ? backlink.file : "none found" },
  ];

  const passed = checks.filter((c) => c.pass).length;
  const ok = passed === checks.length;

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok, score: { passed, total: checks.length }, projectDir, checks, verdict }, null, 2) + "\n");
  } else {
    process.stdout.write(`Structural eval — ${path.relative(process.cwd(), projectDir) || projectDir}\n\n`);
    for (const c of checks) {
      process.stdout.write(`  ${c.pass ? "✓" : "✗"} ${c.label}${c.detail ? ` (${c.detail})` : ""}\n`);
    }
    process.stdout.write(`\nscore: ${passed}/${checks.length} — ${ok ? "PASS" : "FAIL"}\n`);
  }
  process.exit(ok ? 0 : 1);
}

main();
