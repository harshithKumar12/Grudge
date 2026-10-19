import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../src/dsl/check.js";
import { parse } from "../src/dsl/parse.js";
import { normalize } from "../src/core/normalize.js";
import { readJson, writeJsonAtomic } from "../src/core/store.js";
import { loadConfig } from "../src/core/config.js";

const fixtureFiles = (await import("node:fs/promises")).readdir(new URL("../../../spec/conformance/", import.meta.url));

test("Node checker agrees with all shared conformance fixtures", async () => {
  for (const file of (await fixtureFiles).filter((name) => name.endsWith(".json"))) {
    const fixture = JSON.parse(await readFile(new URL(`../../../spec/conformance/${file}`, import.meta.url), "utf8"));
    assert.deepEqual(check(fixture.rule, fixture.events), fixture.expect, file);
  }
});

test("DSL parses call, ordering, and taint forms", () => {
  assert.equal(parse('never call shell where command ~ "rm -rf"').match.command.$contains, "rm -rf");
  assert.deepEqual(parse("must call verify_user before call transfer"), {
    kind: "ordering", tool: "transfer", match: {}, ordering: { before: "verify_user", after: "transfer" }, taint: { source: "", sink: "" }, polarity: "must", source: "must call verify_user before call transfer",
  });
  assert.equal(parse('never call http where body tainted_by read_file(path ~ "keys")').taint.sourceMatch.path.$contains, "keys");
});

test("normalization maps Claude tool names and MCP tools", () => {
  assert.deepEqual(normalize({ name: "Read", input: { file_path: "C:\\workspace\\a.txt" } }), { tool: "read_file", args: { file_path: "C:\\workspace\\a.txt" } });
  assert.equal(normalize({ tool_name: "mcp__github__issue", args: { number: 1 } }).tool, "mcp");
});

test("store writes atomically and config falls back safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-"));
  try {
    const path = join(root, "nested", "value.json");
    await writeJsonAtomic(path, { ok: true });
    assert.deepEqual(await readJson(path, {}), { ok: true });
    assert.deepEqual(await readJson(join(root, "missing.json"), { fallback: true }), { fallback: true });
    assert.equal((await loadConfig(root)).autoAccept, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
