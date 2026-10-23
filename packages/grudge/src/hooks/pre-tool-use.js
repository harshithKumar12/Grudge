// OWNER: lane-a
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { readJson, writeJsonAtomic } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { normalize } from "../core/normalize.js";
import { check } from "../dsl/check.js";
import { read as readSession } from "../core/session.js";
import { appendEvent, claimHookEvent } from "../core/stats.js";

const MAX_REASON = 400;
const MAX_INPUT = 1024 * 1024;

function message(rule) {
  const english = String(rule.english || `Rule ${rule.id} matched`);
  return `${english} [scar ${rule.id}]. Do not retry; change approach or ask the user.`.slice(0, MAX_REASON);
}

async function incrementStats(root, field, scarId) {
  const path = join(root, ".grudge", "stats.json");
  const current = await readJson(path, {});
  const stats = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  stats[field] = Number.isFinite(stats[field]) ? stats[field] + 1 : 1;
  stats.perScar = stats.perScar && typeof stats.perScar === "object" ? stats.perScar : {};
  if (scarId) {
    const item = stats.perScar[scarId] && typeof stats.perScar[scarId] === "object" ? stats.perScar[scarId] : {};
    item[field] = Number.isFinite(item[field]) ? item[field] + 1 : 1;
    stats.perScar[scarId] = item;
  }
  await writeJsonAtomic(path, stats);
}

async function evaluate(payload) {
  const root = payload.cwd || process.cwd();
  const config = await loadConfig(root);
  if (process.env.GRUDGE_DISABLE === "1" || config.mode === "off") return { code: 0, stdout: "", stderr: "" };
  const input = JSON.stringify(payload);
  if (input.length > MAX_INPUT) return { code: 0, stdout: "", stderr: "grudge: oversized hook input; allowed (fail-open)\n" };
  const compiled = await readJson(join(root, ".grudge", "compiled.json"), null);
  if (!compiled || compiled.version !== 1 || !Array.isArray(compiled.rules)) return { code: 0, stdout: "", stderr: "" };
  if ((await claimHookEvent(root, "PreToolUse", payload)).duplicate) return { code: 0, stdout: "", stderr: "" };
  const current = normalize(payload);
  const prior = payload.session_id ? await readSession(join(root, ".grudge"), payload.session_id) : [];
  const events = [...prior, current];
  for (const rule of compiled.rules) {
    if (rule.mode !== "block" && rule.mode !== "warn") continue;
    const result = check(rule, events);
    if (!result.violated) continue;
    const reason = message(rule);
    if (rule.mode === "warn") {
      await appendEvent(root, { type: "catch", outcome: "warned", scarId: rule.id, sessionId: payload.session_id ?? payload.sessionId, injectedChars: `grudge warning: ${reason}\n`.length });
      await incrementStats(root, "warnings", rule.id);
      return { code: 0, stdout: "", stderr: `grudge warning: ${reason}\n`, warning: reason, scarId: rule.id };
    }
    await appendEvent(root, { type: "catch", outcome: "blocked", scarId: rule.id, sessionId: payload.session_id ?? payload.sessionId, injectedChars: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason }, blocked: true, reason, scarId: rule.id }).length + 1 });
    await incrementStats(root, "blocks", rule.id);
    const output = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason }, blocked: true, reason, scarId: rule.id };
    return { code: 0, stdout: `${JSON.stringify(output)}\n`, stderr: "", blocked: true, reason, scarId: rule.id };
  }
  return { code: 0, stdout: "", stderr: "" };
}

/** Run PreToolUse with a hard fail-open time budget. */
export async function preToolUse(payload = {}) {
  const started = performance.now();
  const root = payload.cwd || process.cwd();
  try {
    const config = await loadConfig(root);
    const budget = Number(config.hookBudgetMs) || 1500;
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ code: 0, stdout: "", stderr: "grudge: hook time budget exceeded; allowed (fail-open)\n" }), budget));
    return await Promise.race([evaluate(payload), timeout]);
  } catch (error) {
    return { code: 0, stdout: "", stderr: `grudge: guard unavailable; allowed (fail-open)\n`, error, elapsedMs: performance.now() - started };
  }
}
