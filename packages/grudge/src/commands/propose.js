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
import { appendEvent } from "../core/stats.js";

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

/** Split a rule into whitespace tokens, keeping quoted spans intact. */
function tokenize(source) {
  const parts = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") { current += char + (source[index + 1] ?? ""); index += 1; continue; }
    if (char === '"') { quoted = !quoted; current += char; continue; }
    if (!quoted && /\s/.test(char)) {
      if (current) { parts.push(current); current = ""; }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return { parts, balanced: !quoted };
}

/**
 * Detect a rule whose quoting was eaten before Grudge saw it.
 *
 * PowerShell 5.1 strips embedded double quotes when it forwards a native
 * argument, so `~ "npm test"` arrives as `~ npm` and compiles to the far
 * broader `$contains: "npm"` with no warning. The documented grammar requires a
 * JSON string after `~` / `under`, so a bare token there means the value was
 * mangled; refuse instead of silently widening the rule.
 */
function quotingHazard(source) {
  const { parts, balanced } = tokenize(source);
  if (!balanced) return "unbalanced";
  const isQuoted = (token) => typeof token === "string" && token.startsWith('"');
  for (let index = 0; index < parts.length - 1; index += 1) {
    const token = parts[index];
    const next = parts[index + 1];
    if (token === "~") {
      if (!isQuoted(next)) return "unquoted";
      continue;
    }
    if (token !== "under") continue;
    // `under` is a field name only directly after `where`/`and`; anywhere else
    // it is the path operator and requires a quoted path.
    const previous = parts[index - 1] ?? "";
    if (previous === "where" || previous === "and") continue;
    if (!isQuoted(next)) return "unquoted";
  }
  return null;
}

/** @param {{rule?: string, why?: string, preventive?: boolean, accept?: boolean, session?: string, root?: string}} options */
export async function propose(options = {}) {
  const source = options.rule;
  const why = options.why;
  const root = options.root ?? process.cwd();
  if (!source || !why) return rejection("rule and why are required");
  // PowerShell 5.1 drops embedded double quotes when it forwards a native
  // argument, so `~ "npm test"` silently arrives as `~ npm`. Detect that loss
  // instead of compiling a rule that is quietly broader than the author meant.
  if (!options.fromStdin) {
    const hazard = quotingHazard(source);
    if (hazard === "unbalanced") {
      return rejection('unbalanced double quote in --rule: a shell may have stripped it. Pass the rule with --rule-stdin to avoid shell quoting');
    }
    if (hazard === "unquoted") {
      return rejection('unquoted value after "~" or "under": shell quoting may have been stripped. Quote the value, or pass the rule with --rule-stdin');
    }
  }
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
      if (rule.kind === "call_shape" && rule.polarity === "must") {
        return rejection(`over-broad rule: control session ${control.id} never makes the required call, so the rule would block every other tool call; narrow it with arguments or record a session that makes the call`);
      }
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
  try { await appendEvent(root, { type: "proposal", sessionId: target.id, scarId: id }); } catch { /* reporting is advisory */ }
  if ((await loadConfig(root)).autoAccept === true || options.accept === true) {
    const promoted = await accept(id, { root });
    return { ...promoted, pending: false, enforced: true, autoAccepted: true, record };
  }
  return {
    // A pending scar is not enforced. Never report it as accepted: a model
    // reading this result must not be able to claim the rule is active.
    accepted: false,
    pending: true,
    enforced: false,
    status: "pending",
    id,
    english: record.english,
    run: `grudge accept ${id}`,
    record,
  };
}

export { english };
