// OWNER: lane-c
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "../src/commands/setup.js";
import { doctor } from "../src/commands/doctor.js";
import { uninstall } from "../src/commands/uninstall.js";
import { MANAGED_BEGIN, MANAGED_END } from "../src/installer/managed-block.js";

async function scratch() {
  return mkdtemp(join(tmpdir(), "grudge-installer-"));
}

test("setup creates a guarded Claude project and preserves unrelated settings", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nconsole.log('stub');\n");
  await mkdir(join(cwd, ".claude"), { recursive: true });
  await writeFile(join(cwd, ".claude/settings.json"), '{"permissions":{"allow":["Bash(test)"]}}\n');
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const settings = JSON.parse(await readFile(join(cwd, ".claude/settings.json"), "utf8"));
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, "node .grudge/bin/grudge.mjs hook PreToolUse");
  assert.equal(settings.statusLine.command, "node .grudge/bin/grudge.mjs statusline");
  assert.deepEqual(settings.permissions.allow, ["Bash(test)"]);
  const agents = await readFile(join(cwd, "AGENTS.md"), "utf8");
  assert.ok(agents.includes(MANAGED_BEGIN) && agents.includes(MANAGED_END));
  assert.equal((await readFile(join(cwd, ".gitignore"), "utf8")).split(/\r?\n/).filter(Boolean).length, 3);
  assert.ok((await readFile(join(cwd, ".grudge/config.json"), "utf8")).includes("scriptHash"));
});

test("second setup is idempotent and dry-run writes nothing", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "runtime");
  const first = await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const second = await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  assert.equal(second.changes.length, 0);
  const dryRoot = await scratch();
  const dry = await setup({ cwd: dryRoot, home: dryRoot, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, dryRun: true, print: false });
  assert.ok(dry.changes.length > 0);
  await assert.rejects(access(join(dryRoot, ".grudge/config.json")));
  assert.ok(first.changes.length > 0);
});

test("malformed settings refuse setup without changing the file", async () => {
  const cwd = await scratch();
  const settings = join(cwd, ".claude/settings.json");
  await mkdir(join(cwd, ".claude"), { recursive: true });
  await writeFile(settings, "{ broken\n");
  const before = await readFile(settings, "utf8");
  await assert.rejects(() => setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: join(cwd, "missing"), print: false }), /invalid JSON/);
  assert.equal(await readFile(settings, "utf8"), before);
});

test("unverified adapters produce no files", async () => {
  const cwd = await scratch();
  const result = await setup({ cwd, home: cwd, agents: ["cursor"], scope: "repo", yes: true, runtimeScript: join(cwd, "missing"), print: false });
  assert.equal(result.unverified[0].id, "cursor");
  assert.equal(result.changes.length, 2); // shared gitignore/config metadata only
  await assert.rejects(access(join(cwd, ".cursor/rules")));
});

test("doctor reports a healthy installed runtime", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "runtime");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const result = await doctor({ cwd, print: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.budgetMeasurements.map(({ name }) => name), ["SessionStart injection", "Block reason", "Prompt nudge", "AGENTS.md block"]);
  assert.ok(result.budgetMeasurements.every(({ chars, cap }) => chars <= cap));
});

test("doctor fails when a measured budget exceeds its cap", async () => {
  const cwd = await scratch();
  const result = await doctor({
    cwd,
    print: false,
    measureOutputs: () => [{ name: "Block reason", chars: 401, cap: 400, withinCap: false }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find(({ name }) => name === "budget Block reason").ok, false);
});

test("uninstall removes managed files and installed runtime", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "runtime");
  await setup({ cwd, home: cwd, agents: ["codex"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const before = await readFile(join(cwd, "AGENTS.md"), "utf8");
  assert.ok(before.includes(MANAGED_BEGIN));
  const result = await uninstall({ cwd, print: false });
  assert.ok(result.removed.length > 0);
  await assert.rejects(access(join(cwd, ".grudge")));
  await assert.rejects(access(join(cwd, "AGENTS.md")));
});
