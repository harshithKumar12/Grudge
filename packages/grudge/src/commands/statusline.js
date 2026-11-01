// OWNER: lane-a
import { join } from "node:path";
import { readJson } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { aggregate, estimatedTokensSaved, formatEstimatedTokens, readStats } from "../core/stats.js";

// Config is process-stable for a statusLine invocation. Avoid rereading it when
// Claude Code polls the line repeatedly; hooks and mutating commands still load
// config directly when they need current state.
const configCache = new Map();
const statsCache = new Map();
const compiledCache = new Map();
const STATS_CACHE_MS = 50;

async function statuslineConfig(root) {
  if (!configCache.has(root)) configCache.set(root, loadConfig(root));
  return configCache.get(root);
}

async function statuslineStats(root) {
  const cached = statsCache.get(root);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await readStats(root);
  statsCache.set(root, { value, expiresAt: now + STATS_CACHE_MS });
  return value;
}

async function statuslineScars(root, counters) {
  if (counters.accepted > 0) return counters.accepted;
  if (!compiledCache.has(root)) compiledCache.set(root, readJson(join(root, ".grudge", "compiled.json"), null));
  const compiled = await compiledCache.get(root);
  return Array.isArray(compiled?.rules) ? compiled.rules.filter((rule) => rule.mode !== "off").length : 0;
}

/** Return the compact Claude Code status line; no output is produced when off. */
export async function statusline(options = {}) {
  const root = options.cwd || process.cwd();
  const config = await statuslineConfig(root);
  if (process.env.GRUDGE_DISABLE === "1" || config.mode === "off") return "";
  const counters = await statuslineStats(root);
  const sessionId = typeof options.session === "string" ? options.session : typeof options.sessionId === "string" ? options.sessionId : null;
  const session = sessionId ? await aggregate(root, sessionId, config.avoidedRetryTokens) : null;
  const lifetime = await aggregate(root, null, config.avoidedRetryTokens);
  // acceptedScars is the durable legacy counter; the canonical count is the
  // append-only event log, with compiled.json as the pre-counter fallback.
  const scars = await statuslineScars(root, { accepted: lifetime.accepted || counters.acceptedScars });
  const line = session
    ? `grudge: ${scars} scars, ${session.blocked} blocked, ~${formatEstimatedTokens(session.avoidedRetryTokens)} tokens saved (est.) · session ${session.caught} caught/${session.warned} warned`
    : `grudge: ${scars} scars, ${lifetime.blocked} blocked, ~${formatEstimatedTokens(lifetime.avoidedRetryTokens || estimatedTokensSaved(lifetime.blocked, config.avoidedRetryTokens))} tokens saved (est.)`;
  if (options.print !== false) process.stdout.write(`${line}\n`);
  return line;
}
