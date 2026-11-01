// OWNER: lane-c
import { readFile, readdir, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { removeManagedBlock } from "../installer/managed-block.js";
import { parseJson } from "../installer/json-merge.js";
import { restoreBackup } from "../installer/backup.js";
import { findProjectInstallRoot } from "../installer/install-root.js";
import { homedir } from "node:os";

// Grudge owns these names inside `.grudge`; everything else there is the
// user's and must survive an uninstall.
const MANAGED_FILES = new Set(["config.json", "compiled.json", "report-state.json", "stats.json", "stats.jsonl", "stats.jsonl.lock"]);
const MANAGED_DIRS = new Set(["bin", "session", "pending", "scars", "backups"]);

/** True when `.grudge` holds nothing except paths Grudge created. */
function isManagedName(name) {
  return MANAGED_FILES.has(name) || MANAGED_DIRS.has(name) || name.endsWith(".log");
}

/**
 * Remove only what Grudge created, and only the directories that become empty.
 * A user file dropped into `.grudge` is preserved and reported instead of
 * being deleted along with the folder.
 */
async function removeManagedState(statePath) {
  const removed = [];
  const preserved = [];
  let names;
  try { names = await readdir(statePath); } catch (error) { if (error.code === "ENOENT") return { removed, preserved }; throw error; }
  for (const name of names) {
    const target = join(statePath, name);
    if (!isManagedName(name)) { preserved.push(target); continue; }
    await rm(target, { recursive: true, force: true });
    removed.push(target);
  }
  // Only an entirely managed folder disappears; otherwise the user's files
  // keep their directory.
  try { await rmdir(statePath); removed.push(statePath); } catch { /* not empty: keep it */ }
  return { removed, preserved };
}

/** Remove only managed Grudge state and restore the latest backup when available. */
export async function uninstall(options = {}) {
  const launchDir = resolve(options.cwd ?? process.cwd());
  const home = resolve(options.home ?? homedir());
  // Resolve the install the same way `doctor` does, but never past the
  // repository boundary: uninstalling from `repo/src` must act on `repo`, while
  // uninstalling from an unrelated directory must not reach an install above it.
  const root = await findProjectInstallRoot({ launchDir, home });
  if (!root) {
    const reason = `no Grudge install at or above ${launchDir} (searched up to the repository boundary); nothing was removed`;
    if (options.print !== false) process.stdout.write(`${reason}\n`);
    return { ok: false, found: false, root: launchDir, removed: [], restored: [], preserved: [], reason };
  }
  const configPath = join(root, ".grudge/config.json");
  const config = await readJson(configPath);
  const removed = [];
  const restored = [];
  const warnings = [];
  if (config?.lastBackup) {
    // A missing or hand-edited backup must not turn the escape hatch into a
    // crash: report it, then keep removing the managed state.
    try {
      const entries = await restoreBackup(root, config.lastBackup);
      restored.push(...entries.filter((entry) => entry.action !== "skipped"));
      for (const entry of entries.filter((item) => item.action === "skipped")) {
        warnings.push(`did not restore ${entry.file}: ${entry.reason}`);
      }
    } catch (error) {
      warnings.push(`could not restore backup '${config.lastBackup}': ${error?.code ?? error?.message ?? error}; continuing with removal`);
    }
  }
  for (const path of [join(root, "AGENTS.md"), join(root, "CLAUDE.md"), join(root, "GEMINI.md"), join(root, ".windsurfrules"), join(root, ".github/copilot-instructions.md")]) {
    const text = await readOptional(path);
    if (text === null) continue;
    const clean = removeManagedBlock(text);
    if (clean !== text) {
      await writeFile(path, clean, "utf8");
      removed.push(path);
    }
  }
  const statePath = join(root, ".grudge");
  let preserved = [];
  if (options.removeState !== false) {
    const state = await removeManagedState(statePath);
    removed.push(...state.removed);
    preserved = state.preserved;
  } else if (options.removeRuntime !== false) {
    try { await unlink(join(root, ".grudge/bin/grudge.mjs")); removed.push(join(root, ".grudge/bin/grudge.mjs")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const result = { ok: true, found: true, root, removed, restored, preserved, warnings };
  if (options.print !== false) {
    for (const path of removed) process.stdout.write(`removed ${path}\n`);
    // Never delete silently: say what stayed and why.
    for (const path of preserved) process.stdout.write(`preserved ${path} (not created by Grudge)\n`);
    for (const warning of warnings) process.stdout.write(`warning: ${warning}\n`);
  }
  return result;
}

async function readJson(path) {
  const text = await readOptional(path);
  if (!text) return null;
  try { return parseJson(text, path); } catch { return null; }
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
