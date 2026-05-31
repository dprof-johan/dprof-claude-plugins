"use strict";

// Guards for the two release mistakes that have actually bitten this plugin:
//   1. The three version fields (plugin.json, package.json, marketplace entry)
//      drifting out of sync, so `/plugin update` pulls nothing or the wrong one.
//   2. Re-introducing `"hooks": "./hooks/hooks.json"` in plugin.json, which
//      duplicates the auto-loaded hooks file and fails the hooks load.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = path.join(__dirname, "..");
const REPO_ROOT = path.join(PLUGIN_DIR, "..", "..");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

test("plugin.json, package.json, and the marketplace entry share one version", () => {
  const plugin = readJson(path.join(PLUGIN_DIR, ".claude-plugin", "plugin.json"));
  const pkg = readJson(path.join(PLUGIN_DIR, "package.json"));
  const market = readJson(path.join(REPO_ROOT, ".claude-plugin", "marketplace.json"));

  const entry = market.plugins.find((p) => p.name === "dev-chronicler");
  assert.ok(entry, "dev-chronicler is listed in marketplace.json");

  assert.equal(pkg.version, plugin.version, "package.json matches plugin.json");
  assert.equal(entry.version, plugin.version, "marketplace entry matches plugin.json");
});

test("plugin.json does not re-declare the auto-loaded hooks/hooks.json", () => {
  const plugin = readJson(path.join(PLUGIN_DIR, ".claude-plugin", "plugin.json"));
  // The standard hooks file is loaded automatically; referencing it here is a
  // "duplicate hooks file" error. The manifest hooks field, if present, must
  // only point at *additional* files.
  const refs = []
    .concat(plugin.hooks || [])
    .flatMap((h) => (typeof h === "string" ? [h] : []));
  for (const ref of refs) {
    assert.notEqual(ref, "./hooks/hooks.json", "plugin.json must not reference the standard hooks file");
    assert.notEqual(ref, "hooks/hooks.json", "plugin.json must not reference the standard hooks file");
  }
  assert.ok(fs.existsSync(path.join(PLUGIN_DIR, "hooks", "hooks.json")), "the auto-loaded hooks file exists");
});
