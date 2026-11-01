#!/usr/bin/env node
// OWNER: integrator
/**
 * Prove the package that `npm publish` would ship is the implementation that
 * was tested.
 *
 * The 0.2.1 incident: `dist/` is gitignored, `npm publish` had no `prepack`
 * step, and the tarball was packed from a stale bundle built before the P0-1
 * fix. The published CLI registered `node .grudge/bin/grudge.mjs` (relative)
 * and its `doctor` had no `hook paths` check, even though the repository source
 * was already fixed.
 *
 * This script checks the release metadata, builds, packs, installs that exact
 * tarball into a clean external directory, and exercises the installed
 * artifact: tarball contents, dependency closure, byte identity with the
 * build, absolute hook registration, `doctor`, blocking from the project root
 * and a nested directory, and `stats`/`report` agreement. It never contacts a
 * registry and never publishes.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..", "..");

// The tarball is a whitelist (`files` in package.json); these are the paths the
// installed CLI needs at runtime.
const REQUIRED_TARBALL_FILES = ["package.json", "README.md", "LICENSE", "dist/grudge.mjs", "src/cli.js", "src/version.js"];
const DEV_ONLY_TARBALL = /^(?:test|scripts|node_modules|coverage|\.github|\.claude|\.grudge)\//;

const checks = [];

function record(name, ok, detail = "") {
  checks.push({ name, ok });
  process.stdout.write(`${ok ? "[ok]" : "[fail]"} ${name}${detail ? `: ${detail}` : ""}\n`);
  return ok;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function run(command, args, { cwd = packageRoot, input, shell = false } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: "utf8", windowsHide: true, shell });
  if (result.error) throw result.error;
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * Candidate npm CLI entry scripts, most reliable first.
 *
 * `npm pack` / `npm install` must run without a shell. On Windows `npm` is a
 * `.cmd` shim, and handing a concatenated command string to `cmd.exe` is where
 * quoting bugs (and injection, if an argument ever stops being a constant)
 * live. The CLI JavaScript entry is the program the shim starts; running it
 * with `process.execPath` keeps every argument a separate argv element.
 */
export function npmCliCandidates({ execPath = process.execPath, env = process.env, platform = process.platform } = {}) {
  const candidates = [];
  const execpath = env.npm_execpath;
  if (execpath && /\.(?:c|m)?js$/i.test(execpath)) candidates.push(execpath);
  const nodeDir = dirname(execPath);
  candidates.push(join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"));
  if (platform !== "win32") candidates.push(join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"));
  return [...new Set(candidates.map((value) => resolve(value)))];
}

/** Run npm without a shell, as a node script with an argument array. */
export function runNpm(args, options = {}) {
  const cli = options.cli ?? npmCliCandidates().find((candidate) => existsSync(candidate));
  if (!cli) {
    throw new Error(`cannot locate the npm CLI next to ${process.execPath}; run this gate with npm run release:verify`);
  }
  return run(process.execPath, [cli, ...args], { cwd: options.cwd ?? packageRoot });
}

function parsePackJson(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error(`cannot parse npm pack output:\n${stdout}`);
  return JSON.parse(stdout.slice(start, end + 1))[0];
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Runtime dependency closure of the built bundle.
 *
 * The build emits lazy `await __import("...")` calls. If that format ever
 * changes, discovery finds nothing and a bare-import check alone would pass
 * vacuously, so zero discovered specifiers is a failure in its own right.
 */
export function runtimeDependencyCheck(bundleText, declared = []) {
  const specifiers = [...String(bundleText).matchAll(/await __import\("([^"]+)"/g)].map((match) => match[1]);
  const bare = [...new Set(specifiers.filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("node:") && !specifier.startsWith("file:")))];
  const ok = specifiers.length > 0 && bare.length === 0 && declared.length === 0;
  const detail = specifiers.length === 0
    ? "no runtime imports discovered (bundle format changed?)"
    : declared.length ? `declares ${declared.join(", ")}` : bare.length ? `imports ${bare.join(", ")}` : "node builtins only";
  return { ok, detail, specifiers, bare, declared };
}

/**
 * Every release surface must report one version. Nothing here is pinned: the
 * check compares the surfaces to each other, so bumping the version never
 * requires editing this file.
 */
async function checkMetadata() {
  const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(packageRoot, "package-lock.json"), "utf8"));
  const sourceVersion = (await readFile(join(packageRoot, "src", "version.js"), "utf8")).match(/VERSION\s*=\s*["']([^"']+)["']/)?.[1] ?? "missing";
  const pyproject = await readFile(join(repoRoot, "pyproject.toml"), "utf8");
  const pyVersion = pyproject.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1] ?? "missing";
  const changelog = await readFile(join(repoRoot, "CHANGELOG.md"), "utf8");
  const readme = await readFile(join(repoRoot, "README.md"), "utf8");
  const gitignore = await readFile(join(repoRoot, ".gitignore"), "utf8");

  const versions = {
    "package.json": String(pkg.version),
    "package-lock.json": String(lock.version),
    "package-lock root": String(lock?.packages?.[""]?.version),
    "src/version.js": sourceVersion,
    "pyproject.toml": pyVersion,
  };
  const expected = versions["package.json"];
  const drifted = Object.entries(versions)
    .filter(([, value]) => value !== expected)
    .map(([name, value]) => `${name}=${value}`);
  record("metadata: every release surface reports one version", drifted.length === 0, drifted.length ? `${drifted.join(", ")} (expected ${expected})` : expected);
  record("metadata: CHANGELOG documents this version", changelog.includes(`## ${expected} `), `## ${expected}`);

  const version = escapeRegExp(expected);
  const published = new RegExp(`Grudge CLI \`${version}\` is published in both public package registries`);
  const prepared = new RegExp(`source version \`${version}\` is being prepared`);
  record("metadata: README states the release status", published.test(readme) || prepared.test(readme), prepared.test(readme) ? "prepared" : published.test(readme) ? "published" : "missing");

  const prepublish = String(pkg.scripts?.prepublishOnly ?? "");
  record("publish gate runs the tests and this verifier", prepublish.includes("test") && prepublish.includes("release:verify"), prepublish || "missing");
  record("build output stays out of version control", /^dist\/$/m.test(gitignore), "dist/ is gitignored");

  return { pkg, expected };
}

