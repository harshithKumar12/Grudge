// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalize, toolNames } from "../src/core/normalize.js";
import { preToolUse } from "../src/hooks/pre-tool-use.js";
import { writeJsonAtomic } from "../src/core/store.js";

// Every tool name Claude Code can send, the canonical DSL tool it must become,
// and an argument that satisfies a rule written against that canonical tool.
// Each case uses its own needle so a rule can only match its own host tool.
const CASES = [
  { host: "Bash", tool: "shell", field: "command", input: { command: "echo NEEDLE_BASH" } },
  { host: "PowerShell", tool: "shell", field: "command", input: { command: "Write-Output NEEDLE_POWERSHELL" } },
  { host: "Read", tool: "read_file", field: "file_path", input: { file_path: "a/NEEDLE_READ.txt" } },
  { host: "NotebookRead", tool: "read_file", field: "notebook_path", input: { notebook_path: "b/NEEDLE_NOTEBOOKREAD.ipynb" } },
  { host: "Write", tool: "write_file", field: "file_path", input: { file_path: "c/NEEDLE_WRITE.txt", content: "x" } },
  { host: "Edit", tool: "write_file", field: "file_path", input: { file_path: "d/NEEDLE_EDIT.txt", old_string: "a", new_string: "b" } },
  { host: "MultiEdit", tool: "write_file", field: "file_path", input: { file_path: "e/NEEDLE_MULTIEDIT.txt", edits: [] } },
  { host: "NotebookEdit", tool: "write_file", field: "notebook_path", input: { notebook_path: "f/NEEDLE_NOTEBOOKEDIT.ipynb", new_source: "x" } },
  { host: "WebFetch", tool: "http", field: "url", input: { url: "https://example.com/NEEDLE_WEBFETCH", prompt: "x" } },
  { host: "WebSearch", tool: "http", field: "query", input: { query: "NEEDLE_WEBSEARCH" } },
];

const needle = (item) => `NEEDLE_${item.host.toUpperCase()}`;

test("every Claude Code tool name normalizes to its canonical DSL tool", () => {
  for (const { host, tool } of CASES) {
    assert.equal(normalize({ tool: host, args: {} }).tool, tool, `${host} should map to ${tool}`);
  }
  assert.equal(normalize({ tool: "Bash", args: { command: "x" } }).tool, "shell", "mapping must not depend on case");
  assert.equal(normalize({ tool: "powershell", args: {} }).tool, "shell");
  assert.equal(normalize({ tool: "mcp__github__create_issue", args: {} }).tool, "mcp");
  assert.equal(toolNames.powershell, "shell");
  // Host tools with no DSL equivalent keep their own name; they are not guessed
  // into a canonical tool that would make unrelated rules fire.
  assert.equal(normalize({ tool: "Glob", args: { pattern: "*.js" } }).tool, "Glob");
  assert.equal(normalize({ tool: "Grep", args: { pattern: "x" } }).tool, "Grep");
});

test("a rule for each canonical tool blocks the matching Claude Code call", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-map25-"));
  const rules = CASES.map((item, index) => ({
    id: `map-${index}`,
    mode: "block",
    kind: "call_shape",
    tool: item.tool,
    match: { [item.field]: { $contains: needle(item) } },
    english: `Never call ${item.tool} with ${needle(item)}.`,
    createdFrom: "test",
  }));
  await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules });
  await writeJsonAtomic(join(root, ".grudge", "config.json"), {});
  try {
    for (const [index, item] of CASES.entries()) {
      const result = await preToolUse({ cwd: root, session_id: `map-${index}`, tool_name: item.host, tool_input: item.input });
      assert.equal(result.code, 2, `${item.host} was not blocked by a ${item.tool} rule`);
      assert.equal(result.scarId, `map-${index}`, `${item.host} matched the wrong rule`);
    }
    const unmapped = await preToolUse({ cwd: root, session_id: "map-glob", tool_name: "Glob", tool_input: { pattern: "MATCHED" } });
    assert.equal(unmapped.code, 0, "an unmapped host tool must not invent a canonical tool match");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
