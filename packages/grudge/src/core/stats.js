// OWNER: lane-a
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "./store.js";

export const EMPTY_STATS = Object.freeze({ blocks: 0, warnings: 0, proposals: 0, acceptedScars: 0, perScar: {} });
const LOCK_RETRY_MS = 2;
const LOCK_TIMEOUT_MS = 30000;

function clean(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {
    blocks: Number.isFinite(source.blocks) && source.blocks >= 0 ? source.blocks : 0,
    warnings: Number.isFinite(source.warnings) && source.warnings >= 0 ? source.warnings : 0,
    proposals: Number.isFinite(source.proposals) && source.proposals >= 0 ? source.proposals : 0,
    acceptedScars: Number.isFinite(source.acceptedScars) && source.acceptedScars >= 0 ? source.acceptedScars : 0,
    perScar: source.perScar && typeof source.perScar === "object" && !Array.isArray(source.perScar) ? source.perScar : {},
  };
  for (const key of ["stops", "lastStopAt"]) if (source[key] !== undefined) result[key] = source[key];
  return result;
}

export function statsPath(root = process.cwd()) { return join(root, ".grudge", "stats.json"); }
export function statsLogPath(root = process.cwd()) { return join(root, ".grudge", "stats.jsonl"); }
export function reportStatePath(root = process.cwd()) { return join(root, ".grudge", "report-state.json"); }

