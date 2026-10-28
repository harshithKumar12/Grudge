// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/version.js";
import { MANAGED_BEGIN } from "../src/installer/managed-block.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist", "grudge.mjs");

function run(args, { cwd = root, input = "" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dist, ...args], { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function scratch() {
  return mkdtemp(join(tmpdir(), "grudge-build-"));
}

test("built runtime reports the package version", async () => {
  const result = await run(["--version"]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), `grudge ${VERSION}`);
});

test("built runtime evaluates a hook payload fail-open", async () => {
  const cwd = await scratch();
  const result = await run(["hook", "pre-tool-use"], {
    cwd,
    input: JSON.stringify({
      session_id: "build-integrity",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hello" },
      cwd,
    }),
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("built runtime can run setup end to end", async () => {
  const cwd = await scratch();
  const result = await run(["--cwd", cwd, "setup", "--yes", "--agents", "claude-code", "--scope", "repo", "--dry-run"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Files: 5 changed/);
  assert.ok((await readFile(join(cwd, "CLAUDE.md"), "utf8").catch(() => "")).includes(MANAGED_BEGIN) === false);
});

test("build fails when a relative import is missing or has no matching export", async () => {
  const packageRoot = root;

  const missingExport = await scratch();
  await cp(join(packageRoot, "src"), join(missingExport, "src"), { recursive: true });
  await cp(join(packageRoot, "scripts"), join(missingExport, "scripts"), { recursive: true });
  await cp(join(packageRoot, "package.json"), join(missingExport, "package.json"));
  await appendFile(join(missingExport, "src", "cli.js"), '\nimport { definitelyMissing } from "./core/store.js";\n');
  const exportFailure = await runBuild(missingExport);
  assert.equal(exportFailure.code, 1);
  assert.match(exportFailure.stderr, /definitelyMissing/);
  assert.match(exportFailure.stderr, /does not export|unresolved imports/);

  const missingModule = await scratch();
  await cp(join(packageRoot, "src"), join(missingModule, "src"), { recursive: true });
  await cp(join(packageRoot, "scripts"), join(missingModule, "scripts"), { recursive: true });
  await cp(join(packageRoot, "package.json"), join(missingModule, "package.json"));
  await appendFile(join(missingModule, "src", "cli.js"), '\nimport { nope } from "./core/does-not-exist.js";\n');
  const moduleFailure = await runBuild(missingModule);
  assert.equal(moduleFailure.code, 1);
  assert.match(moduleFailure.stderr, /cannot read module|unresolved imports/);
});

function runBuild(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build.mjs"], { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
