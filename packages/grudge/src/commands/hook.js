// OWNER: lane-a
import { preToolUse } from "../hooks/pre-tool-use.js";
import { sessionStart } from "../hooks/session-start.js";
import { userPromptSubmit } from "../hooks/user-prompt-submit.js";
import { stop } from "../hooks/stop.js";
import { postToolUse } from "../hooks/post-tool-use.js";
import { resolveRoots } from "../core/roots.js";

const handlers = { "pre-tool-use": preToolUse, "session-start": sessionStart, "user-prompt-submit": userPromptSubmit, "post-tool-use": postToolUse, stop };
const aliases = { PreToolUse: "pre-tool-use", SessionStart: "session-start", UserPromptSubmit: "user-prompt-submit", PostToolUse: "post-tool-use", Stop: "stop" };

/** Ensure a handler's fail-open warning is visible to command adapters. */
export function normalizeHookResult(result) {
  const value = result && typeof result === "object" ? result : {};
  if (value.ok === false && value.warning && !value.stderr) {
    return { ...value, code: 0, stderr: `${String(value.warning)}\n` };
  }
  return value;
}

function withWarnings(result, warnings) {
  const unique = [...new Set((warnings ?? []).filter(Boolean))];
  if (!unique.length) return result;
  const prefix = unique.map((line) => (line.endsWith("\n") ? line : `${line}\n`)).join("");
  return { ...result, stderr: `${prefix}${result.stderr ?? ""}` };
}

/**
 * Dispatch one canonical hook event.
 *
 * Roots are resolved once per invocation from the running runtime script, so a
 * hook cannot enforce against the process working directory or an unvalidated
 * payload path. Resolved warnings (for example a payload cwd outside the
 * install root) are always written to stderr; enforcement never stops silently.
 */
export async function hook(event, payload = {}, options = {}) {
  const key = aliases[event] || event;
  const handler = handlers[key];
  if (!handler) return { code: 0, stdout: "", stderr: `grudge: unknown hook '${event}'; allowed (fail-open)\n` };
  try {
    const roots = options.roots ?? await resolveRoots(payload, options.resolution ?? {});
    const result = withWarnings(normalizeHookResult(await handler(payload, { ...options, roots })), roots.warnings);
    return result;
  } catch {
    return { code: 0, stdout: "", stderr: "grudge: hook failed; allowed (fail-open)\n" };
  }
}

/**
 * Absolute ceiling on hook input. Below it the payload is evaluated in full;
 * above it the input cannot be parsed safely at all. Either way a PreToolUse
 * call is never silently allowed: an oversized call is denied with a reason,
 * because the offending invocation may be inside the part that was dropped.
 */
export const MAX_HOOK_INPUT = 16 * 1024 * 1024;

export async function runHook(event, input = "", options = {}) {
  const key = aliases[event] || event;
  const size = Buffer.byteLength(input, "utf8");
  if (size > MAX_HOOK_INPUT) {
    const reason = `grudge: hook input is ${size} bytes, over the ${MAX_HOOK_INPUT}-byte limit and cannot be evaluated; blocked (fail-closed)`;
    if (key === "pre-tool-use") {
      const output = {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
        blocked: true,
        reason,
      };
      return { code: 2, stdout: `${JSON.stringify(output)}\n`, stderr: `${reason}\n`, blocked: true, reason };
    }
    return { code: 0, stdout: "", stderr: `grudge: oversized hook input; allowed (fail-open)\n` };
  }
  let payload = {};
  try {
    payload = input.trim() ? JSON.parse(input) : {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("hook input must be an object");
  } catch {
    return { code: 0, stdout: "", stderr: "grudge: invalid hook input; allowed (fail-open)\n" };
  }
  return hook(event, payload, options);
}
