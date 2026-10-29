// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verify } from "../src/commands/verify.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(packageRoot, "dist", "grudge.mjs");

const CHECKS = ["install", "runtime", "capture", "propose", "accept", "block", "allow", "fail open", "stats", "report"];

function run(args, { cwd = packageRoot, input = "" } = {}) {
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

test("grudge verify proves the installed guard blocks a real call", async () => {
  const result = await verify({ runtimeScript: dist, print: false });
  assert.equal(result.ok, true, JSON.stringify(result.checks, null, 2));
  assert.deepEqual(result.checks.map((check) => check.name), CHECKS);
  assert.equal(result.kept, false, "a passing run must clean up its temp project");
  await assert.rejects(access(result.root), "the temp project should be removed after a pass");
});

test("grudge verify --keep leaves the temp project for inspection", async () => {
  const result = await verify({ runtimeScript: dist, print: false, keep: true });
  assert.equal(result.ok, true, JSON.stringify(result.checks, null, 2));
  assert.equal(result.kept, true);
  try {
    const compiled = JSON.parse(await readFile(join(result.root, "project/.grudge/compiled.json"), "utf8"));
    assert.equal(compiled.rules.length, 1);
    assert.equal(compiled.rules[0].mode, "block");
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test("grudge verify fails and keeps its project when the runtime cannot block", async () => {
  const base = await mkdtemp(join(tmpdir(), "grudge-verify-broken-"));
  const broken = join(base, "broken.mjs");
  await writeFile(broken, "process.exit(1);\n");
  const result = await verify({ runtimeScript: broken, print: false });
  assert.equal(result.ok, false);
  assert.equal(result.kept, true);
  assert.ok(result.checks.some((check) => !check.ok), "a broken runtime must fail at least one check");
  assert.ok(!result.checks.some((check) => check.name === "block" && check.ok), "blocking must never be reported as proven");
  await rm(result.root, { recursive: true, force: true });
  await rm(base, { recursive: true, force: true });
});

test("grudge verify --json is machine-readable and the CLI exits on the result", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "grudge-verify-cli-"));
  try {
    const result = await run(["verify", "--json", "--keep"], { cwd });
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kept, true);
    assert.deepEqual(parsed.checks.map((check) => check.name), CHECKS);
    await rm(parsed.root, { recursive: true, force: true });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("unknown options fail with the list of valid ones instead of being ignored", async () => {
  const result = await run(["stats", "--bogus"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /unknown option --bogus/);
  assert.match(result.stderr, /Valid options: .*--preventive/);
  assert.match(result.stderr, /Valid options: .*--accept/);
  assert.match(result.stderr, /Valid options: .*--keep/);
});

test("help lists verify and the propose options that were previously invisible", async () => {
  const result = await run(["--help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /verify\s+Prove the installed guard blocks a real call/);
  assert.match(result.stdout, /--rule-stdin/);
  assert.match(result.stdout, /--preventive/);
  assert.match(result.stdout, /--accept/);
  assert.match(result.stdout, /--keep/);
});
