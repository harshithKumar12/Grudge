import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append } from "../src/core/session.js";
import { canonicalTool } from "../src/core/normalize.js";
import { writeJsonAtomic } from "../src/core/store.js";
import { parse } from "../src/dsl/parse.js";
import { compiledRule } from "../src/commands/scars.js";
import { preToolUse } from "../src/hooks/pre-tool-use.js";

// A rule is matched against the canonical name an event records (`read_file`),
// but authors write the host's names (`Read`). Without canonicalization the
// rule compiles cleanly and never fires.

test("canonicalTool maps host names onto the recorded tool names", () => {
  const pairs = [
    ["Read", "read_file"], ["read", "read_file"], ["NotebookRead", "read_file"],
    ["Write", "write_file"], ["Edit", "write_file"], ["MultiEdit", "write_file"],
    ["Bash", "shell"], ["PowerShell", "shell"],
    ["WebFetch", "http"], ["WebSearch", "http"],
  ];
  for (const [host, canonical] of pairs) {
    assert.equal(canonicalTool(host), canonical, `${host} must resolve to ${canonical}`);
  }
});

test("canonicalTool is idempotent and never rewrites qualified or unknown names", () => {
  for (const name of ["read_file", "shell", "http"]) {
    assert.equal(canonicalTool(name), name, "canonical names are stable");
  }
  // An MCP tool is already addressed by its raw name, which the event carries
  // in `tools`; rewriting it would point the rule at the wrong tool.
  assert.equal(canonicalTool("mcp__github__create_issue"), "mcp__github__create_issue");
  assert.equal(canonicalTool("CustomTool"), "CustomTool");
  assert.equal(canonicalTool(""), "");
});

test("the parser resolves tool names in every rule form", () => {
  assert.equal(parse('never call Read where file_path ~ "/secret"').tool, "read_file");
  assert.equal(parse('never call Bash where command ~ "curl"').tool, "shell");
  // Field names are not tool names and must survive untouched.
  const shape = parse('never call Write where file_path ~ "/secrets"');
  assert.equal(shape.tool, "write_file");
  assert.deepEqual(Object.keys(shape.match), ["file_path"]);

  const ordering = parse("must call Read before shell");
  assert.equal(ordering.ordering.before, "read_file");
  assert.equal(ordering.ordering.after, "shell");

  const taint = parse("never call shell where body tainted_by WebFetch");
  assert.equal(taint.taint.source, "http");
  assert.equal(taint.taint.sink, "shell");
});

test("compilation canonicalizes existing records, including ordering and taint", () => {
  const ordering = compiledRule({
    id: "s-ord", english: "Must call Read before call Bash.",
    rule: { kind: "ordering", tool: "Bash", ordering: { before: "Read", after: "Bash" }, polarity: "must" },
  });
  assert.deepEqual(ordering.ordering, { before: "read_file", after: "shell" });

  const taint = compiledRule({
    id: "s-taint", english: "Never send WebFetch data to Bash.",
    rule: { kind: "taint_flow", tool: "Bash", taint: { source: "WebFetch", sink: "Bash", sourceField: null, sinkField: "body" } },
  });
  assert.equal(taint.tool, "shell");
  assert.equal(taint.taint.source, "http");
  assert.equal(taint.taint.sink, "shell");
});

test("a rule written with host names actually blocks, and only what it names", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-f7-"));
  try {
    const rule = parse('never call Read where file_path ~ "/secret"');
    const compiled = compiledRule({ id: "f7-read", english: "Never call Read with the specified arguments.", rule: { ...rule, polarity: "never" } });
    await writeJsonAtomic(join(root, ".grudge", "compiled.json"), { version: 1, rules: [{ ...compiled, mode: "block" }] });
    await writeJsonAtomic(join(root, ".grudge", "config.json"), { mode: "on" });
    await append(join(root, ".grudge"), "s1", { tool: "read_file", args: { file_path: "/secret/prod.env" }, result: "", timestamp: new Date().toISOString() });

    const blocked = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Read", tool_input: { file_path: "/secret/prod.env" } });
    assert.equal(blocked.code, 2, "the rule written as 'Read' must block a Read");
    assert.equal(blocked.scarId, "f7-read");

    const benign = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Read", tool_input: { file_path: "/tmp/notes.txt" } });
    assert.equal(benign.code, 0, "a benign read is unaffected");

    const other = await preToolUse({ cwd: root, session_id: "s1", tool_name: "Bash", tool_input: { command: "echo hi" } });
    assert.equal(other.code, 0, "a rule about Read does not reach Bash");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("equivalent spellings compile to the same rule", () => {
  const a = parse('never call Read where file_path ~ "/secret"');
  const b = parse('never call read_file where file_path ~ "/secret"');
  const strip = (rule) => { const { source, ...rest } = rule; return rest; };
  assert.deepEqual(strip(a), strip(b), "Read and read_file must produce an identical rule");
});
