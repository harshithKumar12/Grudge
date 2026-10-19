// OWNER: lane-a
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "./store.js";

export const EMPTY_STATS = Object.freeze({ blocks: 0, warnings: 0, proposals: 0, acceptedScars: 0, perScar: {} });

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

/** Read counters safely; malformed or missing files become zeroed counters. */
export async function readStats(root = process.cwd()) {
  return clean(await readJson(statsPath(root), EMPTY_STATS));
}

/** Increment a global counter and optionally the matching scar counter. */
export async function record(root, field, scarId = null) {
  const current = await readStats(root);
  if (!["blocks", "warnings", "proposals", "acceptedScars"].includes(field)) throw new TypeError(`unknown stats field: ${field}`);
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
  return { EMPTY_STATS, readStats, record, estimatedTokensSaved, formatEstimatedTokens, statsPath };
}