async function withStatsLock(root, callback) {
  const lock = join(root, ".grudge", "stats.jsonl.lock");
  await mkdir(join(root, ".grudge"), { recursive: true });
  const started = Date.now();
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if (!["EEXIST", "EPERM", "EBUSY"].includes(error?.code) || Date.now() - started >= LOCK_TIMEOUT_MS) throw error;
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
  try { return await callback(); } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

function finite(value) { return Number.isFinite(value) && value >= 0 ? value : 0; }

function isAdvisory(event) {
  return event?.advisory === true || String(event?.tier ?? event?.agentTier ?? event?.adapterTier ?? event?.agentType ?? "").toLowerCase() === "advisory";
}

function eventSession(event) { return event?.sessionId ?? event?.session_id ?? null; }

/** Append one savings event without ever rewriting the event log. */
export async function appendEvent(root = process.cwd(), event = {}) {
  const value = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  if (isAdvisory(value)) return value;
  return withStatsLock(root, async () => {
    const existing = await readEvents(root);
    if (value.dedupeKey && existing.some((item) => item.dedupeKey === value.dedupeKey)) return { ...value, duplicate: true };
    const maxSeq = existing.reduce((max, item, index) => Math.max(max, Number.isFinite(item.seq) ? item.seq : index + 1), 0);
    value.seq = maxSeq + 1;
    await appendFile(statsLogPath(root), `${JSON.stringify(value)}\n`, "utf8");
    return { ...value, duplicate: false };
  });
}

/** Claim one host hook event so duplicate user/project registrations do not re-run accounting. */
export async function claimHookEvent(root = process.cwd(), eventName, payload = {}) {
  const sessionId = payload.session_id ?? payload.sessionId;
  if (typeof sessionId !== "string" || !sessionId) return { duplicate: false, dedupeKey: null };
  const dedupeKey = `${eventName}:${sessionId}:${createHash("sha256").update(stableJson(payload), "utf8").digest("hex")}`;
  const result = await appendEvent(root, { type: "hook", hookEvent: eventName, sessionId, dedupeKey });
  return { duplicate: result.duplicate === true, dedupeKey };
}

/** Read valid event objects while ignoring blank and corrupt JSONL lines. */
export async function readEvents(root = process.cwd()) {
  try {
    const text = await readFile(statsLogPath(root), "utf8");
    const events = [];
    let lineNumber = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        if (value && typeof value === "object" && !Array.isArray(value) && !isAdvisory(value)) events.push({ ...value, seq: Number.isFinite(value.seq) ? value.seq : lineNumber });
      } catch {
        // A partial or manually edited line must not lose the report.
      }
    }
    return events;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function emptyAggregate(sessionId = null) {
  return { sessionId, caught: 0, blocked: 0, warned: 0, proposals: 0, accepted: 0, injectedChars: 0, injectedTokens: 0, avoidedRetryTokens: 0, netSavingsTokens: 0, estimated: true };
}

/** Aggregate savings events for one session or the entire append-only log. */
export function aggregateEvents(events, sessionId = null, avoidedRetryTokens = 1500) {
  const result = emptyAggregate(sessionId);
  const avoided = Number.isFinite(avoidedRetryTokens) && avoidedRetryTokens >= 0 ? avoidedRetryTokens : 1500;
  for (const event of events) {
    if (sessionId !== null && eventSession(event) !== sessionId) continue;
    const type = String(event.type ?? event.kind ?? "");
    if (type === "catch" || type === "caught") {
      result.caught += 1;
      if (event.outcome === "warned" || event.outcome === "warning" || event.warned === true) result.warned += 1;
      else result.blocked += 1;
    } else if (type === "proposal" || type === "proposed") result.proposals += 1;
    else if (type === "accepted" || type === "accept") result.accepted += 1;
    result.injectedChars += finite(event.injectedChars ?? event.chars);
  }
  result.avoidedRetryTokens = result.blocked * avoided;
  result.injectedTokens = Math.ceil(result.injectedChars / 4);
  result.netSavingsTokens = result.avoidedRetryTokens - result.injectedTokens;
  return result;
}

async function legacyAggregate(root, sessionId, avoidedRetryTokens) {
  const legacy = await readStats(root);
  const result = emptyAggregate(sessionId);
  if (sessionId !== null) return result;
  result.caught = finite(legacy.blocks) + finite(legacy.warnings);
  result.blocked = finite(legacy.blocks);
  result.warned = finite(legacy.warnings);
  result.proposals = finite(legacy.proposals);
  result.accepted = finite(legacy.acceptedScars);
  const avoided = Number.isFinite(avoidedRetryTokens) && avoidedRetryTokens >= 0 ? avoidedRetryTokens : 1500;
  result.avoidedRetryTokens = result.blocked * avoided;
  result.injectedTokens = Math.ceil(result.injectedChars / 4);
  result.netSavingsTokens = result.avoidedRetryTokens;
  return result;
}

export async function aggregate(root = process.cwd(), sessionId = null, avoidedRetryTokens = 1500) {
  const events = await readEvents(root);
  return events.length ? aggregateEvents(events, sessionId, avoidedRetryTokens) : legacyAggregate(root, sessionId, avoidedRetryTokens);
}

/** Atomically consume catches since the previous Stop report for a session. */
export async function reportSinceLast(root = process.cwd(), sessionId = null, avoidedRetryTokens = 1500) {
  return withStatsLock(root, async () => {
    const events = await readEvents(root);
    const state = await readJson(reportStatePath(root), {});
    const key = sessionId ?? "__global__";
    const cursor = Number.isFinite(state?.[key]) ? state[key] : 0;
    const fresh = events.filter((event) => event.seq > cursor && (sessionId === null || eventSession(event) === sessionId));
    const maxSeq = events.reduce((max, event) => Math.max(max, event.seq), cursor);
    const nextState = state && typeof state === "object" && !Array.isArray(state) ? { ...state, [key]: maxSeq } : { [key]: maxSeq };
    await writeJsonAtomic(reportStatePath(root), nextState);
    return aggregateEvents(fresh, sessionId, avoidedRetryTokens);
  });
}

/** Read counters safely; malformed or missing files become zeroed counters. */
export async function readStats(root = process.cwd()) {
  return clean(await readJson(statsPath(root), EMPTY_STATS));
}

/** Increment a global counter and optionally the matching scar counter. */
export async function record(root, field, scarId = null) {
  if (!["blocks", "warnings", "proposals", "acceptedScars"].includes(field)) throw new TypeError(`unknown stats field: ${field}`);
  const outcome = field === "blocks" ? "blocked" : field === "warnings" ? "warned" : undefined;
  await appendEvent(root, { type: outcome ? "catch" : field === "acceptedScars" ? "accepted" : "proposal", outcome, scarId });
  // Keep the old JSON counter readable for Phase 20 consumers and older installs.
  const current = await readStats(root);
  current[field] += 1;
  if (scarId) {
    const item = current.perScar[scarId] && typeof current.perScar[scarId] === "object" ? current.perScar[scarId] : {};
    item[field] = Number.isFinite(item[field]) ? item[field] + 1 : 1;
    current.perScar[scarId] = item;
  }
  await writeJsonAtomic(statsPath(root), current);
  return current;
}

/** Compute the explicitly estimated savings figure used by stats and statusline. */
export function estimatedTokensSaved(value, avoidedRetryTokens = 1500) {
  const blocks = Number.isFinite(value) ? value : Number(value?.blocks) || 0;
  const avoided = Number.isFinite(avoidedRetryTokens) && avoidedRetryTokens >= 0 ? avoidedRetryTokens : 1500;
  return blocks * avoided;
}

export function formatEstimatedTokens(tokens) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(Math.round(tokens));
}

export function stats() {
  return { EMPTY_STATS, readStats, record, appendEvent, claimHookEvent, readEvents, aggregateEvents, aggregate, reportSinceLast, estimatedTokensSaved, formatEstimatedTokens, statsPath, statsLogPath, reportStatePath };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
