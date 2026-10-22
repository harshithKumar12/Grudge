import test from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, aggregate, readEvents } from "../src/core/stats.js";
import { report } from "../src/commands/report.js";
import { statusline } from "../src/commands/statusline.js";
import { stop } from "../src/hooks/stop.js";
import { writeJsonAtomic } from "../src/core/store.js";

async function rootFixture() {
  const root = await mkdtemp(join(tmpdir(), "grudge-phase23-"));
  await writeJsonAtomic(join(root, ".grudge", "config.json"), { avoidedRetryTokens: 1500 });
  return root;
}

test("stats JSONL tolerates corruption and concurrent writers", async () => {
  const root = await rootFixture();
  try {
    await Promise.all(Array.from({ length: 30 }, (_, index) => appendEvent(root, { type: "catch", outcome: index % 2 ? "warned" : "blocked", sessionId: "s1", injectedChars: 4 })));
    await appendFile(join(root, ".grudge", "stats.jsonl"), "not-json\n", "utf8");
    const events = await readEvents(root);
    assert.equal(events.length, 30);
    const result = await aggregate(root, "s1", 1500);
    assert.equal(result.caught, 30);
    assert.equal(result.blocked, 15);
    assert.equal(result.warned, 15);
    assert.equal(result.injectedTokens, 30);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("advisory events are excluded and reports calculate estimated net savings", async () => {
  const root = await rootFixture();
  try {
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1", injectedChars: 20, tier: "Advisory" });
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1", injectedChars: 20 });
    const result = await report({ cwd: root, session: "s1", lifetime: true, json: true, print: false });
    assert.equal(result.session.caught, 1);
    assert.equal(result.session.avoidedRetryTokens, 1500);
    assert.equal(result.session.injectedTokens, 5);
    assert.equal(result.session.netSavingsTokens, 1495);
    assert.equal(result.estimated, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Stop reports new catches once, stays silent otherwise, and labels estimates", async () => {
  const root = await rootFixture();
  try {
    await appendEvent(root, { type: "catch", outcome: "blocked", sessionId: "s1", injectedChars: 40 });
    const first = await stop({ cwd: root, session_id: "s1" });
    assert.deepEqual(JSON.parse(first.stdout), { systemMessage: "Grudge: 1 mistake caught, 1 blocked. ~1.5k tokens saved (est.), ~1.5k net of what Grudge injected (est.)." });
    assert.deepEqual((await stop({ cwd: root, session_id: "s1" })).stdout, "");
    await appendEvent(root, { type: "catch", outcome: "warned", sessionId: "s1", injectedChars: 40 });
    const warning = await stop({ cwd: root, session_id: "s1" });
    assert.match(JSON.parse(warning.stdout).systemMessage, /1 mistake caught, 0 blocked/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("statusline can show session totals", async () => {
  const root = await rootFixture();
  try {
    await appendEvent(root, { type: "catch", outcome: "warned", sessionId: "s2", injectedChars: 12 });
    const line = await statusline({ cwd: root, session: "s2", print: false });
    assert.match(line, /session 1 caught\/1 warned/);
    assert.match(line, /\(est\.\)/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
