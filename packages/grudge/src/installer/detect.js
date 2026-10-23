// OWNER: lane-c
import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { platform as currentPlatform } from "node:process";

const definitions = [
  ["claude-code", [".claude"], ["claude"]],
  ["codex", [".codex"], ["codex"]],
  ["cursor", [".cursor"], ["cursor"]],
  ["gemini-cli", [".gemini"], ["gemini"]],
  ["copilot", [".github"], ["gh"]],
  ["windsurf", [".windsurf", ".codeium"], ["windsurf"]],
  ["opencode", [".config/opencode"], ["opencode"]],
];

/** Detect tools without starting them; explicit paths are useful in tests. */
export async function detect({ cwd = process.cwd(), home = homedir(), env = process.env, platform = currentPlatform } = {}) {
  const found = [];
  for (const [id, dirs, binaries] of definitions) {
    const directory = await firstExisting(dirs.map((path) => join(home, path)));
    const binary = await findBinary(binaries, env.PATH, platform);
  found.push({ id, tier: id === "claude-code" ? "Guard" : "Advisory", detected: Boolean(directory || binary), directory, binary });
  }
  return found;
}

async function firstExisting(paths) {
  for (const path of paths) {
    try { await access(path); return path; } catch { /* absent */ }
  }
  return null;
}

async function findBinary(names, pathValue = "", platform) {
  const suffixes = platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const directory of String(pathValue).split(platform === "win32" ? ";" : ":")) {
    if (!directory) continue;
    for (const name of names) for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`);
      try { await access(candidate); return candidate; } catch { /* absent */ }
    }
  }
  return null;
}
