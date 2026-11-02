// OWNER: integrator
/**
 * Load and layer compiled rules from the global and project installations.
 *
 * Precedence is deterministic and documented in docs/hooks.md:
 *   1. global rules are evaluated first and are always authoritative;
 *   2. project rules add protections and can never replace or disable a rule
 *      that the global installation already defines (same id);
 *   3. identical rule bodies are evaluated once regardless of how many
 *      installations carry them.
 */
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readJson } from "./store.js";
import { STATE_DIR } from "./roots.js";

/** A compiled file larger than this is refused instead of being parsed. */
export const MAX_COMPILED_BYTES = 4 * 1024 * 1024;
const RULE_MODES = new Set(["block", "warn", "off", "pending"]);
const RULE_KINDS = new Set(["call_shape", "ordering", "taint_flow"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Canonical JSON with sorted keys, used only to detect duplicate rules. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** A rule that cannot be evaluated is skipped loudly, never trusted blindly. */
function validRule(rule) {
  return isPlainObject(rule)
    && typeof rule.id === "string" && rule.id.length > 0
    && RULE_MODES.has(String(rule.mode))
    && RULE_KINDS.has(String(rule.kind));
}

/**
 * Read one compiled.json file.
 * Missing files are normal; invalid ones produce an explicit warning.
 * @returns {Promise<{rules: object[], warnings: string[]}>}
 */
export async function readCompiled(path, label) {
  const warnings = [];
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { rules: [], warnings };
    warnings.push(`grudge: cannot read ${label} rules at '${path}': ${error?.message ?? error}`);
    return { rules: [], warnings };
  }
  if (!info.isFile()) return { rules: [], warnings };
  if (info.size > MAX_COMPILED_BYTES) {
    warnings.push(`grudge: ${label} rules at '${path}' are ${info.size} bytes, over the ${MAX_COMPILED_BYTES}-byte limit; ignored`);
    return { rules: [], warnings };
  }
  const compiled = await readJson(path, null);
  if (!isPlainObject(compiled) || compiled.version !== 1 || !Array.isArray(compiled.rules)) {
    warnings.push(`grudge: ${label} rules at '${path}' are not a version 1 compiled file; ignored (fail-open)`);
    return { rules: [], warnings };
  }
  const rules = [];
  for (const rule of compiled.rules) {
    if (validRule(rule)) rules.push(rule);
    else warnings.push(`grudge: ${label} rule ${JSON.stringify(rule?.id ?? "unknown")} is invalid and was skipped`);
  }
  return { rules, warnings };
}

/**
 * Merge global and project rules without duplicating evaluation.
 * @param {object[]} globalRules
 * @param {object[]} projectRules
 * @param {string[]} [warnings]
 */
export function mergeRules(globalRules = [], projectRules = [], warnings = []) {
  const byId = new Map();
  const byBody = new Set();
  const merged = [];
  for (const [label, list] of [["global", globalRules], ["project", projectRules]]) {
    for (const rule of list) {
      const { id: _ignored, ...rest } = rule;
      const body = canonical(rest);
      if (byId.has(rule.id)) {
        if (canonical(byId.get(rule.id)) !== canonical(rule)) {
          warnings.push(`grudge: ${label} rule '${rule.id}' is ignored; the rule with that id from the other installation takes precedence`);
        }
        continue;
      }
      if (byBody.has(body)) continue;
      byId.set(rule.id, rule);
      byBody.add(body);
      merged.push(rule);
    }
  }
  return merged;
}

/**
 * Load every rule set that applies to this hook call.
 * @param {{projectRoot: string, globalDir?: string|null}} roots
 * @param {{includeProject?: boolean, includeGlobal?: boolean}} [options]
 */
export async function loadRules(roots, options = {}) {
  const includeProject = options.includeProject !== false;
  const includeGlobal = options.includeGlobal !== false;
  const warnings = [];
  let globalRules = [];
  if (includeGlobal && roots.globalDir) {
    const result = await readCompiled(join(roots.globalDir, "compiled.json"), "global");
    globalRules = result.rules;
    warnings.push(...result.warnings);
  }
  let projectRules = [];
  const projectDir = join(roots.projectRoot, STATE_DIR);
  if (includeProject && (!roots.globalDir || resolve(projectDir) !== resolve(roots.globalDir))) {
    const result = await readCompiled(join(projectDir, "compiled.json"), "project");
    projectRules = result.rules;
    warnings.push(...result.warnings);
  }
  return { rules: mergeRules(globalRules, projectRules, warnings), warnings };
}

export const rules = { MAX_COMPILED_BYTES, readCompiled, mergeRules, loadRules };
