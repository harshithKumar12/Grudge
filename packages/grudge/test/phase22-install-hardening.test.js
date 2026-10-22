import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setup } from "../src/commands/setup.js";
import { doctor } from "../src/commands/doctor.js";
import { dispatch, parseArgs } from "../src/cli.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const bundle = join(packageRoot, "dist", "grudge.mjs");

async function scratch() {
  return mkdtemp(join(tmpdir(), "grudge-phase22-"));
}

test("built runtime is self-contained, versioned, and runs from an installed copy", async () => {
  const source = await readFile(bundle, "utf8");
  assert.match(source, /^#!\/usr\/bin\/env node\n\/\/ Grudge v0\.1\.2/m);
  assert.doesNotMatch(source, /(?:from|import)\s*["']\./);

  const cwd = await scratch();
  await mkdir(join(cwd, ".git"), { recursive: true });
  const install = spawnSync(process.execPath, [bundle, "setup", "--cwd", cwd, "--yes", "--agents", "codex", "--json"], { cwd, encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr);
  assert.equal(JSON.parse(install.stdout).runtimeInstalled, true);
  const installed = join(cwd, ".grudge/bin/grudge.mjs");
  const result = spawnSync(process.execPath, [installed, "--version"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "grudge 0.1.2");
  assert.match(await readFile(installed, "utf8"), /Grudge v0\.1\.2/);
});

test("setup smoke failure restores every changed file", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "broken.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(1);\n");
  await assert.rejects(() => setup({ cwd, home: cwd, agents: ["codex"], scope: "repo", yes: true, runtimeScript: runtime, print: false }));
  await assert.rejects(access(join(cwd, ".grudge/config.json")));
  await assert.rejects(access(join(cwd, ".grudge/bin/grudge.mjs")));
  await assert.rejects(access(join(cwd, "AGENTS.md")));
});

test("doctor executes an installed script and explains load failures", async () => {
  const cwd = await scratch();
  await mkdir(join(cwd, ".grudge/bin"), { recursive: true });
  await writeFile(join(cwd, ".grudge/bin/grudge.mjs"), "#!/usr/bin/env node\nimport './missing.js';\n");
  await writeFile(join(cwd, ".grudge/config.json"), JSON.stringify({ version: 1, scriptHash: "wrong", adapters: [] }));
  const result = await doctor({ cwd, print: false });
  assert.equal(result.ok, false);
  assert.match(result.checks.find(({ name }) => name === "runtime load").detail, /load failed/);
  assert.match(result.checks.find(({ name }) => name === "runtime load").detail, /Python engine/);
});

test("scope selection keeps repo, local, and global targets distinct", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  const local = await setup({ cwd, home, agents: ["claude-code"], scope: "local", yes: true, runtimeScript: runtime, print: false });
  assert.equal(local.scope, "local");
  await access(join(cwd, ".claude/settings.local.json"));
  const global = await setup({ cwd, home, agents: ["claude-code"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  assert.equal(global.root, home);
  await access(join(home, ".claude/settings.json"));
  await access(join(home, ".grudge/bin/grudge.mjs"));
});

test("CLI supports version, five-line no-arg status, init, and rule stdin", async () => {
  const cwd = await scratch();
  await mkdir(join(cwd, ".git"), { recursive: true });
  const version = spawnSync(process.execPath, [bundle, "--version"], { cwd, encoding: "utf8" });
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), "grudge 0.1.2");
  const status = spawnSync(process.execPath, [bundle], { cwd, encoding: "utf8" });
  assert.equal(status.stdout.trim().split(/\r?\n/).length, 5);
  const init = spawnSync(process.execPath, [bundle, "init", "--cwd", cwd, "--yes", "--agents", "codex", "--json"], { cwd, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  assert.equal(JSON.parse(init.stdout).scope, "repo");
  const human = spawnSync(process.execPath, [bundle, "setup", "--cwd", cwd, "--yes", "--agents", "codex"], { cwd, encoding: "utf8" });
  assert.equal(human.status, 0, human.stderr);
  assert.equal(human.stdout.trim().split(/\r?\n/).length, 5);

  const parsed = parseArgs(["propose", "--rule-stdin", "--why", "test"]);
  assert.equal(parsed.options.rulestdin, true);
  const code = await dispatch(parsed, { stdin: async () => 'never call shell where command ~ "never-fired"' });
  assert.equal(code, 1);
});

test("CLI gives Python-engine guidance for engine-only commands", async () => {
  const cwd = await scratch();
  const result = spawnSync(process.execPath, [bundle, "demo"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pip install grudge-cli/);
});

test("home setup without a marker requires explicit confirmation", async () => {
  await assert.rejects(() => setup({ cwd: homedir(), agents: ["codex"], scope: "repo", print: false }), /home directory without a project marker/);
});
