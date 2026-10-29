// OWNER: lane-a
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { commands } from "./commands/index.js";
import { runHook } from "./commands/hook.js";
import { VERSION } from "./version.js";
import { jsonOutput, renderCommand, renderError } from "./output.js";

const SHORT_FLAGS = {
  "-h": ["help", false],
  "-v": ["version", false],
  "-j": ["json", false],
  "-y": ["yes", false],
  "-a": ["agents", true],
  "-s": ["scope", true],
  "-c": ["cwd", true],
};

// Every option the Node CLI understands. Anything else is an error, because a
// silently ignored flag is how a model concludes a rule is active when it is not.
const KNOWN_FLAGS = [
  "help", "version", "json", "yes", "agents", "scope", "cwd",
  "rule", "rulestdin", "why", "preventive", "accept", "session", "lifetime",
  "strict", "dryrun", "keep", "ascii", "debug",
];

const USAGE = `Grudge v${VERSION} - local guards for recurring agent mistakes

Usage: grudge <command> [options]

Commands:
  (none)          Show status for the current directory
  verify          Prove the installed guard blocks a real call
  doctor          Check this install and report problems
  setup           Install the guard into this repo (alias: init)
  statusline      One-line status for your prompt
  stats           Show blocked, warned, and token totals
  report          Show session or lifetime totals
  propose         Record a mistake as a pending Scar
  scars           List, show, accept, reject, or disable Scars
  accept          Accept a pending Scar by id
  uninstall       Remove the guard from this repo
  hook <event>    Hook entry point used by Claude Code

Options:
  -h, --help      Show this help
  -v, --version   Show the version
  -j, --json      Machine-readable output
  -y, --yes       Skip prompts (setup)
  -a, --agents    Comma-separated agent list (setup)
  -s, --scope     repo or user (setup)
  -c, --cwd       Run against another directory
  --keep          Keep the temporary project (verify)

Propose options:
  --rule <dsl>    Rule text, for example: never call shell where command ~ "rm -rf"
  --rule-stdin    Read the rule from stdin (avoids shell quoting)
  --why <text>    One sentence explaining the mistake
  --preventive    Allow a rule that has not fired in the recorded session yet
  --accept        Accept immediately instead of waiting for review

Python engine (pip install grudge-cli): capture, compile, shrink, admit, run, demo
`;

/** Parse the small, deliberately dependency-free Grudge command line. */
export function parseArgs(argv) {
  const positional = [];
  const options = {};
  const flags = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const short = SHORT_FLAGS[value];
    if (short) {
      const [name, takesValue] = short;
      const next = argv[index + 1];
      if (takesValue && next && !next.startsWith("-")) options[name] = argv[++index];
      else options[name] = true;
      flags.push(name);
      continue;
    }
    if (!value.startsWith("--")) {
      if (value.startsWith("-") && value.length > 1) flags.push(value.replace(/^-+/, ""));
      else positional.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    const name = (equals === -1 ? value.slice(2) : value.slice(2, equals)).replaceAll("-", "");
    flags.push(name);
    if (equals !== -1) options[name] = value.slice(equals + 1);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) options[name] = argv[++index];
    else options[name] = true;
  }
  return { command: positional[0] ?? "", positional: positional.slice(1), options, flags };
}

/** Reject unknown options with the full list of valid ones. */
function unknownOptionError(flags = []) {
  const unknown = flags.filter((name) => !KNOWN_FLAGS.includes(name));
  if (!unknown.length) return null;
  return Object.assign(
    new Error(`unknown option ${unknown.map((name) => `--${name}`).join(", ")}. Valid options: ${KNOWN_FLAGS.map((name) => `--${name}`).join(", ")}`),
    { exitCode: 2 },
  );
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function rootOptions(options) {
  return { cwd: resolve(options.cwd ?? process.cwd()), root: resolve(options.cwd ?? process.cwd()) };
}

/** Execute parsed arguments and return the process exit code. */
export async function dispatch(parsed, { stdin = readStdin } = {}) {
  const { command, positional, options } = parsed;
  const unknown = unknownOptionError(parsed.flags);
  if (unknown) throw unknown;
  const root = rootOptions(options);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
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
    result = await commands.propose({ ...root, rule, why: options.why, preventive: Boolean(options.preventive), accept: Boolean(options.accept), session: options.session });
  } else if (command === "accept") {
    if (!positional[0]) throw Object.assign(new Error("usage: grudge accept <id>"), { exitCode: 2 });
    result = await commands.accept(positional[0], { root: root.root });
  } else if (command === "scars") {
    result = await commands.scars(positional[0] ?? "list", { root: root.root, id: positional[1] });
  } else if (command === "stats") {
    result = await commands.stats({ ...root, print: false, json: true });
  } else if (command === "report") {
    result = await commands.report({ ...root, session: options.session, lifetime: options.lifetime, json: true, print: false });
  } else if (command === "statusline") {
    const line = await commands.statusline({ ...root, print: false, session: options.session });
    if (line) process.stdout.write(`${line}\n`);
    return 0;
  } else if (command === "setup" || command === "init") {
    result = await commands.setup({ ...root, yes: Boolean(options.yes), dryRun: Boolean(options.dryrun), scope: options.scope, agents: options.agents ? String(options.agents).split(",").filter(Boolean) : [], print: false });
  } else if (command === "doctor") {
    result = await commands.doctor({ ...root, print: false });
  } else if (command === "verify") {
    const verified = await commands.verify({ keep: Boolean(options.keep), print: !options.json });
    if (options.json) process.stdout.write(jsonOutput(verified));
    return verified.ok ? 0 : 1;
  } else if (command === "uninstall") {
    result = await commands.uninstall({ ...root, print: false });
  } else if (["capture", "demo", "shrink", "admit", "run"].includes(command)) {
    process.stderr.write("This command is in the Python engine. Install it with: pip install grudge-cli\n");
    return 2;
  } else {
    throw Object.assign(new Error("usage: grudge <hook|propose|accept|scars|stats|report|statusline|setup|init|doctor|uninstall>"), { exitCode: 2 });
  }
  if (options.json) process.stdout.write(jsonOutput(result));
  else process.stdout.write(renderCommand(command, result, options));
  if (command === "scars" && positional[0] === "show" && !result?.pending && !result?.scar) return 1;
  if (command === "propose" && result?.error) return 1;
  if (command === "accept" && result?.error) return 1;
  if (command === "doctor" && result?.ok === false) {
    const notInstalled = !result.checks?.find((check) => check.name === "config")?.ok
      && !result.checks?.find((check) => check.name === "runtime")?.ok;
    if (!notInstalled || options.strict) return 1;
  }
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
    if (argv.includes("--json")) process.stderr.write(jsonOutput({ error: message }));
    else {
      process.stderr.write(renderError(error, { command: argv[0] || "command", ascii: argv.includes("--ascii") }));
      if (argv.includes("--debug") && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
    }
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

async function printStatus(root, options = {}) {
  let result;
  try { result = await commands.doctor({ cwd: root, print: false }); } catch (error) { result = { ok: false, checks: [] }; }
  const check = (name) => result.checks.find((item) => item.name === name);
  process.stdout.write(options.json ? jsonOutput(result) : renderCommand("status", result, options));
  return 0;
}


if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
