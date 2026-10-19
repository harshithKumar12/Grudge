// OWNER: lane-a
import { loadConfig } from "../core/config.js";

const MAX_NUDGE = 200;

function correction(prompt, patterns) {
  const text = String(prompt || "");
  const lower = text.toLowerCase();
  return patterns.some((pattern) => {
    const value = String(pattern).toLowerCase().trim();
    if (!value) return false;
    if (value === "never") return /\bnever\s+(?:call|run|send|write|read|do|use|repeat|retry)\b/i.test(text);
    return lower.includes(value);
  });
}

/** Add one short proposal nudge only when the user is correcting behavior. */
export async function userPromptSubmit(payload = {}) {
  try {
    const config = await loadConfig(payload.cwd || process.cwd());
    if (process.env.GRUDGE_DISABLE === "1" || config.mode === "off") return { code: 0, stdout: "", stderr: "" };
    if (!correction(payload.prompt, Array.isArray(config.correctionPatterns) ? config.correctionPatterns : [])) return { code: 0, stdout: "", stderr: "" };
    const nudge = "If this is a repeatable mistake, record it once: node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'";
    return { code: 0, stdout: `${nudge.slice(0, MAX_NUDGE)}\n`, stderr: "", nudge: nudge.slice(0, MAX_NUDGE) };
  } catch (error) {
    return { code: 0, stdout: "", stderr: "grudge: prompt hook unavailable; continuing (fail-open)\n", error };
  }
}
