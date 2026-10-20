import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPS, estimateTokens, limitAgentsBlock, measureOutputs, truncate } from "../src/core/budget.js";
import { estimatedTokensSaved, readStats, record } from "../src/core/stats.js";
import { stats } from "../src/commands/stats.js";
import { statusline } from "../src/commands/statusline.js";
import { writeJsonAtomic } from "../src/core/store.js";

test("budget caps truncate deterministically and estimate ceil(chars/4)", () => {
  assert.equal(estimateTokens("12345"), 2);
  assert.equal(truncate("abcdefgh", 4), "abcd");
  const block = limitAgentsBlock(Array.from({ length: 20 }, (_, i) => `${i}: ${"x".repeat(100)}`).join("\n"));
  assert.ok(block.length <= CAPS.agentsBlockChars);
  assert.ok(block.split("\n").length <= CAPS.agentsBlockLines);
  const measurements = measureOutputs({ sessionStart: "x".repeat(1200), blockReason: "x".repeat(400), promptNudge: "x".repeat(200), agentsBlock: block });
  assert.ok(measurements.every((item) => item.withinCap));
  assert.equal(measurements[0].estimatedTokens, 300);
});

test("stats survive corrupt files and count per-scar events", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-stats-"));
  try {
    await writeFile(join(root, ".grudge-stats.json"), "corrupt", "utf8");
    assert.equal((await readStats(root)).blocks, 0);
    await record(root, "blocks", "scar-1");
    await record(root, "warnings", "scar-1");
    const result = await readStats(root);
    assert.equal(result.blocks, 1);
    assert.equal(result.perScar["scar-1"].warnings, 1);
    assert.equal(estimatedTokensSaved(result, 1500), 1500);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stats command labels savings as an estimate", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-stats-command-"));
  try {
    await writeJsonAtomic(join(root, ".grudge", "stats.json"), { blocks: 2, warnings: 1, proposals: 0, acceptedScars: 3, perScar: {} });
    const result = await stats({ cwd: root, print: false });
    assert.equal(result.estimated, true);
    assert.equal(result.estimatedTokensSaved, 3000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("statusline is compact, estimated, and under 50ms", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-statusline-"));
  try {
    await writeJsonAtomic(join(root, ".grudge", "config.json"), { avoidedRetryTokens: 1500 });
    await writeJsonAtomic(join(root, ".grudge", "stats.json"), { blocks: 2, warnings: 0, proposals: 0, acceptedScars: 4, perScar: {} });
    // Claude Code polls statusLine repeatedly. Warm the immutable config cache
    // before measuring the steady-state call so unrelated cold filesystem/AV
    // latency does not make this Windows timing test flaky.
    const line = await statusline({ cwd: root, print: false });
    const timings = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      await statusline({ cwd: root, print: false });
      timings.push(performance.now() - started);
    }
    assert.match(line, /grudge: 4 scars, 2 blocked, ~3\.0k tokens saved \(est\.\)/);
    assert.ok(line.length < 120);
    assert.ok(Math.max(...timings) < 50, `statusline max took ${Math.max(...timings).toFixed(2)}ms`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("statusline prints nothing when disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-statusline-off-"));
  try {
    await writeJsonAtomic(join(root, ".grudge", "config.json"), { mode: "off" });
    assert.equal(await statusline({ cwd: root, print: false }), "");
  } finally { await rm(root, { recursive: true, force: true }); }
});
