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

/**
 * Load the configurations that apply to one hook call.
 *
 * `mode: "off"` is scoped to the installation that declares it: turning Grudge
 * off in a project never disables the machine-wide global rules, and turning
 * the global install off never disables an explicit project install.
 *
 * `hookBudgetMs` is an observability threshold, not a race: state reads are
 * bounded by fixed caps and the rule decision is never abandoned on timeout.
 */
export async function loadEffectiveConfig(roots, warnings = []) {
  const project = await loadConfig(roots.projectRoot);
  const global = roots.globalRoot ? await loadConfig(roots.globalRoot) : null;
  const projectActive = project.mode !== "off";
  const globalActive = global ? global.mode !== "off" : false;
  const raw = project.hookBudgetMs ?? global?.hookBudgetMs ?? DEFAULT_CONFIG.hookBudgetMs;
  const budget = Number(raw);
  if (!Number.isFinite(budget) || budget <= 0) {
    warnings.push(`grudge: hookBudgetMs ${JSON.stringify(raw)} is invalid; using ${DEFAULT_CONFIG.hookBudgetMs}. Enforcement is not affected.`);
    return { project, global, projectActive, globalActive, hookBudgetMs: DEFAULT_CONFIG.hookBudgetMs };
  }
  return { project, global, projectActive, globalActive, hookBudgetMs: budget };
}
