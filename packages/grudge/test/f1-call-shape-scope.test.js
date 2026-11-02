import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append } from "../src/core/session.js";
import { writeJsonAtomic } from "../src/core/store.js";
import { preToolUse } from "../src/hooks/pre-tool-use.js";

// A `call_shape` rule describes one call, so the hook must judge only the call
// the host is about to make. Charging session history to it denied every later
// call in a session — across tool types — once any earlier call matched.

async function fixtureRoot(rules) {
  const root = await mkdtemp(join(tmpdir(), "grudge-f1-"));
  await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules });
  await writeJsonAtomic(join(root, ".grudge", "config.json"), { mode: "on" });
  return root;
}

const shellRule = {
  id: "f1-shell",
  mode: "block",
  kind: "call_shape",
  tool: "shell",
  match: { command: { $contains: "protected-token" } },
  ordering: { before: "", after: "" },
  taint: { source: "", sink: "" },
  polarity: "never",
  english: "Never call shell with the specified arguments.",
  createdFrom: "test",
};

const readRule = {
  id: "f1-read",
  mode: "block",
  kind: "call_shape",
  tool: "read_file",
  match: { file_path: { $contains: "secrets" } },
  ordering: { before: "", after: "" },
  taint: { source: "", sink: "" },
  polarity: "never",
  english: "Never call read_file with the specified arguments.",
  createdFrom: "test",
};

async function seed(root, sessionId, tool, args) {
  await append(join(root, ".grudge"), sessionId, { tool, args, result: "", timestamp: new Date().toISOString() });
}

test("a call_shape violation blocks only the matching call, not the rest of the session", async () => {
  const root = await fixtureRoot([shellRule]);
  try {
    await seed(root, "s1", "shell", { command: "run protected-token" });

    const matching = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Bash", tool_input: { command: "run protected-token" } });
    assert.equal(matching.code, 2, "the prohibited call is still denied");

    const benign = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Bash", tool_input: { command: "echo hello" } });
    assert.equal(benign.code, 0, "a benign shell call in the same session is allowed");
    assert.equal(benign.blocked, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a shell violation does not block unrelated tool types in the same session", async () => {
  const root = await fixtureRoot([shellRule]);
  try {
    await seed(root, "s1", "shell", { command: "run protected-token" });
    await preToolUse({ cwd: root, session_id: "s1", tool_name: "Bash", tool_input: { command: "run protected-token" } });

    for (const [tool, input] of [
      ["Read", { file_path: "/tmp/notes.txt" }],
      ["Write", { file_path: "/tmp/notes.txt", content: "x" }],
      ["mcp__github__search_issues", { query: "repo:o/r" }],
    ]) {
      const result = await preToolUse({ cwd: root, session_id: "s1", tool_name: tool, tool_input: input });
      assert.equal(result.code, 0, `${tool} must be allowed after a shell violation`);
      assert.equal(result.blocked, undefined);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("each rule keeps its own tool scope within one session", async () => {
  const root = await fixtureRoot([shellRule, readRule]);
  try {
    await seed(root, "s1", "shell", { command: "run protected-token" });
    await seed(root, "s1", "read_file", { file_path: "/etc/secrets/prod.env" });

    const shell = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Bash", tool_input: { command: "run protected-token" } });
    assert.equal(shell.code, 2);
    assert.equal(shell.scarId, "f1-shell");

    const read = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Read", tool_input: { file_path: "/etc/secrets/prod.env" } });
    assert.equal(read.code, 2);
    assert.equal(read.scarId, "f1-read");

    // Neither rule may reach a call the other one governs.
    const other = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Bash", tool_input: { command: "echo hello" } });
    assert.equal(other.code, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid or stale rules are diagnosed and never silently over-match", async () => {
  const root = await fixtureRoot([shellRule]);
  try {
    await seed(root, "s1", "shell", { command: "run protected-token" });
    // A corrupt rule set must fail open rather than deny unrelated calls.
    await writeJsonAtomic(join(root, ".grudge", "compiled.json"), "not rules");
    const result = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Read", tool_input: { file_path: "/tmp/a" } });
    assert.equal(result.code, 0);
    assert.equal(result.blocked, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ordering and taint rules still read session history", async () => {
  const ordering = {
    id: "f1-ord", mode: "block", kind: "ordering", tool: "transfer_funds", match: {},
    ordering: { before: "verify_user", after: "transfer_funds" },
    taint: { source: "", sink: "" }, polarity: "must",
    english: "Must call verify_user before call transfer_funds.", createdFrom: "test",
  };
  const root = await fixtureRoot([ordering]);
  try {
    const unverified = await preToolUse({ cwd: root, session_id: "fresh", tool_name: "transfer_funds", tool_input: { amount: 10 } });
    assert.equal(unverified.code, 2, "history is what proves the prerequisite is missing");

    await seed(root, "verified", "verify_user", { user: "alice" });
    const ok = await preToolUse({ cwd: root, session_id: "verified", tool_name: "transfer_funds", tool_input: { amount: 10 } });
    assert.equal(ok.code, 0);

    const unrelated = await preToolUse({ cwd: root, session_id: "fresh", tool_name: "Bash", tool_input: { command: "echo hi" } });
    assert.equal(unrelated.code, 0, "a tool the rule does not name is untouched");
  } finally { await rm(root, { recursive: true, force: true }); }
});
