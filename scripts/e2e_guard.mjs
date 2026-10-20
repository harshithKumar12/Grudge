#!/usr/bin/env node
/** Real two-session offline proof for the Phase 21 guard path. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repo = resolve(here, "..");
const hook = resolve(repo, "packages/grudge/dist/grudge.mjs");
const fixtureRoot = resolve(repo, "spec/hook-payloads/claude-code/leak-session");

function run(args, input, cwd) {
  const result = spawnSync(process.execPath, [hook, ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, GRUDGE_DISABLE: "" },
  });
  if (result.error) throw result.error;
  return result;
}

function payload(name) {
  return readFile(join(fixtureRoot, name), "utf8");
}

export async function runGuardProof(root) {
  root ??= await mkdtemp(join(tmpdir(), "grudge-guard-"));
  await mkdir(join(root, ".grudge"), { recursive: true });
  const session1Read = run(["hook", "post-tool-use"], await payload("01-read.json"), root);
  const session1Leak = run(["hook", "post-tool-use"], await payload("02-http.json"), root);
  if (session1Read.status !== 0 || session1Leak.status !== 0) throw new Error("Session 1 capture failed");

  const proposal = run(
    ["propose", "--rule", "never call http where body tainted_by read_file", "--why", "Do not send file data over HTTP", "--session", "guard-session-1"],
    "",
    root,
  );
  if (proposal.status !== 0) throw new Error(`proposal failed: ${proposal.stderr || proposal.stdout}`);
  const pending = JSON.parse(proposal.stdout);
  const accepted = run(["accept", pending.id], "", root);
  if (accepted.status !== 0) throw new Error(`accept failed: ${accepted.stderr || accepted.stdout}`);

  const session2Read = run(["hook", "post-tool-use"], await payload("03-read-session-2.json"), root);
  if (session2Read.status !== 0) throw new Error("Session 2 read capture failed");
  const blocked = run(["hook", "pre-tool-use"], await payload("04-http-session-2.json"), root);
  const decision = blocked.stdout ? JSON.parse(blocked.stdout) : {};
  if (!decision.blocked || decision.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(`Session 2 leak was not blocked: ${blocked.stdout}${blocked.stderr}`);
  }
  return { root, pendingId: pending.id, session1: "leaked and proposed", session2: "blocked", reason: decision.reason };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootArg = process.argv.indexOf("--root");
  const root = rootArg === -1 ? undefined : resolve(process.argv[rootArg + 1]);
  try {
    const result = await runGuardProof(root);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
