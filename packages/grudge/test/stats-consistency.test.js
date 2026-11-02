// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, readEvents, readStats, record, reportSinceLast } from "../src/core/stats.js";
import { writeJsonAtomic } from "../src/core/store.js";
import { stats } from "../src/commands/stats.js";
import { report } from "../src/commands/report.js";
import { statusline } from "../src/commands/statusline.js";
import { renderCommand } from "../src/output.js";
import { preToolUse } from "../src/hooks/pre-tool-use.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(packageRoot, "dist", "grudge.mjs");

async function scratch() {
  return mkdtemp(join(tmpdir(), "grudge-stats-parity-"));
}

// One rule per outcome the accounting model must keep apart.
const blockRule = {
  id: "stats-block",
  mode: "block",
  kind: "call_shape",
  tool: "shell",
  match: { command: { $contains: "rm -rf" } },
  ordering: { before: "", after: "" },
  taint: { source: "", sink: "" },
  polarity: "never",
  english: "Never run destructive shell commands.",
  createdFrom: "test",
};

const warnRule = {
  id: "stats-warn",
  mode: "warn",
  kind: "call_shape",
  tool: "shell",
  match: { command: { $contains: "git push" } },
  ordering: { before: "", after: "" },
  taint: { source: "", sink: "" },
  polarity: "never",
  english: "Do not push without asking.",
  createdFrom: "test",
};

const secretRule = {
  id: "stats-secret",
  mode: "block",
  kind: "call_shape",
  tool: "shell",
  match: { command: { $contains: "TRANSFER" } },
  ordering: { before: "", after: "" },
  taint: { source: "", sink: "" },
  polarity: "never",
  english: "Never transfer funds without approval.",
  createdFrom: "test",
};

/** Install a governed project so the real hook path appends accounting events. */
async function governed(root, rules = [blockRule]) {
  await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules });
  await writeJsonAtomic(join(root, ".grudge", "config.json"), {});
  return root;
}

function toolCall(root, sessionId, toolName, toolInput) {
  return { session_id: sessionId, cwd: root, hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput };
}

/** Run the built hook in a child process, exactly as a host would. */
function spawnHook(root, payload) {
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
    child.stdin.end(JSON.stringify(payload));
  });
}

