// OWNER: lane-a

// Claude Code exposes one tool per host action; the DSL keeps four canonical
// tools. Keep this map lowercase-keyed so casing never decides enforcement.
export const toolNames = {
  read: "read_file", notebookread: "read_file",
  write: "write_file", edit: "write_file", multiedit: "write_file", notebookedit: "write_file",
  bash: "shell", powershell: "shell",
  webfetch: "http", websearch: "http",
};

/** Convert a host hook payload into the canonical runtime event shape. */
export function normalize(event = {}) {
  const rawTool = event.tool ?? event.tool_name ?? event.name ?? event.function?.name ?? event.input?.tool;
  const toolName = String(rawTool ?? "other");
  let tool;
  if (toolName.startsWith("mcp__")) tool = "mcp";
  else tool = toolNames[toolName.toLowerCase()] ?? (toolName === "http" ? "http" : toolName);
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
