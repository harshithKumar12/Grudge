// OWNER: lane-c
import { access, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { removeManagedBlock } from "../installer/managed-block.js";
import { parseJson } from "../installer/json-merge.js";
import { restoreBackup } from "../installer/backup.js";

/** Remove only managed Grudge state and restore the latest backup when available. */
export async function uninstall(options = {}) {
  const root = resolve(options.cwd ?? process.cwd());
  const configPath = join(root, ".grudge/config.json");
  const config = await readJson(configPath);
  const removed = [];
  const restored = [];
  if (config?.lastBackup) restored.push(...await restoreBackup(root, config.lastBackup));
  for (const path of [join(root, "AGENTS.md"), join(root, "CLAUDE.md"), join(root, "GEMINI.md"), join(root, ".windsurfrules"), join(root, ".github/copilot-instructions.md")]) {
    const text = await readOptional(path);
    if (text === null) continue;
    const clean = removeManagedBlock(text);
    if (clean !== text) {
      await writeFile(path, clean, "utf8");
      removed.push(path);
    }
  }
  if (options.removeRuntime !== false) {
    try { await unlink(join(root, ".grudge/bin/grudge.mjs")); removed.push(join(root, ".grudge/bin/grudge.mjs")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const statePath = join(root, ".grudge");
  if (options.removeState !== false && await exists(statePath)) { await rm(statePath, { recursive: true, force: true }); removed.push(statePath); }
  const result = { root, removed, restored };
  if (options.print !== false) for (const path of removed) process.stdout.write(`removed ${path}\n`);
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

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
