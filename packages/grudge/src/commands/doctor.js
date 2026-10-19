// OWNER: lane-c
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseJson } from "../installer/json-merge.js";

/** Inspect an installed repository without changing it. */
export async function doctor(options = {}) {
  const root = resolve(options.cwd ?? process.cwd());
  const configPath = join(root, ".grudge/config.json");
  const runtimePath = join(root, ".grudge/bin/grudge.mjs");
  const config = await readJson(configPath);
  const checks = [];
  checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 18, detail: process.version });
  checks.push({ name: "config", ok: Boolean(config), detail: config ? "parse OK" : "missing or invalid" });
  const runtime = await readOptional(runtimePath);
  checks.push({ name: "runtime", ok: Boolean(runtime), detail: runtime ? "present" : "missing" });
  if (config?.scriptHash && runtime) {
    const hash = createHash("sha256").update(runtime).digest("hex");
    checks.push({ name: "script hash", ok: hash === config.scriptHash, detail: `${hash.slice(0, 12)} vs ${String(config.scriptHash).slice(0, 12)}` });
  } else checks.push({ name: "script hash", ok: false, detail: "not recorded" });
  let hooksPresent = false;
  for (const path of [join(root, ".claude/settings.json"), join(root, ".claude/settings.local.json")]) {
    const text = await readOptional(path);
    if (!text) continue;
    try {
      const settings = parseJson(text, path);
      hooksPresent ||= Boolean(settings.hooks);
      checks.push({ name: `settings ${path}`, ok: true, detail: "parse OK" });
    } catch (error) { checks.push({ name: `settings ${path}`, ok: false, detail: error.message }); }
  }
  checks.push({ name: "hooks", ok: hooksPresent || !(config?.adapters ?? []).includes("claude-code"), detail: hooksPresent ? "present" : "not configured" });
  const compiled = await readJson(join(root, ".grudge/compiled.json"));
  checks.push({ name: "compiled.json", ok: compiled === null || (compiled.version === 1 && Array.isArray(compiled.rules)), detail: compiled === null ? "not present" : "valid" });
  const gitignore = await readOptional(join(root, ".gitignore"));
  const ignored = [".grudge/session/", ".grudge/stats.json", ".grudge/*.log"].filter((line) => gitignore?.split(/\r?\n/).includes(line));
  checks.push({ name: ".gitignore", ok: ignored.length === 3, detail: `${ignored.length}/3 entries` });
  const result = { ok: checks.every((check) => check.ok), root, checks };
  if (options.print !== false) for (const check of checks) process.stdout.write(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}\n`);
  return result;
}

async function readJson(path) {
  const text = await readOptional(path);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function readOptional(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
