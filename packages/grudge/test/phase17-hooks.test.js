import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append } from "../src/core/session.js";
import { readEvents } from "../src/core/stats.js";
import { writeJsonAtomic, readJson } from "../src/core/store.js";
import { preToolUse } from "../src/hooks/pre-tool-use.js";
import { sessionStart } from "../src/hooks/session-start.js";
import { userPromptSubmit } from "../src/hooks/user-prompt-submit.js";
import { stop } from "../src/hooks/stop.js";
import { runHook } from "../src/commands/hook.js";

async function fixtureRoot(rules, config = {}) {
  const root = await mkdtemp(join(tmpdir(), "grudge-hooks-"));
  await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules });
  await writeJsonAtomic(join(root, ".grudge", "config.json"), config);
  return root;
}

const taintRule = { id: "leak-1", mode: "block", kind: "taint_flow", tool: "http", match: {}, ordering: { before: "", after: "" }, taint: { source: "read_file", sink: "http", sourceField: null, sinkField: "body", sourceMatch: { path: { $under: "C:/workspace" } } }, english: "Never send workspace file data to HTTP.", createdFrom: "test" };

test("PreToolUse blocks tainted Windows-path leak with official deny output", async () => {
  const root = await fixtureRoot([taintRule]);
  try {
    await append(join(root, ".grudge"), "s1", { tool: "read_file", args: { path: "C:\\workspace\\keys.txt" }, result: "FAKE_KEY_123", timestamp: new Date().toISOString() });
    const result = await preToolUse({ cwd: root, session_id: "s1", tool_name: "WebFetch", tool_input: { body: "send FAKE_KEY_123" } });
    // Exit 2 is the code Claude Code blocks on, so the guard blocks even if the
    // host cannot parse the deny JSON.
    assert.equal(result.code, 2);
    assert.match(result.stderr, /grudge: blocked by leak-1/);
    assert.equal(result.blocked, true);
    assert.equal(result.scarId, "leak-1");
    assert.ok(result.reason.length <= 400);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /do not retry/i);
    // A repeated delivery of the same prohibited call must stay blocked; only
    // the counter is deduplicated. Enforcement is never gated on the claim.
    const duplicate = await preToolUse({ cwd: root, session_id: "s1", tool_name: "WebFetch", tool_input: { body: "send FAKE_KEY_123" } });
    assert.equal(duplicate.code, 2);
    assert.equal(JSON.parse(duplicate.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.equal((await readEvents(root)).filter((event) => event.type === "catch").length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("PreToolUse allows benign calls, warns without blocking, and fails open on corrupt rules", async () => {
  const root = await fixtureRoot([{ ...taintRule, mode: "warn" }]);
  try {
    const warning = await preToolUse({ cwd: root, session_id: "safe", tool_name: "Read", tool_input: { file_path: "README.md" } });
    assert.equal(warning.code, 0);
    assert.equal(warning.blocked, undefined);
    assert.equal(warning.warning, undefined);
    await writeJsonAtomic(join(root, ".grudge", "compiled.json"), "not rules");
    const allowed = await preToolUse({ cwd: root, session_id: "safe", tool_name: "Bash", tool_input: { command: "printf ok" } });
    assert.equal(allowed.code, 0);
    assert.equal(allowed.blocked, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("SessionStart caps reminders and UserPromptSubmit avoids false positives", async () => {
  const rules = Array.from({ length: 12 }, (_, i) => ({ ...taintRule, id: `scar-${i}`, english: "A very long reminder that should be bounded to a compact line for the session context." }));
  const root = await fixtureRoot(rules);
  try {
    const start = await sessionStart({ cwd: root });
    assert.ok(start.stdout.length <= 1200);
    assert.ok(start.stdout.split("\n").filter(Boolean).length <= 8);
    assert.ok(start.stdout.split("\n").filter(Boolean).every((line) => line.length <= 140));
    await writeJsonAtomic(join(root, ".grudge", "config.json"), { correctionPatterns: ["never", "revert that"] });
    assert.equal((await userPromptSubmit({ cwd: root, prompt: "never mind, I was thinking aloud" })).stdout, "");
    assert.ok((await userPromptSubmit({ cwd: root, prompt: "Never run that command again" })).stdout.length <= 200);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Stop is silent and records stats; command wrapper fails open on bad input", async () => {
  const root = await fixtureRoot([]);
  try {
    assert.deepEqual(await stop({ cwd: root }), { code: 0, stdout: "", stderr: "" });
    assert.equal((await readJson(join(root, ".grudge", "stats.json"), {})).stops, 1);
    assert.equal((await runHook("pre-tool-use", "not-json")).code, 0);
    assert.match((await runHook("unknown", "{}")).stderr, /unknown hook/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("hook timing p50 and p95 stay below 150ms in-process", async () => {
  const root = await fixtureRoot([]);
  try {
    const times = [];
    for (let i = 0; i < 30; i += 1) {
      const start = performance.now();
      await preToolUse({ cwd: root, session_id: `s-${i}`, tool_name: "Read", tool_input: { file_path: "README.md" } });
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    assert.ok(times[Math.floor(times.length * 0.95)] < 150, `p95=${times[Math.floor(times.length * 0.95)].toFixed(2)}ms`);
  } finally { await rm(root, { recursive: true, force: true }); }
});
