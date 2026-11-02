// OWNER: lane-a
import { appendEvent, claimHookEvent, formatEstimatedTokens, readEvents, reportSinceLast } from "../core/stats.js";
import { loadEffectiveConfig } from "../core/config.js";

/**
 * Persist stop bookkeeping and report only newly caught mistakes.
 *
 * Stop counters live in the append-only `stats.jsonl` event log like every
 * other counter. The legacy `stats.json` file is only read by the stats
 * aggregation for old installs; Stop must not keep writing it.
 */
export async function stop(payload = {}, options = {}) {
  try {
    const roots = options.roots ?? null;
    const root = roots?.projectRoot ?? options.root ?? payload.cwd ?? process.cwd();
    if (process.env.GRUDGE_DISABLE === "1") return { code: 0, stdout: "", stderr: "" };
    const config = await loadEffectiveConfig(roots ?? { projectRoot: root, globalDir: null }, []);
    if (!config.projectActive && !config.globalActive) return { code: 0, stdout: "", stderr: "" };
    const priorEvents = await readEvents(root);
    // The cursor tracks reportable savings events only. Including Stop's own
    // event would change the dedupe key on the second delivery and append the
    // stop marker again, defeating the duplicate guard.
    const stopCursor = priorEvents
      .filter((event) => ["catch", "proposal", "accepted"].includes(String(event.type ?? "")))
      .reduce((max, event) => Math.max(max, Number(event.seq) || 0), 0);
    if ((await claimHookEvent(root, "Stop", { ...payload, __grudge_stop_cursor: stopCursor })).duplicate) return { code: 0, stdout: "", stderr: "" };
    const sessionId = payload.session_id ?? payload.sessionId ?? null;
    await appendEvent(root, { type: "stop", sessionId, at: new Date().toISOString() });
    const fresh = await reportSinceLast(root, sessionId, config.project.avoidedRetryTokens ?? config.global?.avoidedRetryTokens ?? 1500);
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
