// OWNER: lane-a
import { join } from "node:path";
import { readJson } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { aggregate, estimatedTokensSaved, readStats } from "../core/stats.js";

/** Return and optionally print local Guard counters. */
export async function stats(options = {}) {
  const root = options.cwd || process.cwd();
  const config = await loadConfig(root);
  const counters = await readStats(root);
  const report = await aggregate(root, null, config.avoidedRetryTokens);
  const compiled = await readJson(join(root, ".grudge", "compiled.json"), null);
  const scars = Array.isArray(compiled?.rules) ? compiled.rules.filter((rule) => rule.mode !== "off").length : report.accepted;
  // `.grudge/stats.jsonl` is the canonical event log. The legacy
  // `.grudge/stats.json` counters stopped being written when accounting moved to
  // the append-only log, so they must never override the aggregate (a stale zero
  // made `grudge stats` print "Blocks: 0" while `grudge report` showed the real
  // count). `aggregate` already falls back to the legacy file when no events
  // exist, which keeps pre-0.2.1 installs readable.
  const result = {
    ...counters,
    blocks: report.blocked,
    warnings: report.warned,
    proposals: report.proposals,
    acceptedScars: report.accepted,
    caught: report.caught,
    blocked: report.blocked,
    warned: report.warned,
    accepted: report.accepted,
    stops: report.stops,
    lastStopAt: report.lastStopAt,
    injectedChars: report.injectedChars,
    injectedTokens: report.injectedTokens,
    netSavingsTokens: report.netSavingsTokens,
    scars,
    estimatedTokensSaved: report.avoidedRetryTokens || estimatedTokensSaved(report.blocked, config.avoidedRetryTokens),
    estimated: true,
  };
  if (options.json) {
    if (options.print !== false) process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (options.print !== false) {
    process.stdout.write(`blocks: ${result.blocks}\nwarnings: ${result.warnings}\nproposals: ${result.proposals}\naccepted scars: ${result.acceptedScars}\nscars: ${result.scars}\nestimated tokens saved: ${result.estimatedTokensSaved} (est.)\n`);
  }
  return result;
}