async function main() {
  const meta = await checkMetadata();
  if (checks.some((check) => !check.ok)) return finish();

  const work = await mkdtemp(join(tmpdir(), "grudge-release-"));
  try {
    const build = run(process.execPath, [join(packageRoot, "scripts", "build.mjs")]);
    if (!record("build", build.code === 0, build.stderr.trim())) return finish();

    const packed = runNpm(["pack", "--json", "--pack-destination", work]);
    if (!record("pack", packed.code === 0, packed.stderr.trim().split("\n")[0])) return finish();
    const info = parsePackJson(packed.stdout);
    // An unexpected `npm pack --json` shape must fail the gate, not throw a
    // TypeError that hides which check broke.
    if (!record("pack reports a tarball filename and version", Boolean(info?.filename) && typeof info?.version === "string", info?.filename ?? "no filename in npm pack output")) return finish();
    const tarball = info.filename.startsWith("/") || /^[A-Za-z]:/.test(info.filename)
      ? info.filename
      : join(work, info.filename);
    const bundle = await readFile(join(packageRoot, "dist", "grudge.mjs"), "utf8");
    const packedPaths = new Set((info.files ?? []).map((file) => file.path));

    const missing = REQUIRED_TARBALL_FILES.filter((path) => !packedPaths.has(path));
    record("tarball contains the required runtime files", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : `${packedPaths.size} files`);
    const devOnly = [...packedPaths].filter((path) => DEV_ONLY_TARBALL.test(path) || /\.test\.js$/.test(path));
    record("tarball excludes development-only files", devOnly.length === 0, devOnly.slice(0, 5).join(", ") || "none");
    record("tarball reports the release version", info.version === meta.expected, `grudge-cli@${info.version}`);
    const packedDist = (info.files ?? []).find((file) => file.path === "dist/grudge.mjs");
    const localBundleSize = Buffer.byteLength(bundle, "utf8");
    // Byte size, not just presence: proves the tarball carries the bundle this
    // run just built rather than an older file that happens to share its name.
    record("tarball is the built bundle", packedDist?.size === localBundleSize, `${info.filename} dist/grudge.mjs ${packedDist?.size ?? "missing"} bytes, built ${localBundleSize} bytes`);
    record("bundle registers absolute runtimes", /process\.execPath/.test(bundle) && /shellQuote\(process\.execPath\)/.test(bundle), "absolute runtimeCommand present");
    record("bundle ships the hook paths check", bundle.includes("hook paths"), "\"hook paths\" doctor check present");

    const consumer = join(work, "consumer");
    await mkdir(consumer, { recursive: true });
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "grudge-release-consumer", private: true, version: "0.0.0" }, null, 2));
    const install = runNpm(["install", tarball, "--no-audit", "--no-fund", "--no-save"], { cwd: consumer });
    if (!record("install tarball into a clean directory", install.code === 0, install.stderr.trim().split("\n")[0])) return finish();

    const runtime = join(consumer, "node_modules", "grudge-cli", "dist", "grudge.mjs");
    const installedText = await readFile(runtime, "utf8");
    record("installed bundle is the freshly built bundle", (await sha256(runtime)) === (await sha256(join(packageRoot, "dist", "grudge.mjs"))), "sha256 match");
    record("installed runtime does not reference the repository", !installedText.includes(packageRoot) && !installedText.includes(repoRoot), "no absolute repository paths");
    const closure = runtimeDependencyCheck(installedText, Object.keys(meta.pkg.dependencies ?? {}));
    record("runtime needs no undeclared dependency", closure.ok, closure.detail);

    const version = run(process.execPath, [runtime, "--version"]);
    record("installed runtime reports the package version", version.code === 0 && version.stdout.trim() === `grudge ${info.version}`, version.stdout.trim());

    const project = join(work, "project");
    await mkdir(project, { recursive: true });
    const setup = run(process.execPath, [runtime, "setup", "--cwd", project, "--yes", "--agents", "claude-code", "--scope", "repo"]);
    if (!record("setup", setup.code === 0, setup.stderr.trim().split("\n")[0])) return finish();

    // Claude Code runs the copy that setup wrote into the project, not the
    // package's own dist. The install anchor that resolves the project root and
    // the layered rule sets only exists at `.grudge/bin/grudge.mjs`, so every
    // runtime check below must use the installed copy.
    const installed = join(project, ".grudge", "bin", "grudge.mjs");
    if (!record("installed runtime exists", await exists(installed), installed)) return finish();

    const settings = JSON.parse(await readFile(join(project, ".claude", "settings.json"), "utf8"));
    const command = settings?.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? "";
    const scriptToken = String(command).split('"').filter((token) => token.endsWith("grudge.mjs"))[0] ?? "";
    const registrationOk = command.startsWith('"') && isAbsolute(scriptToken) && scriptToken.startsWith(project);
    record("registered hook command uses absolute paths", registrationOk, command);
    const config = JSON.parse(await readFile(join(project, ".grudge", "config.json"), "utf8"));
    record("config records the absolute runtime command", typeof config.runtimeCommand === "string" && config.runtimeCommand.includes(scriptToken), config.runtimeCommand ?? "missing");

    const doctor = run(process.execPath, [installed, "doctor", "--json", "--cwd", project]);
    const report = JSON.parse(doctor.stdout || "{}");
    const hookPaths = (report.checks ?? []).find((check) => check.name === "hook paths");
    record("doctor passes hook paths", hookPaths?.ok === true, hookPaths?.detail ?? "missing check");

    const sessionPayload = JSON.stringify({ session_id: "release-check", cwd: project, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo hello" }, tool_response: "hello" });
    run(process.execPath, [installed, "hook", "PostToolUse"], { cwd: project, input: sessionPayload });
    const propose = run(process.execPath, [installed, "propose", "--cwd", project, "--rule-stdin", "--why", "release verification", "--preventive", "--accept"], {
      cwd: project,
      input: 'never call shell where command ~ "GRUDGE_RELEASE_TOKEN"\n',
    });
    record("propose and accept", propose.code === 0 && /accepted and enforced/.test(propose.stdout), propose.stdout.split("\n").find((line) => line.includes("Proposal")) ?? "");

    const nested = join(project, "nested");
    await mkdir(nested, { recursive: true });
    const blocked = (cwd) => run(process.execPath, [installed, "hook", "PreToolUse"], {
      cwd,
      input: JSON.stringify({ session_id: `release-${cwd.length}`, cwd, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "echo GRUDGE_RELEASE_TOKEN" } }),
    });
    const fromRoot = blocked(project);
    const fromNested = blocked(nested);
    record("blocks from the project root", fromRoot.code === 2 && fromRoot.stdout.includes('"permissionDecision":"deny"'), `exit ${fromRoot.code}`);
    record("blocks from a nested directory", fromNested.code === 2 && fromNested.stdout.includes('"permissionDecision":"deny"'), `exit ${fromNested.code}`);
    record("block reason is visible", /Do not retry; change approach or ask the user\./.test(fromNested.stdout) && /grudge: blocked by scar-/.test(fromNested.stderr), fromNested.stderr.trim().slice(0, 80));

    const stats = JSON.parse(run(process.execPath, [installed, "stats", "--json", "--cwd", project]).stdout || "{}");
    const lifetime = JSON.parse(run(process.execPath, [installed, "report", "--json", "--cwd", project]).stdout || "{}").lifetime ?? {};
    record("stats and report agree", stats.blocks === lifetime.blocked && stats.blocks >= 2, `stats.blocks=${stats.blocks} report.blocked=${lifetime.blocked}`);

    const verify = run(process.execPath, [installed, "verify", "--cwd", project]);
    const verifyLine = verify.stdout.split("\n").find((line) => line.startsWith("Result:")) ?? verify.stdout.trim().split("\n").at(-2) ?? "";
    // Do not pin another command's check count here: adding a check to `verify`
    // must not fail the release gate. The contract is exit 0 plus a PASS line.
    record("installed runtime verifies its own guard", verify.code === 0 && /^Result: PASS \(\d+\/\d+ checks\)$/m.test(verify.stdout), verifyLine.trim());

    return finish({ tarball, version: info.version });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function finish(extra = {}) {
  const failed = checks.filter((check) => !check.ok).length;
  process.stdout.write(`\nResult: ${failed ? `FAIL (${failed}/${checks.length} checks failed)` : `PASS (${checks.length}/${checks.length} checks)`}\n`);
  if (extra.tarball) process.stdout.write(`Tarball: ${extra.tarball} (grudge-cli@${extra.version}, removed with the temporary directory)\n`);
  process.stdout.write("Nothing was published.\n");
  if (failed) process.exitCode = 1;
  return undefined;
}

/**
 * Run the gate when executed directly. Importing this file (the tests do) must
 * not start a build, a pack and an install. Anything unexpected counts as
 * direct invocation so the gate can never be skipped by accident.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return true;
  try {
    return realpathSync(entry).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return true;
  }
}

if (invokedDirectly()) await main();
