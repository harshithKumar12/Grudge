// OWNER: lane-b
/** Trace-admit a model-drafted rule and persist it as a pending Scar. */

import { createHash } from "node:crypto";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "../dsl/parse.js";
import { check } from "../dsl/check.js";
import { append, read } from "../core/session.js";
import { writeJsonAtomic } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { accept } from "./accept.js";
import { paths } from "./scars.js";

const EXAMPLE = 'never call shell where command ~ "untrusted instruction"';

function english(rule) {
  if (rule.kind === "ordering") return `Must call ${rule.ordering.before} before ${rule.ordering.after}.`;
  if (rule.kind === "taint_flow") return `Never call ${rule.tool} with data tainted by ${rule.taint.source}.`;
  const conditions = Object.keys(rule.match ?? {}).length ? " with the specified arguments" : "";
  return `${rule.polarity === "must" ? "Must call" : "Never call"} ${rule.tool}${conditions}.`;
}

function idFor(rule, why, sessionId) {
  const digest = createHash("sha256").update(`${rule.source}\n${why}\n${sessionId ?? ""}`).digest("hex").slice(0, 12);
  return `scar-${digest}`;
}

async function sessionFiles(root) {
  try {
    let directory = join(root, ".grudge", "session");
    try {
      await stat(directory);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      directory = join(root, "session");
    }
    const names = (await readdir(directory)).filter((name) => name.endsWith(".jsonl"));
    return Promise.all(names.map(async (name) => ({
      id: name.slice(0, -6),
      path: join(directory, name),
      mtime: (await stat(join(directory, name))).mtimeMs,
    })));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function latestSession(root, requested) {
  const files = await sessionFiles(root);
  if (!files.length) return null;
  if (requested) return files.find((item) => item.id === requested) ?? null;
  return files.sort((a, b) => b.mtime - a.mtime)[0];
}

function sessionRoot(root) {
  return join(root, ".grudge", "session");
}

function rejection(reason) {
  return { accepted: false, error: String(reason).slice(0, 299) };
}

/** @param {{rule?: string, why?: string, preventive?: boolean, session?: string, root?: string}} options */
export async function propose(options = {}) {
  const source = options.rule;
  const why = options.why;
  const root = options.root ?? process.cwd();
  if (!source || !why) return rejection("rule and why are required");
  let rule;
  try {
    rule = parse(source);
  } catch (error) {
    return rejection(`${error.message}. Corrected example: ${EXAMPLE}`);
  }
  const target = await latestSession(root, options.session);
  if (!target) return rejection("no session found; record a session before proposing a rule");
  const eventRoot = (await sessionFiles(root)).some((item) => item.path.startsWith(sessionRoot(root)))
    ? join(root, ".grudge")
    : root;
  const events = await read(eventRoot, target.id);
  const result = check(rule, events);
  if (!options.preventive && !result.violated) {
    return rejection("vacuous rule: it did not fire on the selected session");
  }
  const all = await sessionFiles(root);
  for (const control of all) {
    if (control.id === target.id) continue;
    const controlResult = check(rule, await read(eventRoot, control.id));
    if (controlResult.violated) {
      const event = controlResult.atEvents[0];
      return rejection(`over-broad rule: fires on control session ${control.id} at event ${event}`);
    }
  }
  const id = idFor(rule, why, target.id);
  const record = {
    id,
    mode: "pending",
    rule,
    english: english(rule),
    why,
    session: target.id,
    createdFrom: "propose",
    preventive: Boolean(options.preventive),
    admittedAtEvents: result.atEvents,
    createdAt: new Date().toISOString(),
  };
  const targetPaths = paths(root);
  await mkdir(targetPaths.pending, { recursive: true });
  await writeJsonAtomic(join(targetPaths.pending, `${id}.scar.json`), record);
  if ((await loadConfig(root)).autoAccept === true) {
    const promoted = await accept(id, { root });
    return { ...promoted, pending: false, autoAccepted: true, record };
  }
  return {
    accepted: true,
    pending: true,
    id,
    english: record.english,
    run: `grudge accept ${id}`,
    record,
  };
}

export { english };
