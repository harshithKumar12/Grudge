// OWNER: lane-b
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accept } from "../src/commands/accept.js";
import { propose } from "../src/commands/propose.js";
import { scars } from "../src/commands/scars.js";

async function rootWithSessions(events) {
  const root = await mkdtemp(join(tmpdir(), "grudge-propose-"));
  const { append } = await import("../src/core/session.js");
  for (const event of events) await append(root, "latest", event);
  return root;
}

test("valid proposal is pending and accept compiles an idempotent block", async () => {
  const root = await rootWithSessions([
    { tool: "shell", args: { command: "untrusted instruction" }, result: "ok" },
  ]);
  const proposal = await propose({
    root,
    rule: 'never call shell where command ~ "untrusted instruction"',
    why: "The shell command came from untrusted tool output.",
    session: "latest",
  });
  assert.equal(proposal.accepted, false);
  assert.equal(proposal.pending, true);
  assert.equal(proposal.enforced, false);
  assert.equal(proposal.status, "pending");
  assert.match(proposal.run, new RegExp(`^grudge accept ${proposal.id}$`));
  const pending = await scars("list", { root });
  assert.equal(pending.pending.length, 1);
  const first = await accept(proposal.id, { root });
  assert.equal(first.accepted, true);
  await accept(proposal.id, { root });
  const compiled = JSON.parse(await readFile(join(root, ".grudge", "compiled.json"), "utf8"));
  assert.equal(compiled.rules[0].mode, "block");
  assert.equal(compiled.rules[0].id, proposal.id);
});

test("vacuous and over-broad proposals reject, preventive bypasses vacuity", async () => {
  const root = await rootWithSessions([{ tool: "read_file", args: { path: "notes.txt" } }]);
  const vacuous = await propose({ root, rule: 'never call shell where command ~ "bad"', why: "Do not do this." });
  assert.equal(vacuous.accepted, false);
  assert.match(vacuous.error, /vacuous/);
  const preventive = await propose({ root, rule: 'never call shell where command ~ "bad"', why: "Review this before use.", preventive: true });
  assert.equal(preventive.pending, true);
  assert.equal(preventive.accepted, false);
});

test("scars disable, reject, and remove are idempotent", async () => {
  const root = await rootWithSessions([{ tool: "shell", args: { command: "bad" } }]);
  const proposal = await propose({ root, rule: 'never call shell where command ~ "bad"', why: "Avoid the bad command." });
  await accept(proposal.id, { root });
  await scars("disable", { root, id: proposal.id });
  let listed = await scars("list", { root });
  assert.equal(listed.scars[0].mode, "off");
  await scars("remove", { root, id: proposal.id });
  await scars("remove", { root, id: proposal.id });
  listed = await scars("list", { root });
  assert.equal(listed.scars.length, 0);
});

test("autoAccept is opt-in and promotes only when explicitly configured", async () => {
  const root = await rootWithSessions([{ tool: "shell", args: { command: "bad" } }]);
  await mkdir(join(root, ".grudge"), { recursive: true });
  await writeFile(join(root, ".grudge", "config.json"), JSON.stringify({ autoAccept: true }));
  const proposal = await propose({ root, rule: 'never call shell where command ~ "bad"', why: "Avoid the bad command." });
  assert.equal(proposal.autoAccepted, true);
  assert.equal((await scars("list", { root })).pending.length, 0);
});

test("propose --accept enforces immediately without review", async () => {
  const root = await rootWithSessions([{ tool: "shell", args: { command: "bad" } }]);
  const proposal = await propose({ root, rule: 'never call shell where command ~ "bad"', why: "Enforce now.", accept: true });
  assert.equal(proposal.accepted, true);
  assert.equal(proposal.pending, false);
  assert.equal(proposal.enforced, true);
  const compiled = JSON.parse(await readFile(join(root, ".grudge", "compiled.json"), "utf8"));
  assert.equal(compiled.rules[0].mode, "block");
  assert.equal((await scars("list", { root })).pending.length, 0);
});
