// OWNER: lane-c
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
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
  const claude = await readFile(join(cwd, "CLAUDE.md"), "utf8");
  assert.ok(claude.includes(MANAGED_BEGIN) && claude.includes(MANAGED_END));
  assert.equal((await readFile(join(cwd, ".gitignore"), "utf8")).split(/\r?\n/).filter(Boolean).length, 3);
  assert.ok((await readFile(join(cwd, ".grudge/config.json"), "utf8")).includes("scriptHash"));
});

test("second setup is idempotent and dry-run writes nothing", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
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
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const result = await doctor({ cwd, home: cwd, print: false });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(result.budgetMeasurements.map(({ name }) => name), ["SessionStart injection", "Block reason", "Prompt nudge", "instruction block"]);
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
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["codex"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const before = await readFile(join(cwd, "AGENTS.md"), "utf8");
  assert.ok(before.includes(MANAGED_BEGIN));
  const result = await uninstall({ cwd, print: false });
  assert.ok(result.removed.length > 0);
  await assert.rejects(access(join(cwd, ".grudge")));
  await assert.rejects(access(join(cwd, "AGENTS.md")));
});

test("setup preserves an existing third-party status line and warns", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await mkdir(join(cwd, ".claude"), { recursive: true });
  await writeFile(join(cwd, ".claude/settings.json"), JSON.stringify({ statusLine: { type: "command", command: "other-tool status" }, hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "other-tool hook" }] }] } }));
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  const result = await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const settings = JSON.parse(await readFile(join(cwd, ".claude/settings.json"), "utf8"));
  assert.equal(settings.statusLine.command, "other-tool status");
  assert.match(result.warnings[0], /preserved existing status line/);
  assert.ok(settings.hooks.PreToolUse.some(({ hooks }) => hooks.some(({ command }) => command === "other-tool hook")));
});

test("uninstall preserves user content in AGENTS.md and CLAUDE.md byte-for-byte", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  const agentsBefore = "# User AGENTS\r\nKeep this instruction.\r\n";
  const claudeBefore = "# User Claude\nKeep this instruction.\n";
  await writeFile(join(cwd, "AGENTS.md"), agentsBefore);
  await writeFile(join(cwd, "CLAUDE.md"), claudeBefore);
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await uninstall({ cwd, print: false });
  assert.equal(await readFile(join(cwd, "AGENTS.md"), "utf8"), agentsBefore);
  assert.equal(await readFile(join(cwd, "CLAUDE.md"), "utf8"), claudeBefore);
});

test("uninstall does not delete a created file after user content is added", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await writeFile(join(cwd, "CLAUDE.md"), `${await readFile(join(cwd, "CLAUDE.md"), "utf8")}# User content\n`);
  await uninstall({ cwd, print: false });
  assert.equal(await readFile(join(cwd, "CLAUDE.md"), "utf8"), "\n# User content\n");
});

test("uninstall preserves third-party settings added after setup", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await mkdir(join(cwd, ".claude"), { recursive: true });
  await writeFile(join(cwd, ".claude/settings.json"), JSON.stringify({ statusLine: { type: "command", command: "other-tool status" } }));
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const settingsPath = join(cwd, ".claude/settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  settings.hooks.PostToolUse.push({ matcher: "*", hooks: [{ type: "command", command: "other-tool after-setup" }] });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  await uninstall({ cwd, print: false });
  const after = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.equal(after.statusLine.command, "other-tool status");
  assert.ok(after.hooks.PostToolUse.some(({ hooks }) => hooks.some(({ command }) => command === "other-tool after-setup")));
  assert.equal(JSON.stringify(after).includes("grudge.mjs"), false);
});

test("malformed managed markers fail safely and survive uninstall", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  const malformed = "# User content\n<!-- grudge:begin v1 -->\nDo not delete this line.\n";
  await writeFile(join(cwd, "CLAUDE.md"), malformed);
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await assert.rejects(() => setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false }), /malformed Grudge markers/);
  assert.equal(await readFile(join(cwd, "CLAUDE.md"), "utf8"), malformed);
  await uninstall({ cwd, print: false });
  assert.equal(await readFile(join(cwd, "CLAUDE.md"), "utf8"), malformed);
});

test("repeated uninstall is idempotent", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await uninstall({ cwd, print: false });
  const second = await uninstall({ cwd, print: false });
  assert.equal(second.removed.length, 0);
});

test("doctor warns when Grudge hooks exist at user and project scope", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const result = await doctor({ cwd, home, print: false });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /user and project scope/);
});

test("doctor detects a partial Claude hook registration", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const settingsPath = join(cwd, ".claude/settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  delete settings.hooks.Stop;
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  const result = await doctor({ cwd, home: cwd, print: false });
  assert.equal(result.ok, false);
  assert.match(result.checks.find(({ name }) => name === "hook completeness").detail, /missing Stop/);
});

test("interactive setup applies the selected scope", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  input.setRawMode = () => {};
  output.on("data", () => {});
  setImmediate(() => input.write(" \r\x1b[B\r"));

  const result = await setup({
    cwd,
    home: cwd,
    detected: [{ id: "claude-code", detected: true }],
    input,
    output,
    runtimeScript: runtime,
    print: false,
  });

  assert.equal(result.scope, "local");
  assert.ok(result.selected.includes("claude-code"));
  await access(join(cwd, ".claude/settings.local.json"));
});
