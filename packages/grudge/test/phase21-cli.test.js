import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeHookResult } from "../src/commands/hook.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("fail-open handler warnings are surfaced on stderr with code zero", () => {
  const result = normalizeHookResult({ ok: false, warning: "guard unavailable" });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "guard unavailable\n");
});

test("help, short flags, and a missing scar id behave from a cold start", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-cli-"));
  try {
    const help = spawnSync(process.execPath, [cli, "--help"], { cwd: root, encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: grudge <command> \[options\]/);
    assert.match(help.stdout, /-j, --json/);
    assert.doesNotMatch(help.stdout, /Grudge status/);

    const shortHelp = spawnSync(process.execPath, [cli, "-h"], { cwd: root, encoding: "utf8" });
    assert.equal(shortHelp.status, 0);
    assert.match(shortHelp.stdout, /Usage: grudge/);

    const version = spawnSync(process.execPath, [cli, "-v"], { cwd: root, encoding: "utf8" });
    assert.equal(version.status, 0);
    assert.match(version.stdout, /^grudge \d+\.\d+\.\d+/);

    const stats = spawnSync(process.execPath, [cli, "stats", "-j"], { cwd: root, encoding: "utf8" });
    assert.equal(stats.status, 0);
    assert.equal(JSON.parse(stats.stdout).estimated, true);

    const missing = spawnSync(process.execPath, [cli, "scars", "show", "scar-missing", "-j"], { cwd: root, encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.deepEqual(JSON.parse(missing.stdout), { pending: null, scar: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime CLI dispatches JSON commands and preserves fail-open hook exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-cli-"));
  try {
    const stats = spawnSync(process.execPath, [cli, "stats", "--json"], { cwd: root, encoding: "utf8" });
    assert.equal(stats.status, 0);
    assert.equal(JSON.parse(stats.stdout).estimated, true);

    const badHook = spawnSync(process.execPath, [cli, "hook", "pre-tool-use"], { cwd: root, input: "not-json", encoding: "utf8" });
    assert.equal(badHook.status, 0);
    assert.match(badHook.stderr, /invalid hook input/);

    const postHook = spawnSync(process.execPath, [cli, "hook", "PostToolUse"], { cwd: root, input: "{}", encoding: "utf8" });
    assert.equal(postHook.status, 0);
    assert.match(postHook.stderr, /post-tool-use skipped|hook failed; allowed \(fail-open\)/);

    const missing = spawnSync(process.execPath, [cli, "accept", "--json"], { cwd: root, encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(JSON.parse(missing.stderr).error, /usage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
