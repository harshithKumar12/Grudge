// OWNER: lane-a
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { loadConfig, loadEffectiveConfig } from "../core/config.js";
import { normalize } from "../core/normalize.js";
import { loadRules } from "../core/rules.js";
import { check } from "../dsl/check.js";
import { readTail } from "../core/session.js";
import { appendEvent, claimHookEvent } from "../core/stats.js";

const MAX_REASON = 400;
const MAX_INPUT = 1024 * 1024;
// Accounting is best effort and bounded: a slow disk may drop a counter, but it
// can never delay or change an enforcement decision.
const ACCOUNTING_BUDGET_MS = 1000;

function allow(stderr = "") {
  return { code: 0, stdout: "", stderr };
}

function message(rule) {
  const english = String(rule.english || `Rule ${rule.id} matched`);
  return `${english} [scar ${rule.id}]. Do not retry; change approach or ask the user.`.slice(0, MAX_REASON);
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

/** Print every diagnostic, deduplicated, before whatever the verdict says. */
function report(result, warnings) {
  const unique = [...new Set((warnings ?? []).filter(Boolean))];
  if (!unique.length) return result;
  const prefix = unique.map((line) => (line.endsWith("\n") ? line : `${line}\n`)).join("");
  return { ...result, stderr: `${prefix}${result.stderr ?? ""}` };
}

async function effectiveConfig(roots, root, warnings) {
  if (roots) return loadEffectiveConfig(roots, warnings);
  // Direct library call (unit tests, embedders): the payload cwd is the root.
  const project = await loadConfig(root);
  const budget = Number(project.hookBudgetMs);
  return {
    project,
    global: null,
    projectActive: project.mode !== "off",
    globalActive: false,
    hookBudgetMs: Number.isFinite(budget) && budget > 0 ? budget : 1500,
  };
}

/**
 * Load the state the decision needs.
 *
 * These reads are bounded by fixed byte and event caps and are deliberately
 * NOT raced against the hook budget: a timeout must never be able to turn a
 * matching prohibition into an allow. `hookBudgetMs` is an observability
 * threshold reported on stderr; it does not gate the verdict.
 */
async function loadState(roots, root, config, payload, warnings) {
  const started = performance.now();
  const loaded = await loadRules(
    roots ?? { projectRoot: root, globalDir: null },
    { includeProject: config.projectActive, includeGlobal: config.globalActive },
  );
  const prior = payload.session_id ? await readTail(join(root, ".grudge"), payload.session_id) : [];
  warnings.push(...loaded.warnings);
  const elapsed = performance.now() - started;
  if (elapsed > config.hookBudgetMs) {
    warnings.push(`grudge: state load took ${Math.round(elapsed)}ms, over hookBudgetMs ${config.hookBudgetMs}; enforcement continued (fail-closed)`);
  }
  return { rules: loaded.rules, prior };
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
 * Enforce PreToolUse.
 *
 * - A matching `block` rule always exits 2: the rule check is never raced.
 * - State reads are bounded (compiled file size, session bytes and events), so
 *   runtime stays bounded without a timeout that could allow a match.
 * - Corrupt state, malformed input and internal errors allow the call and say
 *   so on stderr; a timeout can no longer be one of those paths.
 */
export async function preToolUse(payload = {}, options = {}) {
  const runStarted = performance.now();
  const roots = options.roots ?? null;
  const root = roots ? roots.projectRoot : (payload.cwd || process.cwd());
  const warnings = [];
  try {
    const config = await effectiveConfig(roots, root, warnings);
    if (process.env.GRUDGE_DISABLE === "1") return report(allow(), warnings);
    if (!config.projectActive && !config.globalActive) return report(allow(), warnings);
    if (JSON.stringify(payload).length > MAX_INPUT) {
      return report(allow(), [...warnings, "grudge: oversized hook input; allowed (fail-open)"]);
    }
    const state = await loadState(roots, root, config, payload, warnings);
    const hit = decide(state.rules, state.prior, payload);
    const result = decision(hit);
    if (state.rules.length) await settle(account(root, payload, hit), ACCOUNTING_BUDGET_MS);
    return report(result, warnings);
  } catch (error) {
    return { ...report(allow(), [...warnings, "grudge: guard unavailable; allowed (fail-open)"]), error, elapsedMs: performance.now() - runStarted };
  }
}
