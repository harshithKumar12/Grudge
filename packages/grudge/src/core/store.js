// OWNER: lane-a
import { dirname } from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

/** Read JSON, returning fallback for missing, invalid, or non-object data. */
export async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

/** Write canonical JSON via a same-directory temporary file and rename. */
export async function writeJsonAtomic(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    try { await unlink(temporary); } catch { /* best effort */ }
    throw error;
  }
}
