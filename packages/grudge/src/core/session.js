// OWNER: lane-b
/** Dependency-free JSONL persistence for local, redacted session events. */

import { appendFile, mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Enforcement reads are bounded by bytes and events rather than by a timeout,
// so a large history can never make a matching call skip its rule check.
const DEFAULT_READ_BYTES = 2 * 1024 * 1024;
const DEFAULT_READ_EVENTS = 500;

function sessionPath(root, id) {
  return join(root, "session", `${id}.jsonl`);
}

/** One id rule for every reader and writer, so `read` cannot escape the folder. */
function validId(id) {
  return typeof id === "string" && id.length > 0 && id !== "." && id !== ".." && !/[\\/]/.test(id);
}

function parseEvents(text) {
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

/**
 * Read at most the last `maxBytes` bytes and `maxEvents` events of a session.
 *
 * @param {string} root @param {string} id
 * @param {{maxBytes?: number, maxEvents?: number}} [options]
 * @returns {Promise<object[]>}
 */
export async function readTail(root, id, options = {}) {
  // An id that could escape `.grudge/session` reads nothing rather than
  // somebody else's JSONL file; `prune` also calls this for on-disk names.
  if (!validId(id)) return [];
  const maxBytes = typeof options.maxBytes === "number" && !Number.isNaN(options.maxBytes) ? Math.max(0, options.maxBytes) : DEFAULT_READ_BYTES;
  const maxEvents = typeof options.maxEvents === "number" && !Number.isNaN(options.maxEvents) ? Math.max(0, options.maxEvents) : DEFAULT_READ_EVENTS;
  let handle;
  try {
    handle = await open(sessionPath(root, id), "r");
    const info = await handle.stat();
    const start = Math.max(0, info.size - maxBytes);
    const length = info.size - start;
    if (length <= 0) return [];
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      // The first line is probably partial: drop it, never parse half an event.
      const newline = text.indexOf("\n");
      text = newline === -1 ? "" : text.slice(newline + 1);
    }
    const events = parseEvents(text);
    return maxEvents > 0 ? events.slice(-maxEvents) : [];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/** @param {string} root @param {string} id @returns {Promise<object[]>} */
export async function read(root, id) {
  return readTail(root, id, { maxBytes: Number.POSITIVE_INFINITY, maxEvents: Number.POSITIVE_INFINITY });
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

export const limits = Object.freeze({
  maxEvents: DEFAULT_MAX_EVENTS,
  maxAgeMs: DEFAULT_MAX_AGE_MS,
  readBytes: DEFAULT_READ_BYTES,
  readEvents: DEFAULT_READ_EVENTS,
});