test("stats counts blocks from the canonical append-only log, not the legacy file", async () => {
  const root = await scratch();
  try {
    // The regression: hooks append to stats.jsonl and never touch stats.json,
    // so the legacy counter stayed at its zeroed default while report showed 2.
    await appendEvent(root, { type: "catch", outcome: "blocked", scarId: "scar-a", sessionId: "s1", injectedChars: 40 });
    await appendEvent(root, { type: "catch", outcome: "blocked", scarId: "scar-a", sessionId: "s1", injectedChars: 40 });
    await appendEvent(root, { type: "catch", outcome: "warned", scarId: "scar-b", sessionId: "s1" });
    const result = await stats({ cwd: root, print: false });
    const lifetime = (await report({ cwd: root, print: false })).lifetime;
    assert.equal(result.blocks, 2);
    assert.equal(result.blocked, 2);
    assert.equal(result.blocks, lifetime.blocked);
    assert.equal(result.warnings, 1);
    assert.equal(result.warned, lifetime.warned);
    assert.equal(result.caught, lifetime.caught);
    assert.equal(result.estimatedTokensSaved, 3000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stats keeps legacy stats.json readable when no events were ever appended", async () => {
  const root = await scratch();
  try {
    await writeJsonAtomic(join(root, ".grudge", "stats.json"), { blocks: 4, warnings: 1, proposals: 2, acceptedScars: 3, perScar: {} });
    const result = await stats({ cwd: root, print: false });
    assert.equal(result.blocks, 4);
    assert.equal(result.warnings, 1);
    assert.equal(result.proposals, 2);
    assert.equal(result.acceptedScars, 3);
    assert.equal(result.estimatedTokensSaved, 6000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stats returns zeros for a missing installation instead of throwing", async () => {
  const root = await scratch();
  try {
    const result = await stats({ cwd: root, print: false });
    assert.equal(result.blocks, 0);
    assert.equal(result.warnings, 0);
    assert.equal(result.proposals, 0);
    assert.equal(result.estimatedTokensSaved, 0);
    assert.equal(result.estimated, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stats survives a corrupt legacy file and corrupt event lines", async () => {
  const root = await scratch();
  try {
    await mkdir(join(root, ".grudge"), { recursive: true });
    await writeFile(join(root, ".grudge", "stats.json"), "{not json", "utf8");
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1" });
    const log = await readFile(join(root, ".grudge", "stats.jsonl"), "utf8");
    await writeFile(join(root, ".grudge", "stats.jsonl"), `${log}\ntruncated-line`, "utf8");
    const result = await stats({ cwd: root, print: false });
    assert.equal(result.blocks, 1);
    assert.equal(result.estimatedTokensSaved, 1500);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("statusline reports the same lifetime block count as stats", async () => {
  const root = await scratch();
  try {
    await writeJsonAtomic(join(root, ".grudge", "config.json"), { avoidedRetryTokens: 1500 });
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1" });
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1" });
    const line = await statusline({ cwd: root, print: false });
    assert.match(line, /2 blocked/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the built CLI prints the same counts for stats and report", async () => {
  const root = await scratch();
  try {
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1" });
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1" });
    const statsJson = JSON.parse(spawnSync(process.execPath, [dist, "stats", "--json", "--cwd", root], { encoding: "utf8" }).stdout);
    const reportJson = JSON.parse(spawnSync(process.execPath, [dist, "report", "--json", "--cwd", root], { encoding: "utf8" }).stdout);
    assert.equal(statsJson.blocks, reportJson.lifetime.blocked);
    assert.equal(statsJson.blocks, 2);
    assert.equal(statsJson.warnings, reportJson.lifetime.warned);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an allowed call writes only a hook claim and cannot inflate the counters", async () => {
  const root = await governed(await scratch());
  try {
    const result = await preToolUse(toolCall(root, "allow-1", "Read", { file_path: join(root, "README.md") }));
    assert.equal(result.code, 0);
    // The claim proves the guard ran; it is deliberately not a counter.
    const events = await readEvents(root);
    assert.deepEqual(events.map((event) => event.type), ["hook"]);
    const counters = await stats({ cwd: root, print: false });
    assert.equal(counters.caught, 0);
    assert.equal(counters.blocks, 0);
    assert.equal(counters.warnings, 0);
    assert.equal(counters.estimatedTokensSaved, 0);
    assert.match(await statusline({ cwd: root, print: false }), /0 blocked/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("blocked, warned, and allowed calls stay in separate buckets and agree with report", async () => {
  const root = await governed(await scratch(), [blockRule, warnRule]);
  try {
    const blocked = await preToolUse(toolCall(root, "host-block", "Bash", { command: "rm -rf /tmp/grudge-stats" }));
    assert.equal(blocked.code, 2);
    const warned = await preToolUse(toolCall(root, "host-warn", "Bash", { command: "git push --force" }));
    assert.equal(warned.code, 0);
    assert.match(warned.stderr, /grudge warning:/);
    const allowed = await preToolUse(toolCall(root, "host-allow", "Read", { file_path: "notes.md" }));
    assert.equal(allowed.code, 0);

    const counters = await stats({ cwd: root, print: false });
    const lifetime = (await report({ cwd: root, print: false })).lifetime;
    assert.equal(counters.caught, 2);
    assert.equal(counters.blocked, 1);
    assert.equal(counters.blocks, 1);
    assert.equal(counters.warned, 1);
    assert.equal(counters.warnings, 1);
    // Caught is the total of the two disjoint outcomes; nothing is counted twice.
    assert.equal(counters.caught, counters.blocked + counters.warned);
    assert.equal(lifetime.caught, counters.caught);
    assert.equal(lifetime.blocked, counters.blocks);
    assert.equal(lifetime.warned, counters.warnings);
    assert.equal(counters.estimatedTokensSaved, 1500);
    assert.match(await statusline({ cwd: root, print: false }), /1 blocked/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("replayed deliveries collapse to one event at read time", async () => {
  const root = await scratch();
  try {
    const event = { type: "catch", outcome: "blocked", scarId: "scar-replay", sessionId: "replay", dedupeKey: "replay-key:catch" };
    const first = await appendEvent(root, event);
    assert.equal(first.duplicate, false);
    // A delivery that arrives after the tail check would still collapse at read
    // time; write the replayed line by hand to prove the reader enforces it.
    const second = await appendEvent(root, event);
    assert.equal(second.duplicate, true);
    await writeFile(join(root, ".grudge", "stats.jsonl"), `${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}\n`, { flag: "a" });
    const events = await readEvents(root);
    assert.equal(events.length, 1);
    const counters = await stats({ cwd: root, print: false });
    assert.equal(counters.caught, 1);
    assert.equal(counters.blocks, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent hook writers never lose or invent counters", async () => {
  const root = await governed(await scratch());
  try {
    const work = Array.from({ length: 20 }, (_, index) => (index < 10
      ? spawnHook(root, toolCall(root, `concurrent-block-${index}`, "Bash", { command: "rm -rf /tmp/grudge-concurrent" }))
      : spawnHook(root, toolCall(root, `concurrent-allow-${index}`, "Read", { file_path: "notes.md" }))));
    const results = await Promise.all(work);
    assert.equal(results.slice(0, 10).filter((result) => result.code === 2).length, 10);
    assert.equal(results.slice(10).filter((result) => result.code === 0).length, 10);

    const raw = await readFile(join(root, ".grudge", "stats.jsonl"), "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), `corrupt stats line: ${line}`);

    const events = await readEvents(root);
    assert.equal(events.filter((event) => event.type === "catch").length, 10);
    assert.equal(events.filter((event) => event.type === "hook").length, 20);
    const counters = await stats({ cwd: root, print: false });
    assert.equal(counters.caught, 10);
    assert.equal(counters.blocks, 10);
    assert.equal(counters.warnings, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("reportSinceLast consumes each event once and leaves lifetime totals intact", async () => {
  const root = await scratch();
  try {
    await appendEvent(root, { type: "catch", outcome: "blocked", scarId: "scar-a", sessionId: "reset" });
    await appendEvent(root, { type: "catch", outcome: "warned", scarId: "scar-b", sessionId: "reset" });

    const first = await reportSinceLast(root, "reset", 1500);
    assert.equal(first.caught, 2);
    assert.equal(first.blocked, 1);
    assert.equal(first.warned, 1);
    const second = await reportSinceLast(root, "reset", 1500);
    assert.equal(second.caught, 0);
    assert.equal(second.blocked, 0);

    await appendEvent(root, { type: "catch", outcome: "blocked", scarId: "scar-a", sessionId: "reset" });
    const third = await reportSinceLast(root, "reset", 1500);
    assert.equal(third.caught, 1);
    assert.equal(third.blocked, 1);
    assert.equal(third.avoidedRetryTokens, 1500);

    // Consuming the cursor must never rewrite the lifetime totals.
    const lifetime = (await report({ cwd: root, print: false })).lifetime;
    assert.equal(lifetime.caught, 3);
    assert.equal(lifetime.blocked, 2);
    const state = JSON.parse(await readFile(join(root, ".grudge", "report-state.json"), "utf8"));
    assert.equal(state.reset, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stats never persists tool arguments or secrets from the call", async () => {
  const root = await governed(await scratch(), [secretRule]);
  try {
    const secret = "sk-live-DO-NOT-PERSIST-9f3a";
    const result = await preToolUse(toolCall(root, "secret-1", "Bash", { command: `TRANSFER --token ${secret}` }));
    assert.equal(result.code, 2);
    const raw = await readFile(join(root, ".grudge", "stats.jsonl"), "utf8");
    assert.doesNotMatch(raw, /DO-NOT-PERSIST/);
    assert.doesNotMatch(raw, /TRANSFER/);
    const counters = JSON.parse(spawnSync(process.execPath, [dist, "stats", "--json", "--cwd", root], { encoding: "utf8" }).stdout);
    assert.doesNotMatch(JSON.stringify(counters), /DO-NOT-PERSIST/);
    assert.equal(counters.blocks, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stop events are counted from the log without leaking into the 4-line human contract", async () => {
  const root = await scratch();
  try {
    await appendEvent(root, { type: "stop", sessionId: "s1", at: "2026-10-30T10:00:00.000Z" });
    await appendEvent(root, { type: "stop", sessionId: "s1", at: "2026-10-31T11:00:00.000Z" });
    // A malformed stop record (no `at`) counts but must not blank the cursor.
    await writeFile(join(root, ".grudge", "stats.jsonl"), `${JSON.stringify({ type: "stop", sessionId: "s1" })}\n`, { flag: "a" });

    const counters = await stats({ cwd: root, print: false });
    const lifetime = (await report({ cwd: root, print: false })).lifetime;
    assert.equal(counters.stops, 3);
    assert.equal(counters.lastStopAt, "2026-10-31T11:00:00.000Z");
    assert.equal(lifetime.stops, 3);
    assert.equal(lifetime.lastStopAt, "2026-10-31T11:00:00.000Z");
    // A stop is bookkeeping, never a catch.
    assert.equal(counters.caught, 0);
    assert.equal(counters.blocks, 0);

    const human = renderCommand("stats", counters, { ascii: true });
    assert.match(human, /\[ok\] Blocks: 0/);
    assert.match(human, /\[ok\] Warnings: 0/);
    assert.match(human, /\[ok\] Scars: 0/);
    assert.match(human, /\[ok\] Estimated savings:/);
    assert.doesNotMatch(human, /stops/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("legacy stop counters stay readable when no events were ever appended", async () => {
  const root = await scratch();
  try {
    await writeJsonAtomic(join(root, ".grudge", "stats.json"), {
      blocks: 1, warnings: 0, proposals: 0, acceptedScars: 0, perScar: {},
      stops: 5, lastStopAt: "2026-10-01T00:00:00.000Z",
    });
    const counters = await stats({ cwd: root, print: false });
    assert.equal(counters.blocks, 1);
    assert.equal(counters.stops, 5);
    assert.equal(counters.lastStopAt, "2026-10-01T00:00:00.000Z");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent record calls keep every legacy counter increment", async () => {
  // `record` still maintains the Phase 20 stats.json counter, which is a
  // read-modify-write. Unlocked, N concurrent callers all read the same value
  // and write it back plus one, so blocks undercounts and stats disagrees with
  // the append-only log.
  const root = await scratch();
  try {
    await Promise.all(Array.from({ length: 24 }, () => record(root, "blocks")));
    const counters = await readStats(root);
    const events = await readEvents(root);
    assert.equal(counters.blocks, 24);
    assert.equal(events.filter((event) => event.outcome === "blocked").length, 24);
  } finally { await rm(root, { recursive: true, force: true }); }
});
