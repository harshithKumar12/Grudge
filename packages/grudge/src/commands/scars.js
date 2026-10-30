// OWNER: lane-b
/** Local pending/admitted Scar storage for the proposal workflow. */

import { mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "../core/store.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function paths(root) {
  const base = join(root, ".grudge");
  return {
    base,
    pending: join(base, "pending"),
    scars: join(base, "scars"),
    compiled: join(base, "compiled.json"),
  };
}

function safeId(id) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error("invalid scar id");
  return id;
}

async function entries(directory) {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".scar.json"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function readPending(root, id) {
  const target = paths(root);
  return readJson(join(target.pending, `${safeId(id)}.scar.json`), null);
}

export async function readScar(root, id) {
  const target = paths(root);
  return readJson(join(target.scars, `${safeId(id)}.scar.json`), null);
}

export async function listStored(root) {
  const target = paths(root);
  const [pendingNames, scarNames] = await Promise.all([entries(target.pending), entries(target.scars)]);
  const pending = await Promise.all(pendingNames.map((name) => readJson(join(target.pending, name), null)));
  const admitted = await Promise.all(scarNames.map((name) => readJson(join(target.scars, name), null)));
  return {
    pending: pending.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id)),
    scars: admitted.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function compiledRule(record, mode = "block") {
  const rule = record.rule ?? record;
  return {
    id: record.id,
    mode,
    kind: rule.kind,
    tool: rule.tool,
    match: rule.match ?? {},
    ordering: rule.ordering ?? { before: "", after: "" },
    taint: rule.taint ?? { source: "", sink: "" },
    // `polarity` decides whether a call_shape rule forbids a call or requires
    // one. Dropping it silently inverted `must call ...` into a block of the
    // required call, so it is always written and defaults to the prohibition.
    polarity: rule.polarity === "must" ? "must" : "never",
    english: record.english,
    createdFrom: record.createdFrom ?? "propose",
  };
}

export async function recompile(root) {
  const { scars, ...listing } = await listStored(root);
  const rules = scars
    .map((record) => compiledRule(record, record.mode ?? "block"))
    .sort((a, b) => a.id.localeCompare(b.id));
  await writeJsonAtomic(paths(root).compiled, { version: 1, rules });
  return { version: 1, rules, ...listing };
}

export async function movePending(root, id) {
  const target = paths(root);
  const safe = safeId(id);
  const record = await readJson(join(target.pending, `${safe}.scar.json`), null);
  if (!record) throw new Error(`pending scar ${id} not found`);
  record.mode = "block";
  await mkdir(target.scars, { recursive: true });
  await writeJsonAtomic(join(target.scars, `${safe}.scar.json`), record);
  await unlink(join(target.pending, `${safe}.scar.json`));
}

export async function removeStored(root, id) {
  const safe = safeId(id);
  const target = paths(root);
  await Promise.all([
    unlink(join(target.pending, `${safe}.scar.json`)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    }),
    unlink(join(target.scars, `${safe}.scar.json`)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    }),
  ]);
  return recompile(root);
}

/** @param {string} [action] @param {{root?: string, id?: string}} [options] */
export async function scars(action = "list", options = {}) {
  const root = options.root ?? process.cwd();
  const id = options.id;
  if (action === "list") return listStored(root);
  if (!id) throw new Error("scar id is required");
  if (action === "show") {
    return { pending: await readPending(root, id), scar: await readScar(root, id) };
  }
  if (action === "disable") {
    const record = await readScar(root, id);
    if (!record) throw new Error(`scar ${id} not found`);
    record.mode = "off";
    await writeJsonAtomic(join(paths(root).scars, `${safeId(id)}.scar.json`), record);
    return recompile(root);
  }
  if (action === "reject" || action === "remove") return removeStored(root, id);
  if (action === "accept") {
    const record = await readPending(root, id);
    if (!record) {
      if (await readScar(root, id)) return recompile(root);
      throw new Error(`pending scar ${id} not found`);
    }
    await movePending(root, id);
    return recompile(root);
  }
  throw new Error(`unknown scars action: ${action}`);
}

export { paths, safeId };
