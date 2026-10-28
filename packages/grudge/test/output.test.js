import test from "node:test";
import assert from "node:assert/strict";
import { jsonOutput, renderCommand, renderError } from "../src/output.js";

const fixtures = {
  setup: { scope: "repo", selected: ["claude-code"], changes: [{ path: "CLAUDE.md" }], warnings: [], runtimeInstalled: true },
  doctor: { ok: true, checks: [{ name: "node", ok: true, detail: "v25" }], budgetMeasurements: [], warnings: [] },
  uninstall: { root: ".", removed: [".grudge"], restored: [] },
  stats: { blocks: 1, warnings: 0, scars: 1, estimatedTokensSaved: 20 },
  report: { lifetime: { caught: 1, blocked: 1, warned: 0 } },
  propose: { accepted: true, pending: true, id: "scar-test", run: "grudge accept scar-test" },
  accept: { accepted: true, id: "scar-test" },
  scars: { pending: [], scars: [{ id: "scar-test", mode: "block" }] },
  status: { ok: true, checks: [{ name: "runtime", ok: true, detail: "present" }] },
};

test("default output snapshots have a structured header, summary, and next command", () => {
  for (const [command, result] of Object.entries(fixtures)) {
    const output = renderCommand(command, result, { ascii: true });
    assert.match(output, new RegExp(`^Grudge ${command} v0\\.1\\.7`));
    assert.match(output, /\d+ passed, \d+ failed, \d+ warnings/);
    assert.match(output, /Next:/);
  }
});

test("json output is pretty and preserves the original object shape", () => {
  const value = { ok: false, checks: [{ name: "config", ok: false }], warnings: [] };
  const output = jsonOutput(value);
  assert.deepEqual(JSON.parse(output), value);
  assert.match(output, /\n  "ok": false/);
});

test("non-TTY and ASCII output has no ANSI color codes", () => {
  const output = renderCommand("stats", fixtures.stats, { ascii: true });
  assert.doesNotMatch(output, /\x1b\[/);
  assert.match(output, /\[ok\]/);
});

test("human-readable output never emits ANSI color codes", () => {
  const output = renderCommand("stats", fixtures.stats);
  assert.doesNotMatch(output, /\x1b\[/);
  assert.match(output, /\[ok\]/);
});

test("doctor renders the not-installed state without treating it as a failure", () => {
  const output = renderCommand("doctor", { ok: false, checks: [
    { name: "config", ok: false, detail: "missing or invalid" },
    { name: "runtime", ok: false, detail: "missing" },
  ], budgetMeasurements: [] }, { ascii: true });
  assert.match(output, /Grudge is not installed here\./);
  assert.match(output, /Next: grudge setup --scope repo/);
  assert.match(output, /1 passed, 0 failed, 0 warnings/);
});

test("errors include a fix without a stack trace by default", () => {
  const output = renderError(new Error("runtime missing"), { command: "doctor", ascii: true });
  assert.match(output, /Error: runtime missing/);
  assert.match(output, /Fix: grudge setup --scope repo/);
  assert.doesNotMatch(output, / at /);
});
