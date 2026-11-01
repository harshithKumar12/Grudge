// OWNER: lane-a

// Claude Code exposes one tool per host action; the DSL keeps four canonical
// tools. Keep this map lowercase-keyed so casing never decides enforcement.
export const toolNames = {
  read: "read_file", notebookread: "read_file",
  write: "write_file", edit: "write_file", multiedit: "write_file", notebookedit: "write_file",
  bash: "shell", powershell: "shell",
  webfetch: "http", websearch: "http",
};

// MCP servers are how most hosts expose filesystem and shell access, and a
// `mcp__server__tool` name never equals a canonical tool. Map the common
// capability names onto the same four tools so a rule written for `write_file`
// also covers `mcp__filesystem__write_file`. Unknown MCP tools stay `mcp` only:
// guessing a capability from an unfamiliar name could block unrelated calls.
export const mcpCapabilities = {
  write_file: "write_file", write_text_file: "write_file", write: "write_file",
  create_file: "write_file", create_or_update_file: "write_file", push_files: "write_file",
  apply_patch: "write_file", edit: "write_file", edit_file: "write_file",
  delete_file: "write_file", move_file: "write_file",
  read_file: "read_file", read_text_file: "read_file", read_multiple_files: "read_file",
  get_file_contents: "read_file", search_files: "read_file", list_directory: "read_file",
  directory_tree: "read_file",
  exec: "shell", exec_command: "shell", execute_command: "shell", run_command: "shell",
  shell: "shell", bash: "shell", terminal: "shell",
  fetch: "http", fetch_url: "http", http_request: "http", web_search: "http",
};

/**
 * Canonical capability of one MCP tool name, or null when it is unknown.
 * Exported so the checks and the tests agree on one mapping.
 */
export function mcpCapability(toolName) {
  const name = String(toolName).split("__").slice(2).join("__").toLowerCase();
  return Object.hasOwn(mcpCapabilities, name) ? mcpCapabilities[name] : null;
}

/** Convert a host hook payload into the canonical runtime event shape. */
export function normalize(event = {}) {
  const rawTool = event.tool ?? event.tool_name ?? event.name ?? event.function?.name ?? event.input?.tool;
  const toolName = String(rawTool ?? "other");
  let tool;
  let tools;
  if (toolName.startsWith("mcp__")) {
    tool = "mcp";
    const capability = mcpCapability(toolName);
    // `tools` lists every name a rule may use: the raw host name, `mcp`, and the
    // capability. `tool` stays `mcp` so existing rules keep matching.
    tools = [tool, ...(capability ? [capability] : []), toolName];
  } else tool = toolNames[toolName.toLowerCase()] ?? (toolName === "http" ? "http" : toolName);
  const rawArgs = event.args ?? event.arguments ?? event.input ?? event.tool_input ?? event.function?.arguments ?? {};
  let args = rawArgs;
  if (typeof rawArgs === "string") {
    try { args = JSON.parse(rawArgs); } catch { args = { value: rawArgs }; }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) args = { value: args };
  if (tool === "mcp") {
    const name = toolName.split("__").slice(2).join("__");
    // Keep the historical `server`/`tool`/`args` shape and expose the raw
    // arguments at the top level, so a capability rule can match `path` the way
    // it does for the native tool.
    args = { ...args, server: toolName.split("__")[1] ?? "", tool: name, args };
  }
  const result = event.result ?? event.tool_result ?? event.output;
  return {
    tool,
    ...(tools ? { tools } : {}),
    args,
    ...(result === undefined ? {} : { result }),
    ...(event.call_id || event.callId ? { callId: event.call_id ?? event.callId } : {}),
  };
}
