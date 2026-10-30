#!/usr/bin/env node
/**
 * Real two-session offline proof for the Guard enforcement path.
 *
 * This file ships inside the Python wheel (`grudge/demo/e2e_guard.mjs`), so it
 * may not assume the repository layout. The Node guard runtime is resolved from
 * `--runtime`, `GRUDGE_NODE_RUNTIME`, a repository checkout, or the project's
 * `node_modules`; the payload fixtures ship next to this file.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const payloadRoot = join(here, "payloads", "leak-session");
const NOT_FOUND = "Grudge guard runtime not found. Install it with `npm install grudge-cli` or build it with `npm --prefix packages/grudge run build`, then pass --runtime <path to dist/grudge.mjs> or set GRUDGE_NODE_RUNTIME.";

function runtimeCandidates(explicit, cwd) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.GRUDGE_NODE_RUNTIME) candidates.push(process.env.GRUDGE_NODE_RUNTIME);
  candidates.push(resolve(here, "..", "..", "packages", "grudge", "dist", "grudge.mjs"));
  candidates.push(resolve(cwd, "node_modules", "grudge-cli", "dist", "grudge.mjs"));
  candidates.push(resolve(cwd, "..", "node_modules", "grudge-cli", "dist", "grudge.mjs"));
  return candidates;
}

function resolveRuntime(explicit, cwd) {
  for (const candidate of runtimeCandidates(explicit, cwd)) {
    if (candidate && existsSync(candidate)) return resolve(candidate);
  }
  throw new Error(NOT_FOUND);
}

function runner(runtime) {
  return (args, input, cwd) => {
    const result = spawnSync(process.execPath, [runtime, ...args], {
      cwd,
      input,
      encoding: "utf8",
      env: { ...process.env, GRUDGE_DISABLE: "" },
    });
    if (result.error) throw result.error;
    return result;
  };
}

async function payload(name) {
  return readFile(join(payloadRoot, name), "utf8");
}

export async function runGuardProof(root, { runtime } = {}) {
  root ??= await mkdtemp(join(tmpdir(), "grudge-guard-"));
  const hook = resolveRuntime(runtime, root);
  const run = runner(hook);
  await mkdir(join(root, ".grudge"), { recursive: true });

  const session1Read = run(["hook", "post-tool-use"], await payload("01-read.json"), root);
  const session1Leak = run(["hook", "post-tool-use"], await payload("02-http.json"), root);
  if (session1Read.status !== 0 || session1Leak.status !== 0) throw new Error("Session 1 capture failed");

  const proposal = run(
    ["propose", "--rule", "never call http where body tainted_by read_file", "--why", "Do not send file data over HTTP", "--session", "guard-session-1", "--json"],
    "",
    root,
  );
  if (proposal.status !== 0) throw new Error(`proposal failed: ${proposal.stderr || proposal.stdout}`);
  const pending = JSON.parse(proposal.stdout);
  const accepted = run(["accept", pending.id, "--json"], "", root);
  if (accepted.status !== 0) throw new Error(`accept failed: ${accepted.stderr || accepted.stdout}`);

  const session2Read = run(["hook", "post-tool-use"], await payload("03-read-session-2.json"), root);
  if (session2Read.status !== 0) throw new Error("Session 2 read capture failed");
  const blocked = run(["hook", "pre-tool-use"], await payload("04-http-session-2.json"), root);
  const decision = blocked.stdout ? JSON.parse(blocked.stdout) : {};
  if (blocked.status !== 2 || !decision.blocked || decision.hookSpecificOutput?.permissionDecision !== "deny") {
    throw new Error(`Session 2 leak was not blocked (exit ${blocked.status}): ${blocked.stdout}${blocked.stderr}`);
  }
  return { root, runtime: hook, pendingId: pending.id, session1: "leaked and proposed", session2: "blocked", reason: decision.reason };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argOf = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const root = argOf("--root") ? resolve(argOf("--root")) : undefined;
  const runtime = argOf("--runtime");
  try {
    const result = await runGuardProof(root, { runtime });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
