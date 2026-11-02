// OWNER: lane-c
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access, chmod, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { setup } from "../src/commands/setup.js";
import { doctor } from "../src/commands/doctor.js";
import { uninstall } from "../src/commands/uninstall.js";
import { MANAGED_BEGIN, MANAGED_END } from "../src/installer/managed-block.js";
import { missingStatusLineScripts, statusLineScripts } from "../src/installer/statusline-paths.js";

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
  const installedRuntime = join(cwd, ".grudge/bin/grudge.mjs");
  // P0-1: the registered command must be absolute, so a hook still resolves
  // when Claude Code starts in (or changes to) a nested directory.
  const runtimeCommand = `"${process.execPath}" "${installedRuntime}"`;
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, `${runtimeCommand} hook PreToolUse`);
  assert.equal(settings.statusLine.command, `${runtimeCommand} statusline`);
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

test("doctor JSON states that enforcement is not proven (P2-3)", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const result = await doctor({ cwd, home: cwd, print: false });
  // A scripted consumer must not read `ok: true` as "blocking works".
  assert.deepEqual(result.enforcement, {
    proven: false,
    command: "grudge verify",
    detail: "not proven by file checks; run `grudge verify` to prove blocking works",
  });
  assert.equal(JSON.parse(JSON.stringify(result)).enforcement.proven, false);
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

test("setup and uninstall leave a third-party settings file byte-identical", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".claude"), { recursive: true });
  const settingsPath = join(cwd, ".claude/settings.json");
  const original = `{\n    "permissions": { "allow": ["Bash(ls)"] },\n    "statusLine": { "type": "command", "command": "other-tool status" },\n    "hooks": { "PreToolUse": [ { "matcher": "*", "hooks": [ { "type": "command", "command": "other-tool hook" } ] } ] }\n}\n`;
  await writeFile(settingsPath, original);
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const installed = await readFile(settingsPath, "utf8");
  assert.notEqual(installed, original);
  assert.ok(installed.includes("grudge.mjs"));
  await uninstall({ cwd, print: false });
  assert.equal(await readFile(settingsPath, "utf8"), original);
});

test("repeated uninstall is idempotent", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await uninstall({ cwd, print: false });
  const second = await uninstall({ cwd, print: false });
  assert.equal(second.found, false);
  assert.equal(second.ok, false);
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

test("status line scripts resolve placeholder, home, and relative forms", async () => {
  const cwd = join(tmpdir(), "grudge-proj");
  const home = join(tmpdir(), "grudge-home");
  assert.deepEqual(statusLineScripts('node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/a.cjs"', { cwd, home }), [join(cwd, ".claude/helpers/a.cjs")]);
  assert.deepEqual(statusLineScripts('node "~/.claude/helpers/b.cjs"', { cwd, home }), [join(home, ".claude/helpers/b.cjs")]);
  assert.deepEqual(statusLineScripts("node .claude/helpers/c.cjs", { cwd, home }), [join(cwd, ".claude/helpers/c.cjs")]);
  assert.deepEqual(statusLineScripts("other-tool status", { cwd, home }), []);
  assert.deepEqual(await missingStatusLineScripts("other-tool status", { cwd, home }), []);
});

test("doctor and setup warn when a preserved status line points at a missing script", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".claude"), { recursive: true });
  const settingsPath = join(cwd, ".claude/settings.json");
  const command = 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/missing-statusline.cjs"';
  await writeFile(settingsPath, `${JSON.stringify({ statusLine: { type: "command", command } }, null, 2)}\n`);
  const setupResult = await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  assert.ok(setupResult.warnings.some((warning) => /missing-statusline\.cjs/.test(warning) && /does not exist/.test(warning)));
  const result = await doctor({ cwd, home, print: false });
  const check = result.checks.find(({ name }) => name === "status line target");
  assert.ok(check?.warning);
  assert.match(check.detail, /missing-statusline\.cjs/);
  assert.match(check.detail, /never rewrites an existing status line/);
  assert.equal(JSON.parse(await readFile(settingsPath, "utf8")).statusLine.command, command);
});

