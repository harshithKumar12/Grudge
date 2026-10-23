// OWNER: lane-c
import { access, copyFile, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { detect } from "../installer/detect.js";
import { prompt } from "../installer/prompt.js";
import { mergeJson, parseJson, mergeObjects } from "../installer/json-merge.js";
import { backup, restoreEntries, writeBackupManifest } from "../installer/backup.js";
import { managedBlock, upsertManagedBlock } from "../installer/managed-block.js";
import { adapter as claudeCode } from "../installer/adapters/claude-code.js";
import { adapter as codex } from "../installer/adapters/codex.js";
import { adapter as cursor } from "../installer/adapters/cursor.js";
import { adapter as geminiCli } from "../installer/adapters/gemini-cli.js";
import { adapter as copilot } from "../installer/adapters/copilot.js";
import { adapter as windsurf } from "../installer/adapters/windsurf.js";
import { adapter as opencode } from "../installer/adapters/opencode.js";
import { VERSION } from "../version.js";

export const adapters = { "claude-code": claudeCode, codex, cursor, "gemini-cli": geminiCli, copilot, windsurf, opencode };

/** Install Grudge into one repository while preserving unrelated settings. */
export async function setup(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const home = resolve(options.home ?? homedir());
  const requestedScope = options.scope;
  if (requestedScope !== undefined && !["repo", "local", "global"].includes(requestedScope)) throw new Error("scope must be repo, local, or global");
  const projectMarked = await hasProjectMarker(cwd);
  const unmarkedDirectory = cwd !== home && !projectMarked;
  if (!options.home && cwd === home && (options.scope !== "global" || options.yes !== true)) {
    throw new Error("refusing setup in the home directory; run from a project or use --scope global --yes to confirm an all-projects install");
  }
  const scope = requestedScope ?? "repo";
  const detected = options.detected ?? await detect({ cwd, home });
  const choice = await prompt({ detected, agents: options.agents ?? [], scope: requestedScope, defaultScope: unmarkedDirectory ? "global" : scope, yes: Boolean(options.yes), inputStream: options.input, outputStream: options.output });
  const selectedScope = choice.scope ?? scope;
  const requested = choice.agents?.length ? choice.agents : detected.filter((item) => item.detected).map((item) => item.id);
  const selected = requested.map((id) => adapters[id]).filter(Boolean);
  const unknown = requested.filter((id) => !adapters[id]);
  if (unknown.length) throw new Error(`unknown agent adapter(s): ${unknown.join(", ")}`);
  const root = selectedScope === "global" ? home : cwd;
  const runtimeCommand = selectedScope === "global" ? `node ${JSON.stringify(join(home, ".grudge/bin/grudge.mjs"))}` : "node .grudge/bin/grudge.mjs";
  const plans = selected.map((item) => ({ adapter: item, plan: item.plan({ cwd, home, scope: selectedScope, runtimeCommand }) }));
  const unverified = plans.filter(({ plan }) => !plan.verified).map(({ adapter, plan }) => ({ id: adapter.id, docsUrl: adapter.docsUrl, snippet: plan.snippet ?? managedBlock() }));
  const runtimeSource = options.runtimeScript
    ? resolve(options.runtimeScript)
    : process.argv[1]?.endsWith("grudge.mjs")
      ? resolve(process.argv[1])
      : resolve(options.packageRoot ?? fileURLToPath(new URL("../..", import.meta.url)), "dist/grudge.mjs");
  const runtimeTarget = join(root, ".grudge/bin/grudge.mjs");
  const changes = [];
  const backupEntries = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const context = { cwd, home, root, timestamp, backupEntries, changes, dryRun: Boolean(options.dryRun), applyPlan: (plan) => applyPlan(plan, { root, backupEntries, changes, timestamp, dryRun: Boolean(options.dryRun) }), removePlan: () => ({}) };

  try {
    for (const item of plans) {
      if (!item.plan.verified) continue;
      await item.adapter.apply(context, item.plan);
    }
    const runtimeExists = await fileExists(runtimeSource);
    if (runtimeExists) await planRuntime(runtimeSource, runtimeTarget, context);
    await planGitignore(context);
    const config = await planConfig(root, runtimeTarget, selected.map((adapter) => adapter.id), context, runtimeExists, runtimeSource);
    if (!context.dryRun && runtimeExists) await smokeTest(runtimeTarget, root);
    const result = { scope: selectedScope, cwd, root, selected: selected.map((item) => item.id), unverified, detected, dryRun: Boolean(options.dryRun), changes, config, runtimeInstalled: runtimeExists, version: VERSION };
    if (!options.dryRun && backupEntries.length) await writeBackupManifest(root, timestamp, backupEntries);
    if (options.print !== false) printSetup(result);
    return result;
  } catch (error) {
    if (!context.dryRun && backupEntries.length) await restoreEntries(backupEntries);
    throw error;
  }
}

async function applyPlan(plan, context) {
  for (const file of plan.files ?? []) {
    if (file.kind === "pointer-if-existing" && !(await fileExists(file.path))) continue;
    const before = await readOptional(file.path);
    let after;
    if (file.kind === "claude-settings") {
      const parsed = parseJson(before ?? "{}", file.path);
      const hooks = Object.fromEntries((plan.hooks ?? []).map(({ event, command }) => [event, [{ matcher: "*", hooks: [{ type: "command", command }] }]]));
      const addition = { hooks, statusLine: { type: "command", command: plan.statusLine } };
      after = `${JSON.stringify(mergeObjects(parsed, addition), null, detectIndent(before))}\n`;
    } else {
      after = upsertManagedBlock(before ?? "", managedBlock());
    }
    await writeIfChanged(file.path, before, after, context, file.kind === "pointer-if-existing" ? "pointer" : "settings");
  }
  return { applied: true };
}

async function planRuntime(source, target, context) {
  const before = await readOptional(target);
  const after = await readFile(source);
  if (before && Buffer.compare(Buffer.from(before), after) === 0) return;
  await writeIfChanged(target, before, after, context, "runtime");
}

async function planGitignore(context) {
  const path = join(context.root, ".gitignore");
  const before = await readOptional(path);
  const lines = [".grudge/session/", ".grudge/stats.json", ".grudge/*.log"];
  const current = before ?? "";
  const missing = lines.filter((line) => !current.split(/\r?\n/).includes(line));
  if (!missing.length) return;
  const prefix = current && !current.endsWith("\n") ? `${current}\n` : current;
  await writeIfChanged(path, before, `${prefix}${missing.join("\n")}\n`, context, "gitignore");
}

async function planConfig(root, runtimeTarget, selected, context, runtimeInstalled, runtimeSource) {
  const path = join(root, ".grudge/config.json");
  const before = await readOptional(path);
  const old = before ? parseJson(before, path) : {};
  const hash = runtimeInstalled ? createHash("sha256").update(await readFile(context.dryRun ? runtimeSource : runtimeTarget)).digest("hex") : old.scriptHash ?? null;
  const after = `${JSON.stringify({ ...old, version: 1, packageVersion: VERSION, scriptHash: hash, adapters: [...new Set([...(old.adapters ?? []), ...selected])].sort(), mode: old.mode ?? "on", autoAccept: old.autoAccept ?? false, lastBackup: old.lastBackup ?? context.timestamp }, null, 2)}\n`;
  await writeIfChanged(path, before, after, context, "config");
  return JSON.parse(after);
}

async function writeIfChanged(path, before, after, context, kind) {
  const beforeText = Buffer.isBuffer(before) ? before.toString("utf8") : before;
  const afterText = Buffer.isBuffer(after) ? after.toString("utf8") : after;
  if (beforeText !== undefined && beforeText !== null && String(beforeText) === String(afterText)) return;
  context.changes.push({ path, kind, before: beforeText ?? "", after: afterText ?? "" });
  if (context.dryRun) return;
  const entry = await backup(context.root, path, { timestamp: context.timestamp });
  context.backupEntries.push(entry);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, after, Buffer.isBuffer(after) ? undefined : "utf8");
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function fileExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function detectIndent(text) {
  const match = String(text ?? "").match(/\n([ \t]+)\"/);
  return match ? match[1] : 2;
}

function printSetup(result) {
  for (const change of result.changes) process.stdout.write(`${result.dryRun ? "would change" : "changed"} ${change.path}\n`);
  for (const item of result.unverified) process.stdout.write(`unverified ${item.id}; no files written. Docs: ${item.docsUrl}\n${item.snippet}\n`);
  if (!result.runtimeInstalled) process.stdout.write("warning: dist/grudge.mjs was not found; build the package before using installed hooks.\n");
}

async function smokeTest(runtimePath, cwd) {
  const { spawn } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runtimePath, "hook", "session-start"], { cwd, windowsHide: true });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && !/Cannot find module/i.test(stderr)) return resolve();
      reject(new Error(`installed runtime smoke test failed${stderr ? `: ${stderr.trim()}` : ` with exit code ${code}`}`));
    });
    child.stdin.end(JSON.stringify({ session_id: "grudge-install-smoke", hook_event_name: "SessionStart", cwd }));
  });
}

async function hasProjectMarker(path) {
  for (const marker of [".git", ".hg", ".svn", "package.json", "pyproject.toml"]) {
    try { await stat(join(path, marker)); return true; } catch { /* continue */ }
  }
  return false;
}
