// OWNER: lane-a
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { readJson } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { prune } from "../core/session.js";
import { appendEvent, claimHookEvent } from "../core/stats.js";

const MAX_LINE = 140;
const MAX_OUTPUT = 1200;

/** Inject compact repo-local scar reminders and prune old session logs. */
export async function sessionStart(payload = {}) {
  const started = performance.now();
  const root = payload.cwd || process.cwd();
  try {
    const config = await loadConfig(root);
    if (process.env.GRUDGE_DISABLE === "1" || config.mode === "off") return { code: 0, stdout: "", stderr: "" };
    await prune(join(root, ".grudge"));
    const compiled = await readJson(join(root, ".grudge", "compiled.json"), null);
    if (!compiled || !Array.isArray(compiled.rules)) return { code: 0, stdout: "", stderr: "" };
    if ((await claimHookEvent(root, "SessionStart", payload)).duplicate) return { code: 0, stdout: "", stderr: "" };
    const lines = [];
    let total = 0;
    for (const rule of compiled.rules) {
      if (rule.mode === "off" || rule.mode === "pending") continue;
      const line = `Grudge scar ${rule.id}: ${String(rule.english || "guard active")}`.slice(0, MAX_LINE);
      if (total + line.length + (lines.length ? 1 : 0) > MAX_OUTPUT || lines.length >= 8) break;
      lines.push(line);
      total += line.length + (lines.length > 1 ? 1 : 0);
    }
    const stdout = lines.length ? `${lines.join("\n")}\n` : "";
    if (stdout) {
      try { await appendEvent(root, { type: "injection", sessionId: payload.session_id ?? payload.sessionId, injectedChars: stdout.length }); } catch { /* reporting is advisory */ }
    }
    return { code: 0, stdout, stderr: "", elapsedMs: performance.now() - started };
  } catch (error) {
    return { code: 0, stdout: "", stderr: "grudge: session start unavailable; continuing (fail-open)\n", error, elapsedMs: performance.now() - started };
  }
}