test("doctor finds a user-scope install from inside a project", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nconsole.log('stub');\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  const result = await doctor({ cwd, home, print: false });
  assert.equal(result.ok, true);
  assert.match(result.checks.find(({ name }) => name === "install scope").detail, /^user /);
  assert.equal(result.checks.find(({ name }) => name === ".gitignore").ok, true);
  assert.ok(result.checks.find(({ name }) => name === "config").detail.includes(join(home, ".grudge/config.json")));
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

test("uninstall keeps user files inside .grudge and says so (P3-3)", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const mine = join(cwd, ".grudge", "notes.md");
  await writeFile(mine, "keep me\n");
  const result = await uninstall({ cwd, print: false });
  assert.equal(await readFile(mine, "utf8"), "keep me\n");
  assert.ok(result.preserved.includes(mine));
  // Managed state is still gone.
  await assert.rejects(access(join(cwd, ".grudge", "config.json")));
  await assert.rejects(access(join(cwd, ".grudge", "bin")));
});

test("uninstall removes .grudge entirely when Grudge created everything (P3-3)", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const result = await uninstall({ cwd, print: false });
  assert.deepEqual(result.preserved, []);
  await assert.rejects(access(join(cwd, ".grudge")));
});

test("setup states that project hooks only load from the launch directory", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  const result = await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const warning = result.warnings.find((item) => /only when the session starts in/.test(item));
  assert.ok(warning, "setup must state the launch-directory limitation");
  assert.match(warning, /--settings/);
  assert.ok(warning.includes(join(cwd, ".claude", "settings.json")));
});

test("setup describes local-scope discovery accurately per platform", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  const result = await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "local", yes: true, runtimeScript: runtime, print: false });
  const warning = result.warnings.find((item) => item.includes(join(cwd, ".claude", "settings.local.json")));
  assert.ok(warning, "setup must describe the local settings file it wrote");
  if (process.platform === "win32") {
    assert.match(warning, /only when the session starts in/);
    assert.match(warning, /--settings/);
  } else {
    assert.match(warning, /from the repository root/);
    assert.doesNotMatch(warning, /only when the session starts in/);
  }
});

test("doctor inspects the project install from a nested launch directory and names the remedy", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const nested = join(cwd, "project", "nested");
  await mkdir(nested, { recursive: true });

  const result = await doctor({ cwd: nested, home, print: false });

  // The install is resolved upward, so the real state is inspected...
  assert.equal(result.root, cwd);
  assert.equal(result.launchDirectory, nested);
  assert.equal(result.checks.find(({ name }) => name === "config").ok, true);
  assert.equal(result.checks.find(({ name }) => name === "hook paths").ok, true);
  assert.equal(result.checks.find(({ name }) => name === ".gitignore").detail, "3/3 entries");
  // ...but the session would run unguarded, so doctor must not report healthy.
  assert.deepEqual(result.checks.filter((check) => !check.ok).map(({ name }) => name), ["launch directory"]);
  const launch = result.checks.find(({ name }) => name === "launch directory");
  assert.equal(launch.ok, false);
  assert.match(launch.detail, /does not walk up/);
  assert.match(launch.detail, /--settings/);
  assert.equal(result.ok, false);
});

test("doctor reads local-scope hooks from the repository root on POSIX", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".git"));
  await setup({ cwd, home, agents: ["claude-code"], scope: "local", yes: true, runtimeScript: runtime, print: false });
  const nested = join(cwd, "project", "nested");
  await mkdir(nested, { recursive: true });

  const result = await doctor({ cwd: nested, home, print: false });
  const launch = result.checks.find(({ name }) => name === "launch directory");

  if (process.platform === "win32") {
    // Windows is the documented exception: the local file is read from the
    // start directory, so a nested session really is unguarded.
    assert.equal(launch.ok, false);
    assert.match(launch.detail, /settings\.local\.json/);
    assert.match(launch.detail, /--settings/);
  } else {
    // `.claude/settings.local.json` is read from the git repository root even
    // when the session starts in a subdirectory, so the hooks do load here.
    assert.equal(launch.ok, true);
    assert.match(launch.detail, /repository root/);
    assert.equal(result.ok, true);
  }
});

