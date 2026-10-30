// OWNER: lane-b
/** Dependency-free JSONL persistence for local, redacted session events. */

import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sessionPath(root, id) {
  return join(root, "session", `${id}.jsonl`);
}

/** One id rule for every reader and writer, so `read` cannot escape the folder. */
function validId(id) {
  return typeof id === "string" && id.length > 0 && id !== "." && id !== ".." && !/[\\/]/.test(id);
}

/** @param {string} root @param {string} id @param {object} event */
export async function append(root, id, event) {
  if (!validId(id)) {
    throw new Error("invalid session id");
  }
  const path = sessionPath(root, id);
  await mkdir(join(root, "session"), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}

/** @param {string} root @param {string} id @returns {Promise<object[]>} */
export async function read(root, id) {
  // An id that could escape `.grudge/session` reads nothing rather than
  // somebody else's JSONL file; `prune` also calls this for on-disk names.
  if (!validId(id)) return [];
  try {
    const text = await readFile(sessionPath(root, id), "utf8");
    const events = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        if (value && typeof value === "object" && !Array.isArray(value)) events.push(value);
      } catch {
        // A partially written or manually edited line must not lose a session.
      }
    }
    return events;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

/** @param {string} root @param {{now?: number|Date, maxEvents?: number, maxAgeMs?: number}} [options] */
export async function prune(root, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now());
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let names;
  try {
    names = await readdir(join(root, "session"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(names.filter((name) => name.endsWith(".jsonl")).map(async (name) => {
    const path = join(root, "session", name);
    const events = await read(root, name.slice(0, -6));
    const newest = events.reduce((latest, event) => {
      const timestamp = Date.parse(String(event.timestamp ?? ""));
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
    const fileStat = await stat(path);
    const ageAnchor = newest || fileStat.mtimeMs;
    if (now - ageAnchor > maxAgeMs) {
      await unlink(path);
      return;
    }
    if (events.length > maxEvents) {
      await writeFile(path, `${events.slice(-maxEvents).map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    }
  }));
}

export const limits = Object.freeze({ maxEvents: DEFAULT_MAX_EVENTS, maxAgeMs: DEFAULT_MAX_AGE_MS });
