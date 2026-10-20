// OWNER: lane-b
/** Capture one redacted, bounded canonical event after a tool call. */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { normalize } from "../core/normalize.js";
import { redactValue } from "../core/redact.js";
import { append } from "../core/session.js";

const MAX_RESULT_BYTES = 4 * 1024;

function truncateUtf8(text, maxBytes) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;
  return bytes.subarray(0, maxBytes).toString("utf8");
}

function resultText(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * @param {object} payload host PostToolUse payload
 * @param {{root?: string, now?: Date|string}} [options]
 * @returns {Promise<{ok: boolean, event?: object, warning?: string}>}
 */
export async function postToolUse(payload = {}, options = {}) {
  try {
    const sessionId = payload.session_id ?? payload.sessionId;
    if (typeof sessionId !== "string" || !sessionId) {
      return { ok: false, warning: "grudge: post-tool-use skipped (missing session id)" };
    }
    const rawResult = payload.result
      ?? payload.tool_result
      ?? payload.tool_response
      ?? payload.output;
    const canonical = normalize({ ...payload, result: rawResult });
    const args = redactValue(canonical.args);
    const redactedResult = redactValue(canonical.result ?? "");
    const boundedResult = truncateUtf8(resultText(redactedResult), MAX_RESULT_BYTES);
    const resultHash = createHash("sha256").update(boundedResult, "utf8").digest("hex");
    const event = {
      tool: canonical.tool,
      args,
      result: boundedResult,
      resultHash,
      byteSize: Buffer.byteLength(boundedResult, "utf8"),
      timestamp: (options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())).toISOString(),
    };
    const root = options.root ?? payload.cwd ?? process.cwd();
    await append(join(root, ".grudge"), sessionId, event);
    return { ok: true, event };
  } catch {
    // Capture is advisory. A broken guard must never break the host session.
    return { ok: false, warning: "grudge: post-tool-use skipped (internal error)" };
  }
}

export { MAX_RESULT_BYTES, truncateUtf8 };