test("doctor fails local-scope hooks where no repository can explain them and names the local file", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  // No repository marker: the repository-root rule cannot explain these hooks
  // loading, so the verdict must fail and name the file that holds them.
  await setup({ cwd, home, agents: ["claude-code"], scope: "local", yes: true, runtimeScript: runtime, print: false });
  const nested = join(cwd, "project", "nested");
  await mkdir(nested, { recursive: true });

  const result = await doctor({ cwd: nested, home, print: false });
  const launch = result.checks.find(({ name }) => name === "launch directory");
  const localFile = join(cwd, ".claude", "settings.local.json");

  assert.equal(launch.ok, false);
  assert.ok(launch.detail.includes(localFile), launch.detail);
  assert.match(launch.detail, /--settings/);
  assert.equal(result.ok, false);
});

test("doctor keeps a user-scope install green from a nested launch directory", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  const nested = join(cwd, "project", "nested");
  await mkdir(nested, { recursive: true });

  const result = await doctor({ cwd: nested, home, print: false });

  assert.equal(result.root, home);
  assert.match(result.checks.find(({ name }) => name === "install scope").detail, /^user /);
  const launch = result.checks.find(({ name }) => name === "launch directory");
  assert.equal(launch.ok, true);
  assert.match(launch.detail, /load from any directory/);
  assert.equal(result.ok, true);
});

test("doctor reports missing hooks when the settings file is deleted", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await rm(join(cwd, ".claude", "settings.json"));

  const result = await doctor({ cwd, home: cwd, print: false });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find(({ name }) => name === "hooks").detail, "not configured");
  // The launch directory is still correct; the missing file is the problem.
  assert.equal(result.checks.find(({ name }) => name === "launch directory").ok, true);
  assert.match(result.checks.find(({ name }) => name === "hook completeness").detail, /missing SessionStart/);
});

test("doctor reports an unreadable rule file instead of calling it valid (P2-3)", async () => {
  const cwd = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home: cwd, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await writeFile(join(cwd, ".grudge", "compiled.json"), '{"version":99,"rules":[]}\n');

  const result = await doctor({ cwd, home: cwd, print: false });

  const compiled = result.checks.find(({ name }) => name === "compiled.json");
  assert.equal(compiled.ok, false);
  assert.match(compiled.detail, /invalid or unsupported version/);
  assert.equal(result.ok, false);
});

test("setup quotes an install path with spaces so the absolute hook still resolves", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "grudge installer spaces-"));
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });

  const settings = JSON.parse(await readFile(join(cwd, ".claude", "settings.json"), "utf8"));
  const command = settings.hooks.PreToolUse[0].hooks[0].command;
  const expected = `"${process.execPath}" "${join(cwd, ".grudge", "bin", "grudge.mjs")}" hook PreToolUse`;
  assert.equal(command, expected);

  const result = await doctor({ cwd, home, print: false });
  assert.equal(result.checks.find(({ name }) => name === "hook paths").ok, true);
  assert.equal(result.checks.find(({ name }) => name === "launch directory").ok, true);
});

/** Install a project, then replace every registered hook command with `command`. */
async function projectWithHookCommand(command) {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".git"), { recursive: true });
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const settingsPath = join(cwd, ".claude", "settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event][0].hooks[0].command = command.replaceAll("EVENT", event);
  }
  settings.statusLine.command = command.replaceAll("EVENT", "Stop");
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { cwd, home, settingsPath };
}

/** Create an executable stub at `path`. */
async function executable(path) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return path;
}

test("hook paths rejects a relative node_modules/.bin shim instead of ignoring it", async () => {
  // Deferred finding: only `grudge.mjs` tokens were resolved, so a shim
  // registration was recognised as a Grudge hook and then never checked.
  const { cwd, home } = await projectWithHookCommand("node ./node_modules/.bin/grudge hook EVENT");

  const check = (await doctor({ cwd, home, print: false })).checks.find(({ name }) => name === "hook paths");

  assert.equal(check.ok, false);
  assert.match(check.detail, /relative path/);
});

