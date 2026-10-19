// OWNER: lane-a
import { join } from "node:path";
import { readJson } from "./store.js";

export const DEFAULT_CONFIG = Object.freeze({
  mode: "on",
  autoAccept: false,
  avoidedRetryTokens: 1500,
  hookBudgetMs: 1500,
  correctionPatterns: ["don't do that", "never", "you shouldn't have", "revert that"],
});

/** Load repo-local config with safe defaults; malformed config fails open. */
export async function loadConfig(root = process.cwd()) {
  const value = await readJson(join(root, ".grudge", "config.json"), {});
  return { ...DEFAULT_CONFIG, ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}) };
}
