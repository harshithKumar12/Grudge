// OWNER: lane-c
import { join } from "node:path";
import { access } from "node:fs/promises";
import { homedir } from "node:os";

export function instructionPath({ id, scope = "repo", cwd = process.cwd(), home = homedir() }) {
  const global = (relative) => join(home, relative);
  const root = scope === "global" ? home : cwd;
  switch (id) {
    case "codex": return scope === "global" ? global(".codex/AGENTS.md") : join(root, "AGENTS.md");
    case "gemini-cli": return scope === "global" ? global(".gemini/GEMINI.md") : join(root, "GEMINI.md");
    case "copilot": return scope === "global" ? null : join(root, ".github/copilot-instructions.md");
    case "windsurf": return scope === "global" ? global(".codeium/windsurf/memories/global_rules.md") : join(root, ".windsurfrules");
    case "opencode": return scope === "global" ? global(".config/opencode/AGENTS.md") : join(root, "AGENTS.md");
    default: return join(root, "AGENTS.md");
  }
}

export async function fileExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

export function createInstructionAdapter({ id, docsUrl, targetLabel, verified = true }) {
  return {
    id,
    tier: "Advisory",
    verified,
    docsUrl,
    targetLabel,
    async detect(context = {}) {
      const path = instructionPath({ id, ...context });
      return { detected: await fileExists(path), path };
    },
    plan(context = {}) {
      const path = instructionPath({ id, ...context });
      return { adapter: id, verified, files: path ? [{ path, kind: "managed-text" }] : [], snippet: path ? null : "Paste the Grudge instruction block into the agent's documented instruction file." };
    },
    async apply(context, plan) {
      if (!verified) return { applied: false, reason: "unverified adapter", snippet: plan.snippet };
      return context.applyPlan(plan);
    },
    async remove(context, plan) {
      if (!verified) return { removed: false, reason: "unverified adapter" };
      return context.removePlan(plan);
    },
  };
}
