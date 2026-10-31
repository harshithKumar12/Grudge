// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redact, redactValue } from "../src/core/redact.js";
import { check } from "../src/dsl/check.js";
import { parse } from "../src/dsl/parse.js";
import { compiledRule } from "../src/commands/scars.js";
import { preToolUse } from "../src/hooks/pre-tool-use.js";
import { writeJsonAtomic } from "../src/core/store.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("redaction masks every corpus secret and preserves ordinary text (P1-4)", async () => {
  const corpus = JSON.parse(await readFile(join(repo, "spec", "redaction-corpus.json"), "utf8"));
  assert.ok(corpus.length >= 10);
  for (const item of corpus) {
    assert.equal(redact(item.input), item.expected, item.name);
    // A redaction marker must survive a second pass unchanged.
    assert.equal(redact(item.expected), item.expected, `${item.name} is not idempotent`);
  }
});

test("redaction applies to nested values before they are persisted (P0-4)", () => {
  const nested = redactValue({ log: [{ note: "api_key=sk-demo-1234567890abcdef" }] });
  assert.equal(nested.log[0].note, "api_key=[REDACTED]");

  const structured = redactValue({
    password: "hunter2hunter2",
    auth: { token: "abcd1234efgh5678", secret: "zzzz9999yyyy8888" },
    headers: { "Set-Cookie": "session=abcdef123456", "x-api-key": "zzzzzzzzzzzz" },
    config: { client_secret: "shhh-secret", keyboard: "keep me" },
    list: [{ refresh_token: "abcd12345678" }],
  });
  assert.equal(structured.password, "[REDACTED]");
  assert.deepEqual(structured.auth, { token: "[REDACTED]", secret: "[REDACTED]" });
  assert.deepEqual(structured.headers, { "Set-Cookie": "[REDACTED]", "x-api-key": "[REDACTED]" });
  assert.equal(structured.config.client_secret, "[REDACTED]");
  assert.equal(structured.config.keyboard, "keep me", "an ordinary key is not redacted");
  assert.deepEqual(structured.list, [{ refresh_token: "[REDACTED]" }]);
});

test("path casing is ignored on Windows and kept on POSIX (P1-5)", () => {
  const windows = { id: "w", mode: "block", kind: "call_shape", tool: "write_file", match: { path: { $under: "C:/AUDIT" } }, ordering: { before: "", after: "" }, taint: { source: "", sink: "" }, polarity: "never" };
  assert.equal(check(windows, [{ tool: "write_file", args: { path: "c:/audit/deep/x.txt" } }]).violated, true);
  assert.equal(check(windows, [{ tool: "write_file", args: { path: "C:\\AUDIT\\x.txt" } }]).violated, true);
  assert.equal(check(windows, [{ tool: "write_file", args: { path: "C:/AUDIT-OTHER/x.txt" } }]).violated, false);
  assert.equal(check(windows, [{ tool: "write_file", args: { path: "C:/AUDIT/../secret.txt" } }]).violated, false);
  assert.equal(check(windows, [{ tool: "write_file", args: { path: "C:/AUDIT/sub/../x.txt" } }]).violated, true);
  const posix = { ...windows, id: "p", match: { path: { $under: "/data" } } };
  assert.equal(check(posix, [{ tool: "write_file", args: { path: "/DATA/x.txt" } }]).violated, false);
  assert.equal(check(posix, [{ tool: "write_file", args: { path: "/data/x.txt" } }]).violated, true);
});

test("a compiled `must call` rule requires the call and allows it (P1-1)", async () => {
  const rule = compiledRule({ id: "must-1", rule: parse("must call verify_user"), english: "Must verify the user." });
  assert.equal(rule.polarity, "must");
  assert.equal(check(rule, []).violated, true);
  assert.equal(check(rule, [{ tool: "read_file", args: {} }]).violated, true);
  assert.equal(check(rule, [{ tool: "verify_user", args: {} }]).violated, false);

  const root = await mkdtemp(join(tmpdir(), "grudge-polarity-"));
  try {
    await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules: [rule] });
    await writeJsonAtomic(join(root, ".grudge", "config.json"), {});
    const missing = await preToolUse({ cwd: root, session_id: "p1", tool_name: "Read", tool_input: { file_path: "a.txt" } });
    assert.equal(missing.code, 2, "a missing required call must block");
    assert.match(missing.stderr, /must-1/);
    const satisfied = await preToolUse({ cwd: root, session_id: "p2", tool_name: "verify_user", tool_input: {} });
    assert.equal(satisfied.code, 0, "the required call itself must be allowed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a compiled `never call` rule still blocks the matching call (P1-1)", async () => {
  const rule = compiledRule({ id: "never-1", rule: parse('never call shell where command ~ "rm -rf"'), english: "Never run destructive shell commands." });
  assert.equal(rule.polarity, "never");
  assert.equal(check(rule, [{ tool: "shell", args: { command: "rm -rf /" } }]).violated, true);
  assert.equal(check(rule, [{ tool: "shell", args: { command: "ls" } }]).violated, false);

  const root = await mkdtemp(join(tmpdir(), "grudge-polarity-"));
  try {
    await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules: [rule] });
    await writeJsonAtomic(join(root, ".grudge", "config.json"), {});
    const blocked = await preToolUse({ cwd: root, session_id: "n1", tool_name: "Bash", tool_input: { command: "rm -rf /" } });
    assert.equal(blocked.code, 2);
    const allowed = await preToolUse({ cwd: root, session_id: "n2", tool_name: "Bash", tool_input: { command: "ls -la" } });
    assert.equal(allowed.code, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a hostile session id reads nothing instead of an unrelated file (P2-2)", async () => {
  const { read } = await import("../src/core/session.js");
  const root = await mkdtemp(join(tmpdir(), "grudge-session-"));
  try {
    await writeFile(join(root, "outside.jsonl"), '{"tool":"http"}\n');
    assert.deepEqual(await read(root, "../outside"), []);
    assert.deepEqual(await read(root, ".."), []);
    assert.deepEqual(await read(root, ""), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
