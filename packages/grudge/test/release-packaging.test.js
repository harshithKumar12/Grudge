// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adapter, defaultRuntimeCommand } from "../src/installer/adapters/claude-code.js";
import { runtimeDependencyCheck } from "../scripts/verify-release.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(packageRoot, "dist", "grudge.mjs");

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function quoted(command) {
  return String(command).split('"').filter(Boolean).map((token) => token.trim()).filter((token) => token && !token.startsWith("hook ") && token !== "hook" && token !== "statusline");
}

test("packing always rebuilds the bundle and publishing always runs the suite and the artifact gate", async () => {
  const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  // The 0.2.1 tarball shipped a stale dist because nothing rebuilt before pack.
  assert.match(pkg.scripts.prepack ?? "", /build/);
  assert.match(pkg.scripts.prepublishOnly ?? "", /test/);
  // A green suite says nothing about the tarball; publishing must run the gate.
  assert.match(pkg.scripts.prepublishOnly ?? "", /release:verify/);
  assert.ok(pkg.files.includes("dist"));
  assert.ok(pkg.files.includes("src"));
  for (const required of ["package.json", "README.md", "LICENSE"]) {
    assert.ok(pkg.files.includes(required), `files must include ${required}`);
  }
  // `files` is a whitelist; listing a development tree would ship it.
  for (const devOnly of ["test", "scripts", "node_modules", ".github", ".claude", ".grudge"]) {
    assert.ok(!pkg.files.includes(devOnly), `files must not include ${devOnly}`);
  }
});

test("the packed bundle needs no undeclared runtime dependency", async () => {
  const bundle = await readFile(dist, "utf8");
  const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const specifiers = [...bundle.matchAll(/await __import\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(specifiers.length > 0, "the bundle must import something");
  // Same rule as the release gate: a declared dependency the bundle would need
  // at runtime must fail here too, not only in `release:verify`.
  const closure = runtimeDependencyCheck(bundle, Object.keys(pkg.dependencies ?? {}));
  assert.equal(closure.ok, true, closure.detail);
});

test("the release gate fails when the bundle yields no runtime imports", () => {
  // A build-format change that hides every `await __import("...")` must fail the
  // gate instead of passing vacuously with zero specifiers discovered.
  const real = runtimeDependencyCheck('const x = await __import("node:fs");');
  assert.equal(real.ok, true);
  assert.deepEqual(real.specifiers, ["node:fs"]);

  const empty = runtimeDependencyCheck('import { readFile } from "node:fs/promises";');
  assert.equal(empty.ok, false, "zero discovered specifiers must fail");
  assert.equal(empty.specifiers.length, 0);
  assert.match(empty.detail, /no runtime imports discovered/);

  // The pre-existing failures must still be reported.
  assert.equal(runtimeDependencyCheck('await __import("lodash")').ok, false);
  assert.equal(runtimeDependencyCheck('await __import("./local.js")').ok, true);
  assert.equal(runtimeDependencyCheck('await __import("node:fs")', ["typer"]).ok, false);
});

test("the built bundle carries the absolute-runtime fix and the hook paths check", async () => {
  const bundle = await readFile(dist, "utf8");
  assert.ok(bundle.includes("shellQuote(process.execPath)"), "absolute runtimeCommand must be in the packed bundle");
  assert.ok(bundle.includes("hook paths"), "doctor's hook paths check must be in the packed bundle");
});

test("the claude-code adapter never falls back to a relative runtime command", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-adapter-"));
  try {
    const command = defaultRuntimeCommand({ cwd: root, home: root });
    const [nodeToken, scriptToken] = quoted(command);
    assert.equal(nodeToken, process.execPath);
    assert.ok(isAbsolute(scriptToken));
    assert.equal(scriptToken, join(root, ".grudge", "bin", "grudge.mjs"));

    const plan = adapter.plan({ cwd: root, home: root, scope: "repo" });
    const preToolUse = plan.hooks.find((hook) => hook.event === "PreToolUse").command;
    const [, plannedScript] = quoted(preToolUse);
    assert.ok(isAbsolute(plannedScript), preToolUse);
    assert.ok(plannedScript.startsWith(root));
    assert.ok(plan.statusLine.includes(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("setup from the built runtime registers an absolute, existing hook script", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-packaging-"));
  try {
    const setup = spawnSync(process.execPath, [dist, "setup", "--cwd", root, "--yes", "--agents", "claude-code", "--scope", "repo"], { encoding: "utf8" });
    assert.equal(setup.status, 0, setup.stderr);
    const settings = JSON.parse(await readFile(join(root, ".claude", "settings.json"), "utf8"));
    for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]) {
      const command = settings.hooks[event][0].hooks[0].command;
      const [nodeToken, scriptToken] = quoted(command);
      assert.equal(nodeToken, process.execPath);
      assert.ok(isAbsolute(scriptToken), `${event}: ${command}`);
      assert.equal(scriptToken, join(root, ".grudge", "bin", "grudge.mjs"));
      assert.ok(await exists(scriptToken), `${event}: missing script`);
    }
    const config = JSON.parse(await readFile(join(root, ".grudge", "config.json"), "utf8"));
    assert.ok(String(config.runtimeCommand).includes(join(root, ".grudge", "bin", "grudge.mjs")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
