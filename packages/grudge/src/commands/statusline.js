// OWNER: lane-a
import { join } from "node:path";
import { readJson } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { estimatedTokensSaved, formatEstimatedTokens, readStats } from "../core/stats.js";

/** Return the compact Claude Code status line; no output is produced when off. */
export async function statusline(options = {}) {
  const root = options.cwd || process.cwd();
  const config = await loadConfig(root);
  if (process.env.GRUDGE_DISABLE === "1" || config.mode === "off") return "";
  const [counters, compiled] = await Promise.all([
    readStats(root),
    readJson(join(root, ".grudge", "compiled.json"), null),
  ]);
  const scars = Array.isArray(compiled?.rules) ? compiled.rules.filter((rule) => rule.mode !== "off").length : counters.acceptedScars;
  const line = `grudge: ${scars} scars, ${counters.blocks} blocked, ~${formatEstimatedTokens(estimatedTokensSaved(counters.blocks, config.avoidedRetryTokens))} tokens saved (est.)`;
  if (options.print !== false) process.stdout.write(`${line}\n`);
  return line;
}
