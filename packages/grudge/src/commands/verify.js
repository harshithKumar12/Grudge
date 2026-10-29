// OWNER: integrator
/**
 * One-command, offline proof that the installed Guard blocks a real call.
 *
 * Every check runs against the copy of the runtime that `setup` writes into a
 * temporary project, so a passing run proves the shipped artifact and not just
 * the source tree. No model, no network, no Python.
 */

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setup } from "./setup.js";

export const VERIFY_RULE = 'never call shell where command ~ "GRUDGE_TEST"';
export const VERIFY_WHY = "verify: harmless self-test rule";
const COMMAND_TIMEOUT_MS = 20000;

/** Run the installed runtime with stdin and collect its exit code and streams. */
export function runRuntime(script, args, { cwd, input = "" } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      windowsHide: true,
      // A parent shell with GRUDGE_DISABLE=1 would make the proof fail for the
      // wrong reason; verify tests the default configuration.
      env: { ...process.env, GRUDGE_DISABLE: "" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(-1);
    }, COMMAND_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { stderr += String(error?.message ?? error); finish(-1); });
    child.on("close", (code) => finish(code === null ? -1 : code));
    child.stdin.on("error", () => { /* the child may exit before reading stdin */ });
    child.stdin.end(input);
  });
}

function json(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function oneLine(text, limit = 240) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function deniedReason(result) {
  const output = json(result.stdout);
  return output?.hookSpecificOutput?.permissionDecisionReason ?? output?.reason ?? result.stderr.trim();
}

/**
 * @param {{root?: string, cwd?: string, keep?: boolean, runtimeScript?: string, print?: boolean}} [options]
 * @returns {Promise<{ok: boolean, checks: {name: string, ok: boolean, detail: string}[], root: string, kept: boolean}>}
 */
export async function verify(options = {}) {
  const ownsBase = !options.root;
  const base = options.root ?? await mkdtemp(join(tmpdir(), "grudge-verify-"));
  const project = join(base, "project");
  const home = join(base, "home");
  const runtime = join(project, ".grudge/bin/grudge.mjs");
  const keep = Boolean(options.keep);
  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    return ok;
  };
  let kept = false;
  let crashed = false;
  try {
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(join(project, "package.json"), '{"name":"grudge-verify","private":true}\n');

    const installed = await setup({
      cwd: project,
      home,
      yes: true,
      agents: ["claude-code"],
      scope: "repo",
      runtimeScript: options.runtimeScript,
      print: false,
    });
    record("install", installed.changes.length > 0 && installed.runtimeInstalled,
      installed.runtimeInstalled
        ? `${installed.changes.length} files written, including .claude/settings.json and CLAUDE.md`
        : "runtime not installed; build the package first: npm --prefix packages/grudge run build");

    const version = await runRuntime(runtime, ["--version"], { cwd: project });
    record("runtime", version.code === 0 && /^grudge \d+\.\d+\.\d+$/.test(version.stdout.trim()),
      version.code === 0 ? version.stdout.trim() : `exit ${version.code}: ${oneLine(version.stderr)}`);

    const session = "grudge-verify-session";
    const captured = await runRuntime(runtime, ["hook", "PostToolUse"], {
      cwd: project,
      input: JSON.stringify({ session_id: session, hook_event_name: "PostToolUse", cwd: project, tool_name: "Bash", tool_input: { command: "echo GRUDGE_TEST" }, tool_response: "GRUDGE_TEST" }),
    });
    const sessionFile = join(project, ".grudge/session", `${session}.jsonl`);
    const capturedText = await readFile(sessionFile, "utf8").catch(() => "");
    record("capture", captured.code === 0 && capturedText.includes('"tool":"shell"'),
      capturedText.includes('"tool":"shell"')
        ? "PostToolUse payload stored as canonical tool \"shell\""
        : `exit ${captured.code}, session event missing or not normalized: ${oneLine(capturedText || captured.stderr)}`);

    const proposal = await runRuntime(runtime, ["propose", "--json", "--rule", VERIFY_RULE, "--why", VERIFY_WHY, "--preventive"], { cwd: project });
    const proposed = json(proposal.stdout);
    const pendingOnDisk = proposed?.id
      ? await readFile(join(project, ".grudge/pending", `${proposed.id}.scar.json`), "utf8").catch(() => "")
      : "";
    record("propose", proposal.code === 0 && proposed?.pending === true && pendingOnDisk.includes('"mode": "pending"'),
      proposed?.id ? `${proposed.id} recorded as pending` : `exit ${proposal.code}: ${oneLine(proposed?.error ?? proposal.stderr ?? proposal.stdout)}`);

    const accepted = proposed?.id
      ? await runRuntime(runtime, ["accept", proposed.id], { cwd: project })
      : { code: -1, stdout: "", stderr: "no scar id to accept" };
    const compiledText = await readFile(join(project, ".grudge/compiled.json"), "utf8").catch(() => "");
    const compiled = json(compiledText);
    const compiledRule = compiled?.rules?.find((rule) => rule.id === proposed?.id);
    record("accept", accepted.code === 0 && compiledRule?.mode === "block",
      compiledRule ? `${compiledRule.id} compiled with mode "block"` : `exit ${accepted.code}: ${oneLine(accepted.stderr || compiledText)}`);

    const sessionBlock = "grudge-verify-block";
    const blocked = await runRuntime(runtime, ["hook", "PreToolUse"], {
      cwd: project,
      input: JSON.stringify({ session_id: sessionBlock, hook_event_name: "PreToolUse", cwd: project, tool_name: "Bash", tool_input: { command: "echo GRUDGE_TEST" } }),
    });
    const reason = deniedReason(blocked);
    record("block", blocked.code === 2 && Boolean(reason),
      blocked.code === 2 ? `Bash "echo GRUDGE_TEST" exited 2: ${oneLine(reason, 120)}` : `exit ${blocked.code}, expected 2: ${oneLine(reason || blocked.stdout)}`);

    const allowed = await runRuntime(runtime, ["hook", "PreToolUse"], {
      cwd: project,
      input: JSON.stringify({ session_id: "grudge-verify-allow", hook_event_name: "PreToolUse", cwd: project, tool_name: "Bash", tool_input: { command: "echo hello" } }),
    });
    record("allow", allowed.code === 0 && allowed.stdout.trim() === "",
      allowed.code === 0 ? 'Bash "echo hello" exited 0 with no decision' : `exit ${allowed.code}: ${oneLine(allowed.stdout || allowed.stderr)}`);

    const malformed = await runRuntime(runtime, ["hook", "PreToolUse"], { cwd: project, input: "{not json" });
    record("fail open", malformed.code === 0,
      malformed.code === 0 ? "malformed payload exited 0 (allowed)" : `exit ${malformed.code}, expected 0`);

    const statsText = await readFile(join(project, ".grudge/stats.jsonl"), "utf8").catch(() => "");
    const blocks = statsText
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => json(line))
      .filter((event) => event?.type === "catch" && event?.outcome === "blocked").length;
    record("stats", blocks === 1, `${blocks} blocked event${blocks === 1 ? "" : "s"} in .grudge/stats.jsonl`);

    const report = await runRuntime(runtime, ["report", "--json"], { cwd: project });
    const reported = json(report.stdout)?.lifetime;
    record("report", report.code === 0 && reported?.blocked === 1,
      reported ? `grudge report shows ${reported.caught} caught, ${reported.blocked} blocked` : `exit ${report.code}: ${oneLine(report.stderr || report.stdout)}`);
  } catch (error) {
    crashed = true;
    record("setup", false, oneLine(error instanceof Error ? error.message : String(error)));
  } finally {
    const ok = !crashed && checks.length > 0 && checks.every((check) => check.ok);
    kept = keep || !ok || !ownsBase;
    if (ownsBase && !kept) await rm(base, { recursive: true, force: true }).catch(() => {});
  }

  const ok = !crashed && checks.every((check) => check.ok);
  const result = { ok, checks, root: base, kept };
  if (options.print !== false) printVerify(result);
  return result;
}

function printVerify({ ok, checks, root, kept }) {
  const lines = [];
  for (const check of checks) {
    lines.push(`[${check.ok ? "ok" : "fail"}] ${check.name}: ${check.detail}`);
  }
  const passed = checks.filter((check) => check.ok).length;
  lines.push(`Result: ${ok ? "PASS" : "FAIL"} (${passed}/${checks.length} checks)`);
  if (ok) lines.push(kept ? `Temp project kept: ${resolve(root)}` : "Temp project removed (use --keep to inspect it)");
  else {
    lines.push(`Temp project kept for inspection: ${resolve(root)}`);
    lines.push("Fix: paste this output into an issue at https://github.com/harshithKumar12/Grudge/issues");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
