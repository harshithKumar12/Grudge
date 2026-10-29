// OWNER: lane-c
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT_EXTENSION = /\.(?:c|m)?js$|\.(?:py|sh|ps1)$/i;

/** Resolve the script paths a status-line command hands to its interpreter. */
export function statusLineScripts(command, { cwd = process.cwd(), home = homedir() } = {}) {
  if (typeof command !== "string") return [];
  const expanded = command
    .replace(/\$\{CLAUDE_PROJECT_DIR(?::-?[^}]*)?\}/g, cwd)
    .replace(/\$CLAUDE_PROJECT_DIR\b/g, cwd)
    .replace(/\$\{?HOME\}?/g, home);
  const paths = [];
  for (const token of tokenize(expanded)) {
    if (token.startsWith("-") || !SCRIPT_EXTENSION.test(token)) continue;
    paths.push(resolve(cwd, token.startsWith("~") ? join(home, token.slice(1)) : token));
  }
  return [...new Set(paths)];
}

/** Return the scripts a status-line command references that are missing on disk. */
export async function missingStatusLineScripts(command, options = {}) {
  const missing = [];
  for (const path of statusLineScripts(command, options)) {
    try {
      await access(path);
    } catch {
      missing.push(path);
    }
  }
  return missing;
}

function tokenize(text) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(text))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}
