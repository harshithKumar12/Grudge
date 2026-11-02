// OWNER: lane-a
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { loadEffectiveConfig } from "../core/config.js";
import { loadRules } from "../core/rules.js";
import { prune } from "../core/session.js";
import { appendEvent, claimHookEvent } from "../core/stats.js";

const MAX_LINE = 140;
const MAX_OUTPUT = 1200;

/** Inject compact scar reminders (global + project) and prune old session logs. */
export async function sessionStart(payload = {}, options = {}) {
  const started = performance.now();
  const roots = options.roots ?? null;
  const root = roots?.projectRoot ?? payload.cwd ?? process.cwd();
  const warnings = [];
  try {
    const effectiveRoots = roots ?? { projectRoot: root, globalDir: null };
    const config = await loadEffectiveConfig(effectiveRoots, warnings);
    if (process.env.GRUDGE_DISABLE === "1") return result("", warnings);
    if (!config.projectActive && !config.globalActive) return result("", warnings);
    await prune(join(root, ".grudge"));
    const loaded = await loadRules(effectiveRoots, { includeProject: config.projectActive, includeGlobal: config.globalActive });
    warnings.push(...loaded.warnings);
    if (!loaded.rules.length) return result("", warnings);
    if ((await claimHookEvent(root, "SessionStart", payload)).duplicate) return result("", warnings);
    const lines = [];
    let total = 0;
    for (const rule of loaded.rules) {
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
    return result(stdout, warnings, { elapsedMs: performance.now() - started });
  } catch (error) {
    return result("", [...warnings, "grudge: session start unavailable; continuing (fail-open)"], { error, elapsedMs: performance.now() - started });
  }
}

function result(stdout, warnings, extra = {}) {
  const unique = [...new Set((warnings ?? []).filter(Boolean))];
  const stderr = unique.map((line) => (line.endsWith("\n") ? line : `${line}\n`)).join("");
  return { code: 0, stdout, stderr, ...extra };
}
