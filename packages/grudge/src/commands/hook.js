// OWNER: lane-a
import { preToolUse } from "../hooks/pre-tool-use.js";
import { sessionStart } from "../hooks/session-start.js";
import { userPromptSubmit } from "../hooks/user-prompt-submit.js";
import { stop } from "../hooks/stop.js";
import { postToolUse } from "../hooks/post-tool-use.js";

const handlers = { "pre-tool-use": preToolUse, "session-start": sessionStart, "user-prompt-submit": userPromptSubmit, "post-tool-use": postToolUse, stop };
const aliases = { PreToolUse: "pre-tool-use", SessionStart: "session-start", UserPromptSubmit: "user-prompt-submit", PostToolUse: "post-tool-use", Stop: "stop" };

/** Dispatch one canonical hook event. The returned object is safe to print verbatim. */
export async function hook(event, payload = {}) {
  const key = aliases[event] || event;
  const handler = handlers[key];
  if (!handler) return { code: 0, stdout: "", stderr: `grudge: unknown hook '${event}'; allowed (fail-open)\n` };
  try { return await handler(payload); }
  catch { return { code: 0, stdout: "", stderr: "grudge: hook failed; allowed (fail-open)\n" }; }
}

/** Run a hook from stdin for command-line adapters. */
export async function runHook(event, input = "") {
  let payload = {};
  try {
    if (input.length > 1024 * 1024) return { code: 0, stdout: "", stderr: "grudge: oversized hook input; allowed (fail-open)\n" };
    payload = input.trim() ? JSON.parse(input) : {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("hook input must be an object");
  } catch {
    return { code: 0, stdout: "", stderr: "grudge: invalid hook input; allowed (fail-open)\n" };
  }
  return hook(event, payload);
}
