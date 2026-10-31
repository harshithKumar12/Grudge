// OWNER: lane-b
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postToolUse } from "../src/hooks/post-tool-use.js";
import { read } from "../src/core/session.js";

test("PostToolUse records a real Claude-style payload with redaction and metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-post-tool-"));
  const payload = {
    session_id: "claude-session-123",
    tool_name: "Read",
    tool_input: { file_path: "fake/api_keys.txt", note: "token=top-secret-value" },
    tool_response: "contents: FAKE_KEY_sk_demo_1234567890",
  };
  const result = await postToolUse(payload, { root, now: "2026-10-20T12:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.event.tool, "read_file");
  // The separator is preserved on purpose (P0-4): rewriting `token=value` as
  // `token: value` corrupts assignments and URL query strings.
  assert.equal(result.event.args.note, "token=[REDACTED]");
  assert.equal(result.event.result.includes("FAKE_KEY_sk_demo"), false);
  assert.equal(result.event.byteSize, Buffer.byteLength(result.event.result));
  assert.equal(
    result.event.resultHash,
    createHash("sha256").update(result.event.result).digest("hex"),
  );
  assert.deepEqual(await read(join(root, ".grudge"), "claude-session-123"), [result.event]);
});

test("PostToolUse truncates by UTF-8 bytes and hashes the stored result", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-post-tool-long-"));
  const result = await postToolUse(
    {
      session_id: "long-session",
      tool_name: "Bash",
      tool_input: { command: "printf hello" },
      tool_response: "🙂".repeat(5000),
    },
    { root },
  );
  assert.equal(result.ok, true);
  assert.ok(result.event.byteSize <= 4096);
  assert.equal(result.event.byteSize, Buffer.byteLength(result.event.result));
  assert.equal(
    result.event.resultHash,
    createHash("sha256").update(result.event.result).digest("hex"),
  );
});

test("PostToolUse deduplicates duplicate user/project hook invocations", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-post-tool-duplicate-"));
  const payload = { session_id: "duplicate-session", tool_name: "Read", tool_input: { file_path: "README.md" }, tool_response: "same" };
  const first = await postToolUse(payload, { root });
  const second = await postToolUse(payload, { root });
  assert.equal(first.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal((await read(join(root, ".grudge"), "duplicate-session")).length, 1);
});

test("PostToolUse fails open for malformed payloads and write errors", async () => {
  const missingSession = await postToolUse({ tool_name: "Read", tool_input: {} }, { root: "bad" });
  assert.equal(missingSession.ok, false);
  const fileRoot = join(await mkdtemp(join(tmpdir(), "grudge-post-tool-file-")), "root-file");
  await writeFile(fileRoot, "not a directory");
  const writeFailure = await postToolUse(
    { session_id: "safe", tool_name: "Read", tool_input: {} },
    { root: fileRoot },
  );
  assert.equal(writeFailure.ok, false);
  assert.match(writeFailure.warning, /post-tool-use skipped/);
});
