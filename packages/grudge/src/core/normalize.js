// OWNER: lane-a

const names = {
  Read: "read_file", Write: "write_file", Edit: "write_file", MultiEdit: "write_file",
  Bash: "shell", WebFetch: "http", WebSearch: "http",
};

/** Convert a host hook payload into the canonical runtime event shape. */
export function normalize(event = {}) {
  const rawTool = event.tool ?? event.tool_name ?? event.name ?? event.function?.name ?? event.input?.tool;
  const toolName = String(rawTool ?? "other");
  let tool;
  if (toolName.startsWith("mcp__")) tool = "mcp";
  else tool = names[toolName] ?? (names[toolName.toLowerCase()] ?? (toolName === "http" ? "http" : toolName));
  const rawArgs = event.args ?? event.arguments ?? event.input ?? event.tool_input ?? event.function?.arguments ?? {};
  let args = rawArgs;
  if (typeof rawArgs === "string") {
    try { args = JSON.parse(rawArgs); } catch { args = { value: rawArgs }; }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) args = { value: args };
  if (tool === "mcp") {
    args = { server: toolName.split("__")[1] ?? "", tool: toolName.split("__").slice(2).join("__"), args };
  }
  const result = event.result ?? event.tool_result ?? event.output;
  return {
    tool,
    args,
    ...(result === undefined ? {} : { result }),
    ...(event.call_id || event.callId ? { callId: event.call_id ?? event.callId } : {}),
  };
}
