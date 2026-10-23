// OWNER: lane-a
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { commands } from "./commands/index.js";
import { runHook } from "./commands/hook.js";
import { VERSION } from "./version.js";

/** Parse the small, deliberately dependency-free Grudge command line. */
export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    const name = (equals === -1 ? value.slice(2) : value.slice(2, equals)).replaceAll("-", "");
    if (equals !== -1) options[name] = value.slice(equals + 1);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) options[name] = argv[++index];
    else options[name] = true;
  }
  return { command: positional[0] ?? "", positional: positional.slice(1), options };
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function rootOptions(options) {
  return { cwd: resolve(options.cwd ?? process.cwd()), root: resolve(options.cwd ?? process.cwd()) };
}

function outputJson(value) {
  return `${JSON.stringify(value ?? null)}\n`;
}

/** Execute parsed arguments and return the process exit code. */
export async function dispatch(parsed, { stdin = readStdin } = {}) {
  const { command, positional, options } = parsed;
  const root = rootOptions(options);
  if (options.version || command === "version") {
    process.stdout.write(`grudge ${VERSION}\n`);
    return 0;
  }
  if (!command) return printStatus(root.root);
  if (command === "hook") {
    const event = positional[0];
    if (!event) throw Object.assign(new Error("usage: grudge hook <event>"), { exitCode: 2 });
    const result = await runHook(event, await stdin());
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return Number.isInteger(result.code) ? result.code : 0;
  }
  let result;
  if (command === "propose") {
    if ((!options.rule && !options.rulestdin) || !options.why) throw Object.assign(new Error("usage: grudge propose --rule <dsl> --why <sentence>"), { exitCode: 2 });
    const rule = options.rulestdin ? await stdin() : options.rule;
    result = await commands.propose({ ...root, rule, why: options.why, preventive: Boolean(options.preventive), session: options.session });
  } else if (command === "accept") {
    if (!positional[0]) throw Object.assign(new Error("usage: grudge accept <id>"), { exitCode: 2 });
    result = await commands.accept(positional[0], { root: root.root });
  } else if (command === "scars") {
    result = await commands.scars(positional[0] ?? "list", { root: root.root, id: positional[1] });
  } else if (command === "stats") {
    result = await commands.stats({ ...root, print: false, json: true });
  } else if (command === "report") {
    result = await commands.report({ ...root, session: options.session, lifetime: options.lifetime, json: Boolean(options.json), print: false });
  } else if (command === "statusline") {
    const line = await commands.statusline({ ...root, print: false, session: options.session });
    if (line) process.stdout.write(`${line}\n`);
    return 0;
  } else if (command === "setup" || command === "init") {
    result = await commands.setup({ ...root, yes: Boolean(options.yes), dryRun: Boolean(options.dryrun), scope: options.scope, agents: options.agents ? String(options.agents).split(",").filter(Boolean) : [], print: false });
  } else if (command === "doctor") {
    result = await commands.doctor({ ...root, print: false });
  } else if (command === "uninstall") {
    result = await commands.uninstall({ ...root, print: false });
  } else if (["capture", "demo", "shrink", "admit", "run"].includes(command)) {
    process.stderr.write("This command is in the Python engine. Install it with: pip install grudge-cli\n");
    return 2;
  } else {
    throw Object.assign(new Error("usage: grudge <hook|propose|accept|scars|stats|report|statusline|setup|init|doctor|uninstall>"), { exitCode: 2 });
  }
  if (command === "setup" || command === "init") {
    if (options.json) process.stdout.write(outputJson(result));
    else printSetupSummary(result);
  } else if (command === "uninstall") {
    if (options.json) process.stdout.write(outputJson(result));
    else printUninstallSummary(result);
  } else process.stdout.write(outputJson(result));
  if (command === "propose" && result?.accepted === false) return 1;
  if (command === "doctor" && result?.ok === false) return 1;
  return 0;
}

/** CLI entry point; command failures are machine-readable and non-zero. */
export async function main(argv = process.argv.slice(2)) {
  try {
    return await dispatch(parseArgs(argv));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv[0] === "hook") {
      process.stderr.write(`grudge: hook failed; allowed (fail-open): ${message}\n`);
      return 0;
    }
    process.stderr.write(`${outputJson({ error: message })}`);
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

async function printStatus(root) {
  let result;
  try { result = await commands.doctor({ cwd: root, print: false }); } catch (error) { result = { ok: false, checks: [] }; }
  const check = (name) => result.checks.find((item) => item.name === name);
  process.stdout.write([
    `Grudge v${VERSION}`,
    `root: ${root}`,
    `runtime: ${check("runtime")?.ok ? "installed" : "missing"}`,
    `config: ${check("config")?.ok ? "configured" : "missing"}`,
    `doctor: ${result.ok ? "healthy" : "needs attention"}`,
  ].join("\n") + "\n");
  return 0;
}

function printSetupSummary(result) {
  process.stdout.write([
    `Grudge setup v${result.version} ${result.dryRun ? "preview" : "complete"}`,
    `scope: ${result.scope}`,
    `agents: ${result.selected.length ? result.selected.join(", ") : "none"}`,
    `files: ${result.changes.length} changed`,
    "next: run grudge doctor",
  ].join("\n") + "\n");
}

function printUninstallSummary(result) {
  const restored = result.restored.length ? result.restored.map(({ file, action }) => `  ✓ ${action} ${file}`) : ["  none"];
  const removed = result.removed.length ? result.removed.map((path) => `  • ${path}`) : ["  none"];
  process.stdout.write([
    "Grudge uninstall complete",
    `root: ${result.root}`,
    `restored: ${result.restored.length}`,
    ...restored,
    `removed: ${result.removed.length}`,
    ...removed,
  ].join("\n") + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
