// OWNER: lane-c
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseJson } from "../installer/json-merge.js";
import { managedBlock } from "../installer/managed-block.js";
import { measureOutputs as measureBudgetOutputs } from "../core/budget.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FALLBACK_CAPS = Object.freeze({ sessionStartChars: 1200, blockReasonChars: 400, promptNudgeChars: 200, agentsBlockChars: 1000, agentsBlockLines: 12 });
const PROMPT_NUDGE = "If this is a repeatable mistake, record it once: node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'";

/** Inspect an installed repository without changing it. */
export async function doctor(options = {}) {
  const root = resolve(options.cwd ?? process.cwd());
  const configPath = join(root, ".grudge/config.json");
  const runtimePath = join(root, ".grudge/bin/grudge.mjs");
  const config = await readJson(configPath);
  const checks = [];
  checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 18, detail: process.version });
  checks.push({ name: "config", ok: Boolean(config), detail: config ? "parse OK" : "missing or invalid" });
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
  for (const path of [join(root, ".claude/settings.json"), join(root, ".claude/settings.local.json")]) {
    const text = await readOptional(path);
    if (!text) continue;
    try {
      const settings = parseJson(text, path);
      hooksPresent ||= Boolean(settings.hooks);
      checks.push({ name: `settings ${path}`, ok: true, detail: "parse OK" });
    } catch (error) { checks.push({ name: `settings ${path}`, ok: false, detail: error.message }); }
  }
  checks.push({ name: "hooks", ok: hooksPresent || !(config?.adapters ?? []).includes("claude-code"), detail: hooksPresent ? "present" : "not configured" });
  const compiled = await readJson(join(root, ".grudge/compiled.json"));
  checks.push({ name: "compiled.json", ok: compiled === null || (compiled.version === 1 && Array.isArray(compiled.rules)), detail: compiled === null ? "not present" : "valid" });
  const gitignore = await readOptional(join(root, ".gitignore"));
  const ignored = [".grudge/session/", ".grudge/stats.json", ".grudge/*.log"].filter((line) => gitignore?.split(/\r?\n/).includes(line));
  checks.push({ name: ".gitignore", ok: ignored.length === 3, detail: `${ignored.length}/3 entries` });
  const budgetMeasurements = await measureBudgets({ root, compiled, measureOutputs: options.measureOutputs });
  for (const measurement of budgetMeasurements) {
    const lineStatus = measurement.withinLineCap === undefined || measurement.withinLineCap;
    const ok = measurement.withinCap && lineStatus;
    const lineDetail = measurement.lines === undefined ? "" : `, ${measurement.lines}/${measurement.lineCap} lines`;
    checks.push({ name: `budget ${measurement.name}`, ok, detail: `${measurement.chars}/${measurement.cap} chars${lineDetail}`, measurement });
  }
  const result = { ok: checks.every((check) => check.ok), root, checks, budgetMeasurements };
  if (options.print !== false) for (const check of checks) process.stdout.write(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}\n`);
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
    measureFallback("AGENTS.md block", agentsBlock, FALLBACK_CAPS.agentsBlockChars, { lines: String(agentsBlock).split(/\r?\n/).length, lineCap: FALLBACK_CAPS.agentsBlockLines, withinLineCap: String(agentsBlock).split(/\r?\n/).length <= FALLBACK_CAPS.agentsBlockLines }),
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
