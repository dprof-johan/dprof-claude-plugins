#!/usr/bin/env node
/*
 * LLM-as-judge for a dev-chronicler chronicle (Phase 2 of the eval).
 *
 * Scores a *candidate* chronicle against the *golden* one on a rubric, returning
 * a per-dimension 1-5 score with rationale plus an overall. Unlike the
 * structural eval, this judges the *content* (reasoning, faithful outcomes,
 * altitude) — so it is non-deterministic and meant to be run locally, not in CI.
 *
 * Backends (pick with --backend or $DEVCHRON_JUDGE_BACKEND):
 *   cli   (default) — shell out to `claude -p`. Uses whatever the Claude Code
 *                     CLI is logged into; ANTHROPIC_API_KEY is scrubbed from the
 *                     child env so a Pro/Max subscription login is used rather
 *                     than pay-per-token API billing.
 *   api             — call the Anthropic Messages API directly (needs
 *                     ANTHROPIC_API_KEY). Pay-per-token, but predictable.
 *   mock            — no model call; a deterministic heuristic stand-in used by
 *                     the self-tests to exercise the harness without cost.
 *
 * Usage:
 *   node judge.js [candidateDir] [--golden <dir>] [--root <name>]
 *                 [--backend cli|api|mock] [--model <m>] [--min <n>] [--json]
 *
 * `candidateDir` defaults to the golden (a golden-vs-golden smoke test). It is
 * the directory that contains the chronicle root (e.g. `dev-chronicler/`).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

const HERE = __dirname;
const GOLDEN = path.join(HERE, "golden");

const DIMENSIONS = [
  { key: "coverage", title: "Coverage & altitude", guide: "Are the right things logged at the right grain — non-trivial decisions as ADRs, meaningful work episodes (not keystrokes) as actions, a handover that snapshots state? Nothing important missing; nothing trivial padded in." },
  { key: "reasoning", title: "Decision reasoning", guide: "Do decisions explain the context/constraint, real alternatives with why they were rejected, and consequences — the *why*, not just the *what*?" },
  { key: "outcomes", title: "Faithful outcomes", guide: "Do actions give concrete outcomes — numbers, pass/fail, exact commands, before→after — rather than vibes? Could a reader trust them?" },
  { key: "resume", title: "Resume test", guide: "Could a fresh agent pick up the work from these entries alone, without re-explanation? Are entries self-contained yet not bloated?" },
  { key: "linking", title: "Linking & handover", guide: "Valid cross-links between related entries, supersede markers where a decision was reversed, and a handover that genuinely primes the next agent." },
];

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a === "--mock") flags.backend = "mock";
    else if (a === "--golden") flags.golden = argv[++i];
    else if (a === "--root") flags.root = argv[++i];
    else if (a === "--backend") flags.backend = argv[++i];
    else if (a === "--model") flags.model = argv[++i];
    else if (a === "--min") flags.min = Number(argv[++i]);
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

// Gather the chronicle's entries into one labelled blob plus a few signals.
function readChronicle(projectDir, root) {
  const base = path.join(projectDir, root);
  const parts = [];
  const counts = {};
  for (const sub of ["decisions", "actions", "handovers"]) {
    const dir = path.join(base, sub);
    const files = listEntries(dir);
    counts[sub] = files.length;
    for (const f of files) {
      parts.push(`----- ${sub}/${f} -----\n${read(path.join(dir, f))}`);
    }
  }
  return { text: parts.join("\n\n"), counts, base };
}

function buildPrompt(goldenText, candidateText) {
  const rubric = DIMENSIONS.map((d, i) => `${i + 1}. ${d.title} (key: "${d.key}") — ${d.guide}`).join("\n");
  const schema = `{
  "dimensions": [ { "key": "<one of: ${DIMENSIONS.map((d) => d.key).join(", ")}>", "score": <integer 1-5>, "rationale": "<one or two sentences>" } ],
  "overall": <integer 1-5>,
  "summary": "<two or three sentences on the biggest gap vs the golden>"
}`;
  return `You are a strict, fair evaluator of development "chronicles" produced by the dev-chronicler tool. A chronicle is a set of decision records (ADRs), action/build-journal entries, and handover snapshots that should let a fresh engineer or agent resume a project.

You are given a GOLDEN chronicle (the reference standard) and a CANDIDATE chronicle for the same kind of small project. Score the CANDIDATE on each rubric dimension from 1 (poor) to 5 (matches or exceeds the golden), judging quality and faithfulness — not length, and not superficial similarity to the golden's wording.

Rubric dimensions:
${rubric}

Output ONLY a JSON object, no prose, no code fences, matching exactly:
${schema}

Include every dimension key exactly once. "overall" is your holistic 1-5 (not necessarily the mean).

===== GOLDEN CHRONICLE =====
${goldenText}

===== CANDIDATE CHRONICLE =====
${candidateText}
===== END =====`;
}

function extractJson(text) {
  if (!text) throw new Error("empty model response");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model response");
  return JSON.parse(body.slice(start, end + 1));
}

// ----- backends -----

function callCli(prompt, model) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // force subscription/login auth, not API billing
  const directive =
    "Follow the instructions in the piped input exactly. Output only the JSON verdict it asks for — no prose, no code fences.";
  const args = ["-p", directive, "--output-format", "json", "--max-turns", "1"];
  if (model) args.push("--model", model);
  let raw;
  try {
    raw = execFileSync("claude", args, {
      input: prompt,
      env,
      cwd: os.tmpdir(), // outside any chronicle project, so no plugin hooks fire
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(`claude -p failed (is the CLI installed and logged in?): ${e.message}`);
  }
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (_) {
    throw new Error("could not parse `claude -p --output-format json` envelope");
  }
  return extractJson(envelope.result || "");
}

async function callApi(prompt, model) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("backend=api needs ANTHROPIC_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return extractJson((data.content || []).map((b) => b.text || "").join(""));
}

// Deterministic heuristic stand-in for a model — plumbing tests only. It scores
// the candidate's intrinsic structure so golden > degraded, without a model.
function callMock(_prompt, candidate) {
  const text = candidate.text;
  const hasWikilink = text.includes("[[");
  const hasPlaceholder = /_What is the situation|_The choice we made|_Each rejected option|_Relative Markdown links/.test(text);
  const crossLinked = text.includes("](../actions/") && text.includes("](../decisions/");
  const handoverRefs = candidate.counts.handovers > 0 && /handovers\/[\s\S]*?\]\(\.\.\//.test(text);
  const enough = candidate.counts.decisions >= 2 && candidate.counts.actions >= 2 && candidate.counts.handovers >= 1;

  const s = {
    coverage: enough ? 5 : candidate.counts.decisions + candidate.counts.actions >= 3 ? 3 : 1,
    reasoning: candidate.counts.decisions >= 2 && !hasPlaceholder ? 5 : 2,
    outcomes: candidate.counts.actions >= 2 && !hasPlaceholder ? 5 : 2,
    resume: hasPlaceholder ? 2 : enough ? 5 : 3,
    linking: hasWikilink ? 1 : crossLinked && handoverRefs ? 5 : 3,
  };
  const dims = DIMENSIONS.map((d) => ({ key: d.key, score: s[d.key], rationale: "heuristic mock score" }));
  const overall = Math.round(dims.reduce((a, d) => a + d.score, 0) / dims.length);
  return { dimensions: dims, overall, summary: "mock verdict (no model call)" };
}

// ----- main -----

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const backend = flags.backend || process.env.DEVCHRON_JUDGE_BACKEND || "cli";
  const root = flags.root || "dev-chronicler";
  const candidateDir = path.resolve(positional[0] || GOLDEN);
  const goldenDir = path.resolve(flags.golden || GOLDEN);

  const golden = readChronicle(goldenDir, root);
  const candidate = readChronicle(candidateDir, root);
  if (!candidate.text) {
    process.stderr.write(`judge: no chronicle entries found under ${path.join(candidateDir, root)}\n`);
    process.exit(2);
  }

  const prompt = buildPrompt(golden.text, candidate.text);
  let verdict;
  try {
    if (backend === "mock") verdict = callMock(prompt, candidate);
    else if (backend === "api") verdict = await callApi(prompt, flags.model);
    else verdict = callCli(prompt, flags.model || "sonnet");
  } catch (e) {
    process.stderr.write(`judge: ${e.message}\n`);
    process.exit(2);
  }

  // Normalise / validate the verdict shape.
  const byKey = new Map((verdict.dimensions || []).map((d) => [d.key, d]));
  const dims = DIMENSIONS.map((d) => {
    const got = byKey.get(d.key) || {};
    const score = Math.max(1, Math.min(5, Math.round(Number(got.score) || 0)));
    return { key: d.key, title: d.title, score, rationale: got.rationale || "" };
  });
  const overall = Math.max(1, Math.min(5, Math.round(Number(verdict.overall) || Math.round(dims.reduce((a, d) => a + d.score, 0) / dims.length))));
  const result = { backend, candidate: candidateDir, golden: goldenDir, dimensions: dims, overall, summary: verdict.summary || "" };

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`LLM-as-judge (${backend}) — candidate vs golden\n\n`);
    for (const d of dims) process.stdout.write(`  ${d.score}/5  ${d.title}\n        ${d.rationale}\n`);
    process.stdout.write(`\n  overall: ${overall}/5\n  ${result.summary}\n`);
  }

  if (typeof flags.min === "number" && overall < flags.min) process.exit(1);
}

main();