test("hook paths accepts an absolute shim, rejects a missing one, and resolves PATH names", async () => {
  const shim = await executable(join(await scratch(), "bin", "grudge"));
  const resolved = await projectWithHookCommand(`"${shim}" hook EVENT`);
  const resolvedCheck = (await doctor({ cwd: resolved.cwd, home: resolved.home, print: false })).checks.find(({ name }) => name === "hook paths");
  assert.equal(resolvedCheck.ok, true, resolvedCheck.detail);

  const missing = await projectWithHookCommand(`"${join(await scratch(), "bin", "grudge")}" hook EVENT`);
  const missingCheck = (await doctor({ cwd: missing.cwd, home: missing.home, print: false })).checks.find(({ name }) => name === "hook paths");
  assert.equal(missingCheck.ok, false);
  assert.match(missingCheck.detail, /command missing/);

  // A bare name is resolved from the same PATH the host will use.
  const onPath = await projectWithHookCommand("grudge hook EVENT");
  const blank = (await doctor({ cwd: onPath.cwd, home: onPath.home, print: false, pathEnv: "" })).checks.find(({ name }) => name === "hook paths");
  assert.equal(blank.ok, false);
  assert.match(blank.detail, /not found on PATH/);
  const found = (await doctor({ cwd: onPath.cwd, home: onPath.home, print: false, pathEnv: join(shim, "..") })).checks.find(({ name }) => name === "hook paths");
  assert.equal(found.ok, true, found.detail);
});

test("hook paths warns, and does not fail, when a package runner hides the target", async () => {
  const { cwd, home } = await projectWithHookCommand("npx grudge hook EVENT");

  const result = await doctor({ cwd, home, print: false });
  const check = result.checks.find(({ name }) => name === "hook paths");

  assert.equal(check.ok, true);
  assert.equal(check.warning, true);
  assert.match(check.detail, /cannot be verified/);
});

test("doctor reports no install for a nested repository instead of borrowing the outer one", async () => {
  // Deferred finding: the upward walk had no repository boundary, so a nested
  // repository reported the enclosing project's install.
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const vendored = join(cwd, "vendor", "lib");
  await mkdir(join(vendored, ".git"), { recursive: true });
  const launch = join(vendored, "src");
  await mkdir(launch, { recursive: true });

  const result = await doctor({ cwd: launch, home, print: false });
  const config = result.checks.find(({ name }) => name === "config");
  const directory = result.checks.find(({ name }) => name === "launch directory");

  assert.equal(result.installKind, "none");
  assert.equal(result.root, launch);
  assert.equal(config.ok, false);
  assert.equal(directory.ok, false);
  assert.match(directory.detail, /no Grudge install at or above/);
});

test("uninstall from a subdirectory removes the repository install", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".git"), { recursive: true });
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const nested = join(cwd, "src", "deep");
  await mkdir(nested, { recursive: true });

  const result = await uninstall({ cwd: nested, home, print: false });

  assert.equal(result.found, true);
  assert.equal(result.root, cwd);
  assert.ok(result.removed.length > 0);
  await assert.rejects(access(join(cwd, ".grudge")));
});

