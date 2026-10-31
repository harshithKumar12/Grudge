// OWNER: integrator
/**
 * Deterministic root resolution for hooks.
 *
 * A hook must never guess its project from the process working directory:
 * Claude Code runs command hooks from whichever directory the session is in,
 * and that follows `cd`. The only stable anchor is the runtime script that the
 * host executes, `<install root>/.grudge/bin/grudge.mjs`. Everything else is
 * validated against it:
 *
 * - repository local install: the install root is the project root;
 * - global install: the install root is the home directory, so the project root
 *   comes from the validated hook payload `cwd`;
 * - a payload `cwd` outside the install root never redirects state; it only
 *   produces a warning and the install root keeps enforcing.
 */
import { statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { readJson } from "./store.js";

export const STATE_DIR = ".grudge";
export const RUNTIME_RELATIVE = ".grudge/bin/grudge.mjs";

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function comparable(path) {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function samePath(left, right) {
  const a = comparable(left);
  const b = comparable(right);
  return a === b || a.replace(/[\\/]+$/, "") === b.replace(/[\\/]+$/, "");
}

/** True when `child` is `parent` or lives underneath it (case-aware on Windows). */
export function withinRoot(child, parent) {
  const left = comparable(child);
  const right = comparable(parent).replace(/[\\/]+$/, "");
  if (!right) return false;
  return left === right || left.startsWith(`${right}${sep}`) || left.startsWith(`${right}/`);
}

/**
 * Derive the install root from the running script path.
 * Returns null when the script is not an installed Grudge runtime.
 */
export function installRootFromScript(scriptPath) {
  if (typeof scriptPath !== "string" || !scriptPath.trim()) return null;
  const script = resolve(scriptPath);
  if (basename(script) !== "grudge.mjs") return null;
  const bin = dirname(script);
  if (basename(bin) !== "bin") return null;
  const state = dirname(bin);
  if (basename(state) !== STATE_DIR) return null;
  return dirname(state);
}

async function hasInstall(stateRoot) {
  return Boolean(await readJson(join(stateRoot, STATE_DIR, "config.json"), null));
}

/**
 * Resolve the install root, project root and global rule directory.
 *
 * @param {object} [payload] hook payload; only `cwd` is consulted
 * @param {{scriptPath?: string, installRoot?: string, home?: string,
 *          processCwd?: string, scope?: "repo"|"local"|"global"}} [options]
 * @returns {Promise<{installRoot: string|null, projectRoot: string,
 *   globalDir: string|null, scope: string, home: string,
 *   payloadRoot: string|null, warnings: string[]}>}
 */
export async function resolveRoots(payload = {}, options = {}) {
  const warnings = [];
  const home = resolve(options.home ?? homedir());
  const processCwd = resolve(options.processCwd ?? process.cwd());
  const scriptPath = options.scriptPath ?? process.argv[1];
  const installRoot = options.installRoot ? resolve(options.installRoot) : installRootFromScript(scriptPath);
  let scope = options.scope ?? null;

  if (installRoot) {
    const config = await readJson(join(installRoot, STATE_DIR, "config.json"), null);
    if (!scope) scope = config?.scope === "global" || samePath(installRoot, home) ? "global" : "repo";
  } else {
    scope = scope ?? "repo";
  }

  const rawCwd = payload?.cwd;
  let payloadRoot = null;
  if (typeof rawCwd === "string" && rawCwd.trim()) {
    const candidate = isAbsolute(rawCwd) ? resolve(rawCwd) : resolve(processCwd, rawCwd);
    if (isDirectory(candidate)) payloadRoot = candidate;
    else warnings.push(`grudge: hook payload cwd '${rawCwd}' is not an existing directory; ignored`);
  } else if (rawCwd !== undefined && rawCwd !== null) {
    warnings.push("grudge: hook payload cwd is not a path; ignored");
  }

  let projectRoot;
  if (scope === "global") {
    projectRoot = payloadRoot ?? processCwd;
    if (!payloadRoot) warnings.push(`grudge: global install received no usable payload cwd; enforcing global rules against '${projectRoot}'`);
  } else if (installRoot) {
    projectRoot = installRoot;
    if (payloadRoot && !withinRoot(payloadRoot, installRoot)) {
      warnings.push(`grudge: hook payload cwd '${payloadRoot}' is outside the install root '${installRoot}'; enforcing the rules installed at '${installRoot}'`);
    }
  } else {
    projectRoot = payloadRoot ?? processCwd;
    if (payloadRoot && !samePath(payloadRoot, processCwd)) {
      warnings.push(`grudge: no installed runtime found for '${scriptPath ?? "unknown"}'; enforcing from payload cwd '${payloadRoot}'`);
    }
  }

  // A global install is only consulted when it actually exists. Never read the
  // real home directory on a machine that has no global install.
  let globalDir = null;
  if (samePath(installRoot ?? "", home) || (await hasInstall(home))) {
    globalDir = join(home, STATE_DIR);
  }
  if (globalDir && samePath(globalDir, join(projectRoot, STATE_DIR))) globalDir = null;
  // `globalDir` points at the state folder; config loading wants the install
  // root that owns it (never `<home>/.grudge/.grudge`).
  const globalRoot = globalDir ? dirname(globalDir) : null;

  return { installRoot, projectRoot, globalDir, globalRoot, scope, home, payloadRoot, warnings };
}

export const roots = { STATE_DIR, RUNTIME_RELATIVE, installRootFromScript, withinRoot, resolveRoots };
