// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents } from "../src/core/stats.js";
import { reportSinceLast } from "../src/core/stats.js";
import { writeJsonAtomic } from "../src/core/store.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(packageRoot, "dist", "grudge.mjs");

const blockRule = {
  id: "stress-block",
  mode: "block",
  kind: "call_shape",
  // Rules match the canonical tool name, not the host's `Bash` spelling.
  tool: "shell",
  match: { command: { $contains: "rm -rf" } },
  ordering: { before: "", after: "" },
  taint: { source: "", sink: "" },
  polarity: "never",
  english: "Never run destructive shell commands.",
  createdFrom: "test",
};

function payload(root, sessionId) {
  return JSON.stringify({
    session_id: sessionId,
    cwd: root,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /tmp/grudge-stress" },
  });
}

/** Spawn one hook process and resolve once it closes. */
function spawnHook(root, sessionId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dist, "hook", "pre-tool-use"], { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(payload(root, sessionId));
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "grudge-stress-"));
  await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules: [blockRule] });
  await writeJsonAtomic(join(root, ".grudge", "config.json"), {});
  return root;
}

test("25 concurrent processes all block the matching call (P0-1)", async () => {
  const root = await fixture();
  try {
    // One distinct session id per process, so dedupe cannot explain a block.
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, index) => spawnHook(root, `concurrent-${index}`)),
    );
    const allow = results.filter((result) => result.code !== 2);
    assert.equal(allow.length, 0, `every process must block; allowed: ${JSON.stringify(allow.map((r) => ({ code: r.code, stderr: r.stderr })))}`);
    for (const result of results) {
      const output = JSON.parse(result.stdout);
      assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
      assert.equal(output.blocked, true);
      assert.equal(output.scarId, "stress-block");
    }
    // Concurrent appends must leave a readable, uncorrupted append-only log.
    const raw = await readFile(join(root, ".grudge", "stats.jsonl"), "utf8");
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      assert.doesNotThrow(() => JSON.parse(line), `corrupt stats line: ${line}`);
    }
    assert.equal((await readEvents(root)).filter((event) => event.type === "catch").length, 25);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("duplicate delivery is still blocked but counted once (P2-1)", async () => {
  const root = await fixture();
  try {
    const [first, second] = await Promise.all([spawnHook(root, "dup"), spawnHook(root, "dup")]);
    assert.equal(first.code, 2);
    assert.equal(second.code, 2);
    assert.equal((await readEvents(root)).filter((event) => event.type === "catch").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a stale lock from a killed process is taken over, not waited on (P0-1)", async () => {
  const root = await fixture();
  try {
    const lock = join(root, ".grudge", "stats.jsonl.lock");
    await mkdir(lock, { recursive: true });
    const old = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(lock, old, old);
    const started = Date.now();
    const result = await reportSinceLast(root, "stale-session", 1500);
    const elapsed = Date.now() - started;
    assert.equal(result.caught, 0);
    assert.ok(elapsed < 5000, `stale lock takeover took ${elapsed}ms`);
    await assert.rejects(readFile(lock, "utf8"), "the stale lock must be released");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a terminated process leaves no lock and the next call still blocks (P0-1)", async () => {
  const root = await fixture();
  try {
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [dist, "report", "--json"], { cwd: root, windowsHide: true });
      child.on("error", resolve);
      child.on("close", resolve);
      // Kill immediately: a terminated writer must not leave enforcement unable
      // to decide.
      setTimeout(() => child.kill("SIGKILL"), 10);
    });
    const result = await spawnHook(root, "after-kill");
    assert.equal(result.code, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a spawned hook returns well under a second (P1-2)", async () => {
  const root = await fixture();
  try {
    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      const started = Date.now();
      const result = await spawnHook(root, `latency-${index}`);
      samples.push(Date.now() - started);
      assert.equal(result.code, 2);
    }
    const worst = Math.max(...samples);
    assert.ok(worst < 1000, `hook latency ${worst}ms must stay under 1000ms; samples=${samples.join(",")}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