test("uninstall in an unrelated directory removes nothing and says so", async () => {
  const home = await scratch();
  const runtime = join(home, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  // A user-scope install above a directory that is in no repository.
  await setup({ cwd: home, home, agents: ["codex"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  const stray = join(home, "Downloads", "scratch");
  await mkdir(stray, { recursive: true });

  const result = await uninstall({ cwd: stray, home, print: false });

  assert.equal(result.found, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.removed, []);
  assert.match(result.reason, /no Grudge install at or above/);
  // The user install is untouched.
  assert.equal(await readFile(join(home, ".grudge/config.json"), "utf8").then(() => true), true);
});

test("hook paths accepts the installed runtime without an execute bit", async () => {
  // The runtime is an argument to `node`, so POSIX installs write it 0644 and
  // still execute it. Requiring mode & 0o111 failed every POSIX install.
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await setup({ cwd, home, agents: ["claude-code"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await chmod(join(cwd, ".grudge", "bin", "grudge.mjs"), 0o644);

  const check = (await doctor({ cwd, home, print: false })).checks.find(({ name }) => name === "hook paths");

  assert.equal(check.ok, true, check.detail);
});

test("hook paths fails a Grudge command whose target cannot be resolved", async () => {
  // A shell-wrapped registration is recognised as a Grudge hook but no token
  // can be resolved, so the install may be dead. Warning-only passed it.
  const { cwd, home } = await projectWithHookCommand('sh -c "node mygrudge.mjs hook EVENT"');

  const check = (await doctor({ cwd, home, print: false })).checks.find(({ name }) => name === "hook paths");

  assert.equal(check.ok, false);
  assert.match(check.detail, /cannot resolve a Grudge command/);
});

/** Read and rewrite the installed config so the test controls `lastBackup`. */
async function setLastBackup(cwd, value) {
  const path = join(cwd, ".grudge", "config.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  config.lastBackup = value;
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

test("uninstall refuses a backup manifest that points outside the install", async () => {
  // The manifest is an ordinary project file, so a hostile checkout could ship
  // one that writes to the user's home. Restores are confined to the install.
  const cwd = await scratch();
  const home = await scratch();
  const outside = await scratch();
  const victim = join(outside, "victim.txt");
  await writeFile(victim, "original\n");
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".git"), { recursive: true });
  await setup({ cwd, home, agents: ["codex"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  const forged = join(cwd, ".grudge", "backups", "forged");
  await mkdir(forged, { recursive: true });
  await writeFile(join(forged, "payload.txt"), "owned\n");
  await writeFile(join(forged, "manifest.json"), `${JSON.stringify({
    version: 1,
    entries: [
      { file: victim, existed: true, backup: join(forged, "payload.txt"), root: forged },
      { file: join(cwd, "AGENTS.md"), existed: true, backup: join(outside, "payload.txt"), root: forged },
    ],
  }, null, 2)}\n`);
  await setLastBackup(cwd, "forged");

  const result = await uninstall({ cwd, home, print: false });

  assert.equal(await readFile(victim, "utf8"), "original\n");
  assert.equal(result.found, true);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.every((warning) => /outside the install or the backup directory/.test(warning)));
});

test("uninstall continues when the recorded backup no longer exists", async () => {
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");
  await mkdir(join(cwd, ".git"), { recursive: true });
  await setup({ cwd, home, agents: ["codex"], scope: "repo", yes: true, runtimeScript: runtime, print: false });
  await setLastBackup(cwd, "deleted-by-hand");

  const result = await uninstall({ cwd, home, print: false });

  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.match(result.warnings[0], /could not restore backup 'deleted-by-hand'/);
  await assert.rejects(access(join(cwd, ".grudge")));
});

test("global setup does not create or modify $HOME/.gitignore", async () => {
  // Deferred finding: `--scope global` installed at home and then wrote
  // `$HOME/.gitignore`, which git never reads.
  const cwd = await scratch();
  const home = await scratch();
  const runtime = join(cwd, "runtime.mjs");
  await writeFile(runtime, "#!/usr/bin/env node\nprocess.exit(0);\n");

  const created = await setup({ cwd, home, agents: ["claude-code"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  await assert.rejects(access(join(home, ".gitignore")));
  assert.ok(created.warnings.some((warning) => /\.gitignore/.test(warning)));

  // An existing file the user owns stays byte-identical.
  const existing = `${join(home, "node_modules/")}\n`;
  await writeFile(join(home, ".gitignore"), existing);
  await setup({ cwd, home, agents: ["claude-code"], scope: "global", yes: true, runtimeScript: runtime, print: false });
  assert.equal(await readFile(join(home, ".gitignore"), "utf8"), existing);
});


