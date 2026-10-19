// OWNER: lane-a
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "../core/store.js";

/** Persist stop bookkeeping without emitting hook output. */
export async function stop(payload = {}) {
  try {
    const root = payload.cwd || process.cwd();
    if (process.env.GRUDGE_DISABLE === "1") return { code: 0, stdout: "", stderr: "" };
    const path = join(root, ".grudge", "stats.json");
    const value = await readJson(path, {});
    const stats = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    stats.stops = Number.isFinite(stats.stops) ? stats.stops + 1 : 1;
    stats.lastStopAt = new Date().toISOString();
    await writeJsonAtomic(path, stats);
  } catch {
    // Stop is observational and must never affect the host agent.
  }
  return { code: 0, stdout: "", stderr: "" };
}
