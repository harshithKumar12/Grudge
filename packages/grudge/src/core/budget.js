// OWNER: lane-a

export const CAPS = Object.freeze({
  sessionStartChars: 1200,
  sessionStartScars: 8,
  sessionStartLineChars: 140,
  blockReasonChars: 400,
  promptNudgeChars: 200,
  agentsBlockChars: 1000,
  agentsBlockLines: 12,
});

/** Estimate tokens cheaply and deterministically; this is not a measurement. */
export function estimateTokens(value) {
  const chars = typeof value === "number" ? value : String(value ?? "").length;
  return Math.ceil(chars / 4);
}

/** Truncate from the end-independent prefix so repeated inputs produce identical output. */
export function truncate(value, cap) {
  const text = String(value ?? "");
  return text.length <= cap ? text : text.slice(0, cap);
}

/** Enforce the line and character caps for the managed AGENTS.md block. */
export function limitAgentsBlock(value) {
  const lines = String(value ?? "").split(/\r?\n/).slice(0, CAPS.agentsBlockLines);
  return truncate(lines.join("\n"), CAPS.agentsBlockChars);
}

/** Return doctor-ready measurements for one injected output. */
export function measure(name, value, cap, extra = {}) {
  const text = String(value ?? "");
  return {
    name,
    chars: text.length,
    bytes: Buffer.byteLength(text, "utf8"),
    estimatedTokens: estimateTokens(text),
    cap,
    withinCap: text.length <= cap,
    ...extra,
  };
}

/** Measure all textual budget surfaces without changing their contents. */
export function measureOutputs({ sessionStart = "", blockReason = "", promptNudge = "", agentsBlock = "" } = {}) {
  return [
    measure("SessionStart injection", sessionStart, CAPS.sessionStartChars),
    measure("Block reason", blockReason, CAPS.blockReasonChars),
    measure("Prompt nudge", promptNudge, CAPS.promptNudgeChars),
    measure("AGENTS.md block", agentsBlock, CAPS.agentsBlockChars, { lines: String(agentsBlock).split(/\r?\n/).length, lineCap: CAPS.agentsBlockLines, withinLineCap: String(agentsBlock).split(/\r?\n/).length <= CAPS.agentsBlockLines }),
  ];
}

export function budget() {
  return { caps: CAPS, estimateTokens, truncate, limitAgentsBlock, measure, measureOutputs };
}
