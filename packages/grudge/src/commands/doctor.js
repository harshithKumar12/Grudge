// OWNER: lane-c
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { grudgeHookEvents, isGrudgeStatusLine, parseJson } from "../installer/json-merge.js";
import { missingStatusLineScripts } from "../installer/statusline-paths.js";
import { hasManagedBlock, managedBlock } from "../installer/managed-block.js";
import { measureOutputs as measureBudgetOutputs } from "../core/budget.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FALLBACK_CAPS = Object.freeze({ sessionStartChars: 1200, blockReasonChars: 400, promptNudgeChars: 200, agentsBlockChars: 1000, agentsBlockLines: 12 });
const PROMPT_NUDGE = "If this is a repeatable mistake, record it once: node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'";
const EXPECTED_HOOKS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];

/** Inspect an installed repository without changing it. */
export async function doctor(options = {}) {
  const root = resolve(options.cwd ?? process.cwd());
  const home = resolve(options.home ?? homedir());
  const localConfig = await readJson(join(root, ".grudge/config.json"));
  const config = localConfig ?? (root === home ? null : await readJson(join(home, ".grudge/config.json")));
  const installRoot = localConfig || root === home ? root : home;
  const configPath = join(installRoot, ".grudge/config.json");
  const runtimePath = join(installRoot, ".grudge/bin/grudge.mjs");
  const checks = [];
  checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 18, detail: process.version });
  checks.push({ name: "install scope", ok: true, detail: installRoot === root ? "project" : `user (${join(home, ".grudge")})` });
  checks.push({ name: "config", ok: Boolean(config), detail: config ? `parse OK (${configPath})` : "missing or invalid" });
  const runtime = await readOptional(runtimePath);
  checks.push({ name: "runtime", ok: Boolean(runtime), detail: runtime ? "present" : "missing" });
  if (runtime) {
    try {
      await execFileAsync(process.execPath, [runtimePath, "statusline"], { cwd: root, windowsHide: true, timeout: 5000 });
      checks.push({ name: "runtime load", ok: true, detail: "installed script loaded" });
    } catch (error) {
      const detail = String(error?.stderr || error?.message || error).trim().replace(/\s+/g, " ");
      checks.push({ name: "runtime load", ok: false, detail: `load failed: ${detail}. This is the Node runtime; Python engine commands are separate.` });
    }
  } else checks.push({ name: "runtime load", ok: false, detail: "not checked; runtime missing" });
  if (config?.scriptHash && runtime) {
    const hash = createHash("sha256").update(runtime).digest("hex");
    checks.push({ name: "script hash", ok: hash === config.scriptHash, detail: `${hash.slice(0, 12)} vs ${String(config.scriptHash).slice(0, 12)}` });
  } else checks.push({ name: "script hash", ok: false, detail: "not recorded" });
  let hooksPresent = false;
  let projectHookCount = 0;
  let userHookCount = 0;
  let projectEvents = new Set();
  let userEvents = new Set();
  let sameScopeDuplicates = false;
  let grudgeStatusLine = false;
  const statusLineConflicts = [];
  const statusLineMissing = [];
  const settingsPaths = [
    { path: join(root, ".claude/settings.json"), scope: "project" },
    { path: join(root, ".claude/settings.local.json"), scope: "project" },
    { path: join(home, ".claude/settings.json"), scope: "user" },
  ].filter(({ path }, index, entries) => entries.findIndex((entry) => entry.path === path) === index);
  for (const { path, scope } of settingsPaths) {
    const text = await readOptional(path);
    if (!text) continue;
    try {
      const settings = parseJson(text, path);
      const count = countGrudgeHooks(settings.hooks);
      const events = grudgeHookEvents(settings);
      hooksPresent ||= count > 0;
      if (scope === "user") {
        userHookCount += count;
        projectOrUserEvents(userEvents, events);
      } else {
        projectHookCount += count;
        projectOrUserEvents(projectEvents, events);
      }
      if (count > events.size) sameScopeDuplicates = true;
      if (settings.statusLine) {
        if (isGrudgeStatusLine(settings.statusLine)) grudgeStatusLine = true;
        else {
          statusLineConflicts.push(path);
          const missing = await missingStatusLineScripts(settings.statusLine.command, { cwd: root, home });
          if (missing.length) statusLineMissing.push({ path, missing });
        }
      }
      checks.push({ name: `settings ${path}`, ok: true, detail: "parse OK" });
    } catch (error) { checks.push({ name: `settings ${path}`, ok: false, detail: error.message }); }
  }
  checks.push({ name: "hooks", ok: hooksPresent || !(config?.adapters ?? []).includes("claude-code"), detail: hooksPresent ? "present" : "not configured" });
  const warnings = [];
  if (userHookCount > 0 && projectHookCount > 0) {
    warnings.push("Grudge hooks are installed at both user and project scope; duplicate invocations are deduplicated by session and event.");
    checks.push({ name: "hook scopes", ok: true, warning: true, detail: warnings[0] });
  } else checks.push({ name: "hook scopes", ok: true, detail: "no duplicate user/project Grudge hook scopes detected" });
  if (sameScopeDuplicates) {
    warnings.push("duplicate Grudge hook entries exist in one settings file; rerun setup to make the file idempotent, then uninstall only if you intend to remove Grudge.");
    checks.push({ name: "same-scope hooks", ok: true, warning: true, detail: warnings.at(-1) });
  } else checks.push({ name: "same-scope hooks", ok: true, detail: "no duplicate Grudge hook entries detected" });
  if ((config?.adapters ?? []).includes("claude-code")) {
    const events = new Set([...projectEvents, ...userEvents]);
    const missing = EXPECTED_HOOKS.filter((event) => !events.has(event));
    checks.push({ name: "hook completeness", ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}; run grudge setup --agents claude-code` : "all expected Claude Code events are registered" });
    if (projectEvents.size && !hasManagedBlock(await readOptional(join(root, "CLAUDE.md")))) {
      warnings.push("project hooks are installed but the managed block is missing from CLAUDE.md; run grudge setup --scope repo --agents claude-code");
      checks.push({ name: "project instructions", ok: true, warning: true, detail: warnings.at(-1) });
    }
    if (userEvents.size && !hasManagedBlock(await readOptional(join(home, ".claude/CLAUDE.md")))) {
      warnings.push("user hooks are installed but the managed block is missing from ~/.claude/CLAUDE.md; run grudge setup --scope global --agents claude-code --yes");
      checks.push({ name: "user instructions", ok: true, warning: true, detail: warnings.at(-1) });
    }
    if (statusLineConflicts.length) {
      warnings.push(`existing status line preserved in ${statusLineConflicts.join(", ")}; Grudge statusline was not installed there`);
      checks.push({ name: "status line", ok: true, warning: true, detail: warnings.at(-1) });
    } else checks.push({ name: "status line", ok: grudgeStatusLine, detail: grudgeStatusLine ? "Grudge statusline registered" : "not registered; run setup or choose a compatible status-line owner" });
    for (const { path, missing } of statusLineMissing) {
      const detail = `${path} runs ${missing.join(", ")}, which does not exist, so Claude Code shows no status line. Point the command at an absolute path or run grudge statusline; Grudge never rewrites an existing status line.`;
      warnings.push(detail);
      checks.push({ name: "status line target", ok: true, warning: true, detail });
    }
  }
  const compiled = await readJson(join(root, ".grudge/compiled.json"));
  checks.push({ name: "compiled.json", ok: compiled === null || (compiled.version === 1 && Array.isArray(compiled.rules)), detail: compiled === null ? "not present" : "valid" });
  const gitignore = await readOptional(join(root, ".gitignore"));
  const projectState = await exists(join(root, ".grudge"));
  if (projectState) {
    const ignored = [".grudge/session/", ".grudge/stats.json", ".grudge/*.log"].filter((line) => gitignore?.split(/\r?\n/).includes(line));
    checks.push({ name: ".gitignore", ok: ignored.length === 3, detail: `${ignored.length}/3 entries` });
  } else checks.push({ name: ".gitignore", ok: true, detail: "no project .grudge state; nothing to ignore" });
  const budgetMeasurements = await measureBudgets({ root, compiled, measureOutputs: options.measureOutputs });
  for (const measurement of budgetMeasurements) {
    const lineStatus = measurement.withinLineCap === undefined || measurement.withinLineCap;
    const ok = measurement.withinCap && lineStatus;
    const lineDetail = measurement.lines === undefined ? "" : `, ${measurement.lines}/${measurement.lineCap} lines`;
    checks.push({ name: `budget ${measurement.name}`, ok, detail: `${measurement.chars}/${measurement.cap} chars${lineDetail}`, measurement });
  }
  const result = { ok: checks.every((check) => check.ok), root, checks, budgetMeasurements, warnings };
  if (options.print !== false) for (const check of checks) process.stdout.write(`${check.warning ? "⚠" : check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}\n`);
  return result;
}

async function measureBudgets({ root, compiled, measureOutputs }) {
  const outputs = buildOutputs(root, compiled);
  const measure = measureOutputs ?? measureBudgetOutputs;
  return measure(outputs);
}

function buildOutputs(root, compiled) {
  const rules = Array.isArray(compiled?.rules) ? compiled.rules.filter((rule) => rule.mode !== "off" && rule.mode !== "pending") : [];
  const sessionStart = rules.slice(0, 8).map((rule) => `Grudge scar ${rule.id}: ${String(rule.english || "guard active")}`.slice(0, 140)).join("\n");
  const first = rules[0];
  const blockReason = first ? `${String(first.english || `Rule ${first.id} matched`)} [scar ${first.id}]. Do not retry; change approach or ask the user.` : "";
  return { sessionStart: sessionStart ? `${sessionStart}\n` : "", blockReason, promptNudge: PROMPT_NUDGE, agentsBlock: managedBlock(), root };
}

function fallbackMeasureOutputs({ sessionStart = "", blockReason = "", promptNudge = "", agentsBlock = "" }) {
  return [
    measureFallback("SessionStart injection", sessionStart, FALLBACK_CAPS.sessionStartChars),
    measureFallback("Block reason", blockReason, FALLBACK_CAPS.blockReasonChars),
    measureFallback("Prompt nudge", promptNudge, FALLBACK_CAPS.promptNudgeChars),
    measureFallback("instruction block", agentsBlock, FALLBACK_CAPS.agentsBlockChars, { lines: String(agentsBlock).split(/\r?\n/).length, lineCap: FALLBACK_CAPS.agentsBlockLines, withinLineCap: String(agentsBlock).split(/\r?\n/).length <= FALLBACK_CAPS.agentsBlockLines }),
  ];
}

function measureFallback(name, value, cap, extra = {}) {
  const chars = String(value ?? "").length;
  return { name, chars, cap, withinCap: chars <= cap, ...extra };
}

async function readJson(path) {
  const text = await readOptional(path);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function countGrudgeHooks(value) {
  let count = 0;
  const visit = (item) => {
    if (typeof item === "string") {
      if (/grudge(?:\.mjs)?[^\n]*\s+hook\s+(?:SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop)\b/i.test(item)) count += 1;
      return;
    }
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (item && typeof item === "object") for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return count;
}

function projectOrUserEvents(target, events) {
  for (const event of events) target.add(event);
}
