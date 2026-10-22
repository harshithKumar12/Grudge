// OWNER: lane-a
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { formatEstimatedTokens, reportSinceLast } from "../core/stats.js";

/** Persist stop bookkeeping and report only newly caught mistakes. */
export async function stop(payload = {}) {
  try {
    const root = payload.cwd || process.cwd();
    if (process.env.GRUDGE_DISABLE === "1") return { code: 0, stdout: "", stderr: "" };
    const config = await loadConfig(root);
    if (config.mode === "off") return { code: 0, stdout: "", stderr: "" };
    const path = join(root, ".grudge", "stats.json");
    const value = await readJson(path, {});
    const stats = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    stats.stops = Number.isFinite(stats.stops) ? stats.stops + 1 : 1;
    stats.lastStopAt = new Date().toISOString();
    await writeJsonAtomic(path, stats);
    const sessionId = payload.session_id ?? payload.sessionId ?? null;
    const fresh = await reportSinceLast(root, sessionId, config.avoidedRetryTokens);
    if (fresh.caught > 0) {
      const line = `Grudge: ${fresh.caught} mistake${fresh.caught === 1 ? "" : "s"} caught, ${fresh.blocked} blocked. ~${formatEstimatedTokens(fresh.avoidedRetryTokens)} tokens saved (est.), ~${formatEstimatedTokens(fresh.netSavingsTokens)} net of what Grudge injected (est.).`;
      return {
        code: 0,
        stdout: `${JSON.stringify({ systemMessage: line })}\n`,
        stderr: "",
        report: fresh,
      };
    }
  } catch {
    // Stop is observational and must never affect the host agent.
  }
  return { code: 0, stdout: "", stderr: "" };
}
