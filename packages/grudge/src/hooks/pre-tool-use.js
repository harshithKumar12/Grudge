// OWNER: lane-a
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { readJson } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { normalize } from "../core/normalize.js";
import { check } from "../dsl/check.js";
import { read as readSession } from "../core/session.js";
import { appendEvent, claimHookEvent } from "../core/stats.js";

const MAX_REASON = 400;
const MAX_INPUT = 1024 * 1024;
// Accounting is best effort and bounded: a slow disk may drop a counter, but it
// can never delay or change an enforcement decision.
const ACCOUNTING_BUDGET_MS = 1000;
const TIMEOUT = Symbol("budget-timeout");

function allow(stderr = "") {
  return { code: 0, stdout: "", stderr };
}

function message(rule) {
  const english = String(rule.english || `Rule ${rule.id} matched`);
  return `${english} [scar ${rule.id}]. Do not retry; change approach or ask the user.`.slice(0, MAX_REASON);
}

/**
 * Race one I/O step against the hook budget.
 *
 * The timer is `unref()`ed and cleared on the winning path, so a settled hook
 * never keeps the process alive for the remainder of the budget.
 */
function withBudget(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Resolve when `promise` settles or `ms` elapses, whichever happens first. */
async function settle(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  try {
    await Promise.race([promise.catch(() => {}), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Read the state the decision needs. This is the only part under the budget. */
async function loadState(root, payload) {
  const compiled = await readJson(join(root, ".grudge", "compiled.json"), null);
  if (!compiled || compiled.version !== 1 || !Array.isArray(compiled.rules)) return { rules: [], prior: [] };
  const prior = payload.session_id ? await readSession(join(root, ".grudge"), payload.session_id) : [];
  return { rules: compiled.rules, prior };
}

/**
 * Evaluate every block/warn rule against the session history plus this call.
 *
 * Pure CPU over already-loaded state: it is never raced against the budget, so
 * once the rules are in memory the decision is authoritative.
 */
function decide(rules, prior, payload) {
  if (!rules.length) return null;
  const events = [...prior, normalize(payload)];
  for (const rule of rules) {
    if (rule.mode !== "block" && rule.mode !== "warn") continue;
    const result = check(rule, events);
    if (result.violated) return { rule, result };
  }
  return null;
}

function decision(hit) {
  if (!hit) return allow();
  const reason = message(hit.rule);
  if (hit.rule.mode === "warn") {
    return { code: 0, stdout: "", stderr: `grudge warning: ${reason}\n`, warning: reason, scarId: hit.rule.id };
  }
  const output = {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    blocked: true,
    reason,
    scarId: hit.rule.id,
  };
  // Exit 2 blocks even when the host cannot parse the JSON; the JSON still
  // supplies the reason, which the hooks reference prefers over stderr.
  return { code: 2, stdout: `${JSON.stringify(output)}\n`, stderr: `grudge: blocked by ${hit.rule.id}: ${reason}\n`, blocked: true, reason, scarId: hit.rule.id };
}

/**
 * Record the decision. Runs after the verdict is final and cannot change it.
 * `claimHookEvent` dedupes counters only; it is deliberately not consulted
 * before the rule check, because a repeated delivery must stay blocked.
 */
async function account(root, payload, hit) {
  const claim = await claimHookEvent(root, "PreToolUse", payload);
  if (claim.duplicate || !hit) return;
  const sessionId = payload.session_id ?? payload.sessionId;
  const reason = message(hit.rule);
  // The catch carries the claim's key with a suffix, so two racing processes
  // that both miss the tail check still collapse to one counter at read time.
  const dedupeKey = claim.dedupeKey ? `${claim.dedupeKey}:catch` : undefined;
  if (hit.rule.mode === "warn") {
    await appendEvent(root, { type: "catch", outcome: "warned", scarId: hit.rule.id, sessionId, dedupeKey, injectedChars: `grudge warning: ${reason}\n`.length });
    return;
  }
  const serialized = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason }, blocked: true, reason, scarId: hit.rule.id });
  await appendEvent(root, { type: "catch", outcome: "blocked", scarId: hit.rule.id, sessionId, dedupeKey, injectedChars: serialized.length + 1 });
}

/**
 * Enforce PreToolUse with a bounded, documented fail-open policy.
 *
 * - A matching `block` rule exits 2 before any accounting work starts.
 * - The budget covers state loading only; the rule check itself always runs.
 * - Timeout, corrupt state, malformed input, and internal errors allow the call
 *   and say so on stderr. None of them can turn a known match into an allow.
 */
export async function preToolUse(payload = {}) {
  const started = performance.now();
  const root = payload.cwd || process.cwd();
  try {
    const config = await loadConfig(root);
    if (process.env.GRUDGE_DISABLE === "1" || config.mode === "off") return allow();
    if (JSON.stringify(payload).length > MAX_INPUT) {
      return allow("grudge: oversized hook input; allowed (fail-open)\n");
    }
    const budget = Number(config.hookBudgetMs) || 1500;
    const state = await withBudget(loadState(root, payload), budget);
    if (state === TIMEOUT) {
      return allow("grudge: hook time budget exceeded; allowed (fail-open)\n");
    }
    const hit = decide(state.rules, state.prior, payload);
    const result = decision(hit);
    if (state.rules.length) await settle(account(root, payload, hit), ACCOUNTING_BUDGET_MS);
    return result;
  } catch (error) {
    return { ...allow("grudge: guard unavailable; allowed (fail-open)\n"), error, elapsedMs: performance.now() - started };
  }
}
