// OWNER: lane-b
/** Capture one redacted, bounded canonical event after a tool call. */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { normalize } from "../core/normalize.js";
import { redactValue } from "../core/redact.js";
import { append } from "../core/session.js";
import { claimHookEvent } from "../core/stats.js";

const MAX_RESULT_BYTES = 4 * 1024;
// Arguments are persisted for replay, not for storage: a Write carries the
// whole file body. Cap every string value so one large call cannot grow the
// session log without bound (or hand megabytes to the redactor).
const MAX_ARG_BYTES = 4 * 1024;
const MAX_ARG_ITEMS = 50;

function truncateUtf8(text, maxBytes) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;
  return bytes.subarray(0, maxBytes).toString("utf8");
}

/** Bound every string and collection inside a value. */
export function boundValue(value, maxBytes = MAX_ARG_BYTES) {
  if (typeof value === "string") return truncateUtf8(value, maxBytes);
  if (Array.isArray(value)) return value.slice(0, MAX_ARG_ITEMS).map((item) => boundValue(item, maxBytes));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, MAX_ARG_ITEMS).map(([key, item]) => [key, boundValue(item, maxBytes)]),
    );
  }
  return value;
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
    const args = boundValue(redactValue(canonical.args));
    const redactedResult = redactValue(canonical.result ?? "");
    const boundedResult = truncateUtf8(resultText(redactedResult), MAX_RESULT_BYTES);
    const resultHash = createHash("sha256").update(boundedResult, "utf8").digest("hex");
    const event = {
      tool: canonical.tool,
      ...(canonical.tools ? { tools: canonical.tools } : {}),
      args,
      result: boundedResult,
      resultHash,
      byteSize: Buffer.byteLength(boundedResult, "utf8"),
      timestamp: (options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())).toISOString(),
    };
    const root = options.roots?.projectRoot ?? options.root ?? payload.cwd ?? process.cwd();
    if ((await claimHookEvent(root, "PostToolUse", payload)).duplicate) return { ok: true, duplicate: true, event };
    await append(join(root, ".grudge"), sessionId, event);
    return { ok: true, event };
  } catch {
    // Capture is advisory. A broken guard must never break the host session.
    return { ok: false, warning: "grudge: post-tool-use skipped (internal error)" };
  }
}

export { MAX_RESULT_BYTES, truncateUtf8 };
