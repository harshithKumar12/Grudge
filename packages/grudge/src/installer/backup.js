// OWNER: lane-c
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, relative, dirname, isAbsolute } from "node:path";

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

export async function readBackupManifest(root, timestamp) {
  const path = join(root, ".grudge", "backups", timestamp, "manifest.json");
  return JSON.parse(await readFile(path, "utf8"));
}

export async function restoreBackup(root, timestamp, { remove = false } = {}) {
  const manifest = await readBackupManifest(root, timestamp);
  const results = [];
  for (const entry of manifest.entries) {
    if (entry.existed) {
      await mkdir(dirname(entry.file), { recursive: true });
      await copyFile(entry.backup, entry.file);
      results.push({ file: entry.file, action: "restored" });
    } else {
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(entry.file);
        results.push({ file: entry.file, action: "removed" });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  if (remove) {
    const { rm } = await import("node:fs/promises");
    await rm(join(root, ".grudge", "backups", timestamp), { recursive: true, force: true });
  }
  return results;
}
