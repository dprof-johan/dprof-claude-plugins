"use strict";

const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENGINE = path.join(ROOT, "scripts", "chronicle.js");
const SESSION_START = path.join(ROOT, "scripts", "session_start.js");
const STOP_NUDGE = path.join(ROOT, "scripts", "stop_nudge.js");

// A throwaway project directory; the chronicle lives under <dir>/<root>.
function mkProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dcw-"));
}

function mkDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dcw-data-"));
}

// Run a script synchronously, returning { status, stdout, stderr }.
function run(script, args, { project, env } = {}) {
  const merged = { ...process.env, ...env };
  if (project) merged.CLAUDE_PROJECT_DIR = project;
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: merged,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// Run a script asynchronously (for concurrency tests). Resolves on exit.
function runAsync(script, args, { project, env } = {}) {
  const merged = { ...process.env, ...env };
  if (project) merged.CLAUDE_PROJECT_DIR = project;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const c = spawn(process.execPath, [script, ...args], { env: merged });
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const engine = (args, opts) => run(ENGINE, args, opts);
const engineAsync = (args, opts) => runAsync(ENGINE, args, opts);

module.exports = {
  ROOT,
  ENGINE,
  SESSION_START,
  STOP_NUDGE,
  mkProject,
  mkDataDir,
  run,
  runAsync,
  engine,
  engineAsync,
};
