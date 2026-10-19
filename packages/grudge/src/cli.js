// OWNER: lane-a
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

let runtime;
async function loadRuntime() {
  if (runtime) return runtime;
  const sourceRoot = import.meta.url.endsWith("/dist/grudge.mjs") ? "../src" : ".";
  const [commandModule, hookModule] = await Promise.all([
    import(new URL(`${sourceRoot}/commands/index.js`, import.meta.url)),
    import(new URL(`${sourceRoot}/commands/hook.js`, import.meta.url)),
  ]);
  runtime = { commands: commandModule.commands, runHook: hookModule.runHook };
  return runtime;
}

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
  const { commands, runHook } = await loadRuntime();
  const root = rootOptions(options);
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
    if (!options.rule || !options.why) throw Object.assign(new Error("usage: grudge propose --rule <dsl> --why <sentence>"), { exitCode: 2 });
    result = await commands.propose({ ...root, rule: options.rule, why: options.why, preventive: Boolean(options.preventive), session: options.session });
  } else if (command === "accept") {
    if (!positional[0]) throw Object.assign(new Error("usage: grudge accept <id>"), { exitCode: 2 });
    result = await commands.accept(positional[0], { root: root.root });
  } else if (command === "scars") {
    result = await commands.scars(positional[0] ?? "list", { root: root.root, id: positional[1] });
  } else if (command === "stats") {
    result = await commands.stats({ ...root, print: false, json: true });
  } else if (command === "statusline") {
    const line = await commands.statusline({ ...root, print: false });
    if (line) process.stdout.write(`${line}\n`);
    return 0;
  } else if (command === "setup") {
    result = await commands.setup({ ...root, yes: Boolean(options.yes), dryRun: Boolean(options.dryrun), scope: options.scope, agents: options.agents ? String(options.agents).split(",").filter(Boolean) : [], print: false });
  } else if (command === "doctor") {
    result = await commands.doctor({ ...root, print: false });
  } else if (command === "uninstall") {
    result = await commands.uninstall({ ...root, print: false });
  } else {
    throw Object.assign(new Error("usage: grudge <hook|propose|accept|scars|stats|statusline|setup|doctor|uninstall>"), { exitCode: 2 });
  }
  process.stdout.write(outputJson(result));
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
    process.stderr.write(`${outputJson({ error: message })}`);
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
