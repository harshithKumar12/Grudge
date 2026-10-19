// OWNER: lane-b
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append, prune, read } from "../src/core/session.js";
import { redact, redactValue } from "../src/core/redact.js";

test("redact masks labeled, env-style, prefixed, fake, and private-key secrets", () => {
  const source = [
    "api_key=sk-demo-1234567890abcdef",
    "TOKEN=top-secret-value",
    "FAKE_KEY_sk_demo_1234567890",
    "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
  ].join("\n");
  const result = redact(source);
  assert.equal(result.includes("1234567890abcdef"), false);
  assert.equal(result.includes("top-secret-value"), false);
  assert.equal(result.includes("BEGIN PRIVATE KEY"), false);
  assert.equal(redactValue({ nested: ["password: hunter2-long"] }).nested[0], "password: [REDACTED]");
});

test("session append and read preserve valid events and skip corrupt lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-session-"));
  await append(root, "abc", { tool: "read_file", args: { path: "x" }, timestamp: "2026-01-01T00:00:00.000Z" });
  await writeFile(join(root, "session", "abc.jsonl"), "{broken}\n{\"tool\":\"shell\"}\n", { flag: "a" });
  assert.deepEqual(await read(root, "abc"), [
    { tool: "read_file", args: { path: "x" }, timestamp: "2026-01-01T00:00:00.000Z" },
    { tool: "shell" },
  ]);
});

test("prune retains the newest event window and removes old sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-prune-"));
  await append(root, "keep", { n: 1, timestamp: "2026-01-08T00:00:00.000Z" });
  await append(root, "keep", { n: 2, timestamp: "2026-01-08T00:00:01.000Z" });
  await append(root, "old", { n: 1, timestamp: "2025-12-01T00:00:00.000Z" });
  await prune(root, { now: Date.parse("2026-01-08T00:00:02.000Z"), maxEvents: 1, maxAgeMs: 1000 });
  assert.deepEqual(await read(root, "keep"), [{ n: 2, timestamp: "2026-01-08T00:00:01.000Z" }]);
  assert.deepEqual(await read(root, "old"), []);
});
