// OWNER: lane-c
import { join } from "node:path";
import { homedir } from "node:os";
import { fileExists } from "./common.js";

const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
const commandFor = (event, runtimeCommand = "node .grudge/bin/grudge.mjs") => `${runtimeCommand} hook ${event}`;

export const adapter = {
  id: "claude-code",
  tier: "Guard",
  verified: true,
  docsUrl: "https://code.claude.com/docs/en/settings",
  targetLabel: ".claude/settings.json + CLAUDE.md",
  async detect({ cwd = process.cwd(), home = homedir() } = {}) {
    const paths = [join(cwd, ".claude"), join(home, ".claude")];
    for (const path of paths) if (await fileExists(path)) return { detected: true, path };
    return { detected: false, path: paths[0] };
  },
  plan({ cwd = process.cwd(), home = homedir(), scope = "repo", runtimeCommand = "node .grudge/bin/grudge.mjs" } = {}) {
    const settings = scope === "global" ? join(home, ".claude/settings.json") : join(cwd, ".claude", scope === "local" ? "settings.local.json" : "settings.json");
    const files = [{ path: settings, kind: "claude-settings" }];
    const instruction = scope === "global" ? join(home, ".claude/CLAUDE.md") : join(cwd, "CLAUDE.md");
    files.push({ path: instruction, kind: "managed-text" });
    return { adapter: "claude-code", verified: true, files, hooks: HOOK_EVENTS.map((event) => ({ event, command: commandFor(event, runtimeCommand) })), statusLine: `${runtimeCommand} statusline` };
  },
  async apply(context, plan) {
    return context.applyPlan(plan);
  },
  async remove(context, plan) {
    return context.removePlan(plan);
  },
};

export { HOOK_EVENTS, commandFor };
