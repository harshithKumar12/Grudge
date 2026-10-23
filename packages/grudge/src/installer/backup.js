// OWNER: lane-c
import { copyFile, mkdir, readFile, writeFile, access, rm, unlink } from "node:fs/promises";
import { join, relative, dirname, isAbsolute } from "node:path";
import { hasManagedBlock, removeManagedBlock } from "./managed-block.js";
import { parseJson, stripGrudgeSettings } from "./json-merge.js";

export async function backup(root, file, { timestamp = new Date().toISOString().replace(/[:.]/g, "-") } = {}) {
  const absolute = file;
  const backupRoot = join(root, ".grudge", "backups", timestamp);
  const relativePath = relative(root, absolute);
  const safePath = relativePath.startsWith("..") || isAbsolute(relativePath)
    ? join("external", absolute.replace(/[<>:"/\\|?*]+/g, "_").replace(/^_+/, ""))
    : relativePath;
  const destination = join(backupRoot, safePath);
  await mkdir(dirname(destination), { recursive: true });
  let existed = true;
  try { await access(absolute); } catch { existed = false; }
  if (existed) await copyFile(absolute, destination);
  return { root: backupRoot, file: absolute, backup: destination, existed };
}

export async function writeBackupManifest(root, timestamp, entries) {
  const destination = join(root, ".grudge", "backups", timestamp, "manifest.json");
  await writeFile(destination, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, "utf8");
  return destination;
}

export async function restoreEntries(entries) {
  const results = [];
  for (const entry of [...entries].reverse()) {
    if (entry.existed) {
      await mkdir(dirname(entry.file), { recursive: true });
      await copyFile(entry.backup, entry.file);
      results.push({ file: entry.file, action: "restored" });
    } else {
      try {
        await unlink(entry.file);
        results.push({ file: entry.file, action: "removed" });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  if (entries[0]?.root) await rm(entries[0].root, { recursive: true, force: true });
  return results;
}

export async function readBackupManifest(root, timestamp) {
  const path = join(root, ".grudge", "backups", timestamp, "manifest.json");
  return JSON.parse(await readFile(path, "utf8"));
}

export async function restoreBackup(root, timestamp, { remove = false } = {}) {
  const manifest = await readBackupManifest(root, timestamp);
  const results = [];
  for (const entry of manifest.entries) {
    const managed = await cleanManagedFile(entry);
    if (managed) {
      results.push(managed);
    } else if (entry.existed && !isManagedPath(entry.file)) {
      await mkdir(dirname(entry.file), { recursive: true });
      await copyFile(entry.backup, entry.file);
      results.push({ file: entry.file, action: "restored" });
    } else if (!entry.existed && !isManagedPath(entry.file)) {
      const result = await removeCreatedManagedFile(entry.file);
      if (result) results.push(result);
    }
  }
  if (remove) {
    const { rm } = await import("node:fs/promises");
    await rm(join(root, ".grudge", "backups", timestamp), { recursive: true, force: true });
  }
  return results;
}

async function removeCreatedManagedFile(file) {
  let current;
  try { current = await readFile(file, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!hasManagedBlock(current)) return null;
  const clean = removeManagedBlock(current);
  if (clean.trim()) {
    await writeFile(file, clean, "utf8");
    return { file, action: "cleaned" };
  }
  await unlink(file);
  return { file, action: "removed" };
}

async function cleanManagedFile(entry) {
  if (isSettingsPath(entry.file)) return cleanSettingsFile(entry.file, entry.existed);
  if (entry.file.endsWith(".gitignore")) return cleanGitignore(entry.file, entry.existed);
  if (!isManagedTextPath(entry.file)) return null;
  const current = await readOptional(entry.file);
  if (current === null || !hasManagedBlock(current)) return null;
  const clean = await restoreOriginalSeparator(entry, removeManagedBlock(current));
  if (clean.trim() || entry.existed) {
    await writeFile(entry.file, clean, "utf8");
    return { file: entry.file, action: "cleaned" };
  }
  await unlink(entry.file);
  return { file: entry.file, action: "removed" };
}

async function restoreOriginalSeparator(entry, clean) {
  if (!entry.existed || !entry.backup) return clean;
  const original = await readOptional(entry.backup);
  return original !== null && clean === `${original}\n` ? original : clean;
}

async function cleanSettingsFile(file, existed) {
  const current = await readOptional(file);
  if (current === null) return null;
  let parsed;
  try { parsed = parseJson(current, file); } catch { return null; }
  const cleaned = stripGrudgeSettings(parsed);
  if (!cleaned.changed) return null;
  if (!existed && !Object.keys(cleaned.value).length) {
    await unlink(file);
    return { file, action: "removed" };
  }
  await writeFile(file, `${JSON.stringify(cleaned.value, null, detectIndent(current))}\n`, "utf8");
  return { file, action: "cleaned" };
}

async function cleanGitignore(file, existed) {
  const current = await readOptional(file);
  if (current === null) return null;
  const managed = new Set([".grudge/session/", ".grudge/stats.json", ".grudge/*.log"]);
  const lines = current.split(/\r?\n/);
  const cleaned = lines.filter((line) => !managed.has(line)).join("\n");
  if (cleaned === current) return null;
  if (!existed && !cleaned.trim()) {
    await unlink(file);
    return { file, action: "removed" };
  }
  await writeFile(file, cleaned, "utf8");
  return { file, action: "cleaned" };
}

async function readOptional(file) {
  try { return await readFile(file, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function isSettingsPath(file) {
  return /[\\/]\.claude[\\/]settings(?:\.local)?\.json$/.test(file);
}

function isManagedTextPath(file) {
  return /(?:^|[\\/])(?:AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.windsurfrules|copilot-instructions\.md)$/.test(file);
}

function isManagedPath(file) {
  return isSettingsPath(file) || file.endsWith(".gitignore") || isManagedTextPath(file);
}

function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)"/);
  return match ? match[1] : 2;
}
