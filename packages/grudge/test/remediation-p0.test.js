// OWNER: integrator
/**
 * Black-box regression tests for the four P0 findings and P1-1.
 *
 * Every test installs the guard with the real `setup` command and then drives
 * the installed bundle (`<root>/.grudge/bin/grudge.mjs`) in a child process,
 * exactly the way a host runs a command hook. Nothing here imports the hook
 * handlers directly: a passing test proves the shipped artifact enforces.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// Refresh-proof: an installed-package run overrides this with the runtime it
// actually installed, so the same suite can be replayed outside the checkout.
const cli = process.env.GRUDGE_TEST_CLI ?? join(packageRoot, "dist", "grudge.mjs");

/** Run the CLI (or a copied bundle) and collect its exit code and streams. */
function execute(script, args, { cwd, input = "", env = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, GRUDGE_DISABLE: "", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

const cliRun = (args, options) => execute(cli, args, options);

async function scratch() {
  return mkdtemp(join(tmpdir(), "grudge-p0-"));
}

/** Install into `root` with the real setup command. */
async function install(root, { scope = "repo", home = join(root, ".test-home"), env = {} } = {}) {
  const result = await cliRun(
    ["setup", "--yes", "--scope", scope, "--agents", "claude-code", "--cwd", root],
    { cwd: root, env: { USERPROFILE: home, HOME: home, ...env } },
  );
  assert.equal(result.code, 0, `setup failed: ${result.stderr || result.stdout}`);
  return join(root, ".grudge/bin/grudge.mjs");
}

async function writeRules(root, rules) {
  await mkdir(join(root, ".grudge"), { recursive: true });
  await writeFile(
    join(root, ".grudge/compiled.json"),
    `${JSON.stringify({ version: 1, rules }, null, 2)}\n`,
    "utf8",
  );
}

async function writeConfig(root, value) {
  await mkdir(join(root, ".grudge"), { recursive: true });
  await writeFile(join(root, ".grudge/config.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** A block rule that prohibits the shell command containing `token`. */
function shellRule(id, token, english = `Never run ${token}.`) {
  return {
    id,
    mode: "block",
    kind: "call_shape",
    tool: "shell",
    match: { command: { $contains: token } },
    ordering: { before: "", after: "" },
    taint: { source: "", sink: "" },
    polarity: "never",
    english,
    createdFrom: "test",
  };
}

function bashPayload(cwd, command, sessionId = "p0-session") {
  return {
    session_id: sessionId,
    cwd,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  };
}

function runHook(runtime, event, payload, { cwd, env = {} } = {}) {
  return execute(runtime, ["hook", event], {
    cwd,
    input: JSON.stringify(payload),
    env,
  });
}

test("P0-1: an installed hook blocks from a nested directory and after a simulated cd", async () => {
  const root = await scratch();
  try {
    const runtime = await install(root);
    await writeRules(root, [shellRule("p0-nested", "GRUDGE_TEST_NESTED")]);
    const nested = join(root, "src", "deep");
    await mkdir(nested, { recursive: true });

    // 1. The host runs the hook inside a subdirectory; the payload cwd matches.
    const inside = await runHook(runtime, "PreToolUse", bashPayload(nested, "echo GRUDGE_TEST_NESTED"), { cwd: nested });
    assert.equal(inside.code, 2, `nested hook did not block: ${inside.stderr}`);
    assert.match(inside.stderr, /p0-nested/);

    // 2. The host process cwd moved but the payload still points at the project.
    const fromElsewhere = await runHook(runtime, "PreToolUse", bashPayload(root, "echo GRUDGE_TEST_NESTED"), { cwd: nested });
    assert.equal(fromElsewhere.code, 2);

    // 3. No payload cwd at all: the install root still decides.
    const noCwd = await runHook(runtime, "PreToolUse", { session_id: "p0-no-cwd", tool_name: "Bash", tool_input: { command: "echo GRUDGE_TEST_NESTED" } }, { cwd: nested });
    assert.equal(noCwd.code, 2);

    // 4. A non-matching call is still allowed.
    const allowed = await runHook(runtime, "PreToolUse", bashPayload(nested, "echo safe"), { cwd: nested });
    assert.equal(allowed.code, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("P0-1: a payload cwd outside the install root warns and never redirects enforcement", async () => {
  const root = await scratch();
  const other = await scratch();
  try {
    const runtime = await install(root);
    await writeRules(root, [shellRule("p0-outside", "GRUDGE_TEST_OUTSIDE")]);
    // The other project tries to look like the caller by naming itself in cwd.
    await writeRules(other, [{ ...shellRule("other-rule", "GRUDGE_TEST_OUTSIDE"), english: "other project" }]);

    const result = await runHook(runtime, "PreToolUse", bashPayload(other, "echo GRUDGE_TEST_OUTSIDE"), { cwd: other });
    assert.equal(result.code, 2, "rules from the install root must still block");
    assert.match(result.stderr, /outside the install root/);
    assert.match(result.stderr, /p0-outside/, "the installed rule is the one that fires");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});

test("P0-2: a global install blocks in two unrelated projects", async () => {
  const home = await scratch();
  const projectA = await scratch();
  const projectB = await scratch();
  try {
    const env = { USERPROFILE: home, HOME: home };
    const runtime = await install(home, { scope: "global", home, env });
    await writeRules(home, [shellRule("global-rule", "GRUDGE_TEST_GLOBAL")]);

    for (const [label, project] of [["A", projectA], ["B", projectB]]) {
      const result = await runHook(runtime, "PreToolUse", bashPayload(project, "echo GRUDGE_TEST_GLOBAL", `global-${label}`), { cwd: project, env });
      assert.equal(result.code, 2, `global rules did not block in project ${label}: ${result.stderr}`);
      assert.match(result.stderr, /global-rule/);
      const allowed = await runHook(runtime, "PreToolUse", bashPayload(project, "echo safe", `global-${label}-ok`), { cwd: project, env });
      assert.equal(allowed.code, 0);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(projectA, { recursive: true, force: true });
    await rm(projectB, { recursive: true, force: true });
  }
});

test("P0-2: project rules stay local, and a project cannot disable or replace a global rule", async () => {
  const home = await scratch();
  const projectA = await scratch();
  const projectB = await scratch();
  try {
    const env = { USERPROFILE: home, HOME: home };
    const globalRuntime = await install(home, { scope: "global", home, env });
    await writeRules(home, [shellRule("shared-rule", "GRUDGE_TEST_SHARED", "Globally: never run the shared test.")]);

    // Project B installs its own rule. It must not leak into project A.
    const runtimeB = await install(projectB, { home, env });
    await writeRules(projectB, [
      // Same id as the global rule with a different body: must be ignored.
      { ...shellRule("shared-rule", "GRUDGE_TEST_NEVER_MATCHES"), english: "Project override attempt." },
      shellRule("project-rule", "GRUDGE_TEST_PROJECT"),
    ]);

    const globalInA = await runHook(globalRuntime, "PreToolUse", bashPayload(projectA, "echo GRUDGE_TEST_SHARED", "a-global"), { cwd: projectA, env });
    assert.equal(globalInA.code, 2);

    const projectInA = await runHook(globalRuntime, "PreToolUse", bashPayload(projectA, "echo GRUDGE_TEST_PROJECT", "a-project"), { cwd: projectA, env });
    assert.equal(projectInA.code, 0, "a project rule must not apply to another project");

    // In project B: the global rule still fires, and the replacement is ignored.
    const sharedInB = await runHook(runtimeB, "PreToolUse", bashPayload(projectB, "echo GRUDGE_TEST_SHARED", "b-shared"), { cwd: projectB, env });
    assert.equal(sharedInB.code, 2, "a project rule must not replace the global rule with the same id");
    assert.match(sharedInB.stderr, /Globally: never run the shared test/);
    assert.match(sharedInB.stderr, /ignored/, "the conflict is reported, not silent");

    // The project adds its own protection.
    const projectInB = await runHook(runtimeB, "PreToolUse", bashPayload(projectB, "echo GRUDGE_TEST_PROJECT", "b-project"), { cwd: projectB, env });
    assert.equal(projectInB.code, 2);
    assert.match(projectInB.stderr, /project-rule/);

    // `mode: "off"` is per installation: project B goes quiet, global stays on.
    await writeConfig(projectB, { mode: "off" });
    const offProject = await runHook(runtimeB, "PreToolUse", bashPayload(projectB, "echo GRUDGE_TEST_PROJECT", "b-off-project"), { cwd: projectB, env });
    assert.equal(offProject.code, 0, "the project's own rules are off");
    const stillGlobal = await runHook(runtimeB, "PreToolUse", bashPayload(projectB, "echo GRUDGE_TEST_SHARED", "b-off-global"), { cwd: projectB, env });
    assert.equal(stillGlobal.code, 2, "a project cannot switch off the global installation");

    // The global installation itself can be turned off, and then nothing blocks.
    await writeConfig(home, { mode: "off" });
    const allOff = await runHook(runtimeB, "PreToolUse", bashPayload(projectA, "echo GRUDGE_TEST_SHARED", "a-all-off"), { cwd: projectA, env });
    assert.equal(allOff.code, 0);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(projectA, { recursive: true, force: true });
    await rm(projectB, { recursive: true, force: true });
  }
});

test("P0-3: hookBudgetMs never converts a matching block into an allow", async () => {
  const root = await scratch();
  try {
    const runtime = await install(root);
    await writeRules(root, [shellRule("p0-budget", "GRUDGE_TEST_BUDGET")]);
    await writeConfig(root, { hookBudgetMs: 1 });

    const nested = join(root, "sub");
    await mkdir(nested, { recursive: true });
    const calls = [];
    for (let index = 0; index < 25; index += 1) {
      calls.push(runHook(runtime, "PreToolUse", bashPayload(nested, "echo GRUDGE_TEST_BUDGET", `budget-${index}`), { cwd: nested }));
    }
    const results = await Promise.all(calls);
    for (const [index, result] of results.entries()) {
      assert.equal(result.code, 2, `concurrent call ${index} was allowed: ${result.stderr}`);
      assert.match(result.stderr, /p0-budget/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("P0-3: a large session history, a stale lock, and a held lock still block", async () => {
  const root = await scratch();
  try {
    const runtime = await install(root);
    await writeRules(root, [shellRule("p0-state", "GRUDGE_TEST_STATE")]);
    await writeConfig(root, { hookBudgetMs: 1 });

    // More than the 2 MiB tail cap, in valid events.
    const sessionDir = join(root, ".grudge", "session");
    await mkdir(sessionDir, { recursive: true });
    const filler = `${JSON.stringify({ tool: "read_file", args: { path: "filler.txt" }, result: "x".repeat(2048) })}\n`;
    await writeFile(join(sessionDir, "big-session.jsonl"), filler.repeat(3000), "utf8");
    assert.ok((await readFile(join(sessionDir, "big-session.jsonl"), "utf8")).length > 4 * 1024 * 1024);

    const blocked = await runHook(runtime, "PreToolUse", bashPayload(root, "echo GRUDGE_TEST_STATE", "big-session"), { cwd: root });
    assert.equal(blocked.code, 2, `a large history allowed a matching call: ${blocked.stderr}`);

    // A stale lock is left over from a killed reporter.
    const lock = join(root, ".grudge", "stats.jsonl.lock");
    await mkdir(lock, { recursive: true });
    const old = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(lock, old, old);
    const staleLock = await runHook(runtime, "PreToolUse", bashPayload(root, "echo GRUDGE_TEST_STATE", "stale-lock"), { cwd: root });
    assert.equal(staleLock.code, 2, "a stale accounting lock must not affect enforcement");

    // A fresh lock held by another process, also irrelevant to the verdict.
    await rm(lock, { recursive: true, force: true });
    await mkdir(lock, { recursive: true });
    const heldLock = await runHook(runtime, "PreToolUse", bashPayload(root, "echo GRUDGE_TEST_STATE", "held-lock"), { cwd: root });
    assert.equal(heldLock.code, 2, "lock contention must not affect enforcement");
    await rm(lock, { recursive: true, force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("P0-4: structured secrets are redacted before the session event is stored", async () => {
  const root = await scratch();
  try {
    const runtime = await install(root);
    const secrets = {
      password: "hunter2hunter2",
      url: "https://x.invalid/?api_key=supersecretvalue123&next=1",
      bearer: "Bearer abcdefghijklmnop",
      cookie: "session=abc123456789",
      client: "shhh-secret-value",
      access: "AKIAIOSFODNN7EXAMPLE",
    };
    const payload = {
      session_id: "p0-secrets",
      cwd: root,
      hook_event_name: "PostToolUse",
      tool_name: "WebFetch",
      tool_input: {
        url: secrets.url,
        headers: { Authorization: secrets.bearer, Cookie: secrets.cookie, Accept: "text/plain" },
        auth: { password: secrets.password },
        config: { client_secret: secrets.client },
        note: `AWS_ACCESS_KEY_ID=${secrets.access}`,
      },
      tool_response: `token=${secrets.password}`,
    };
    const result = await runHook(runtime, "PostToolUse", payload, { cwd: root });
    assert.equal(result.code, 0);

    // The exact structured payload from the audit's P0-4 reproduction.
    const auditPayload = {
      session_id: "p0-audit",
      cwd: root,
      hook_event_name: "PostToolUse",
      tool_name: "mcp__db__query",
      tool_input: {
        sql: "select 1",
        password: "hunter2hunter2",
        api_key: "plainvalue12345",
        auth: { token: "abcd1234efgh5678", secret: "zzzz9999yyyy8888" },
      },
    };
    const auditResult = await runHook(runtime, "PostToolUse", auditPayload, { cwd: root });
    assert.equal(auditResult.code, 0);
    const auditStored = await readFile(join(root, ".grudge/session/p0-audit.jsonl"), "utf8");
    for (const secret of ["hunter2hunter2", "plainvalue12345", "abcd1234efgh5678", "zzzz9999yyyy8888"]) {
      assert.equal(auditStored.includes(secret), false, `${secret} leaked from the audit payload`);
    }

    const stored = await readFile(join(root, ".grudge/session/p0-secrets.jsonl"), "utf8");
    for (const [name, secret] of Object.entries(secrets)) {
      assert.equal(stored.includes(secret), false, `${name} leaked into the session log`);
    }
    const event = JSON.parse(stored.trim());
    assert.equal(event.args.headers.Authorization, "[REDACTED]");
    assert.equal(event.args.headers.Cookie, "[REDACTED]");
    assert.equal(event.args.headers.Accept, "text/plain");
    assert.equal(event.args.auth.password, "[REDACTED]");
    assert.equal(event.args.config.client_secret, "[REDACTED]");
    assert.equal(event.args.url, "https://x.invalid/?api_key=[REDACTED]&next=1");
    assert.equal(event.args.note, "AWS_ACCESS_KEY_ID=[REDACTED]");

    // The exact residue case from the audit: `echo ` before the variable name.
    const residue = await runHook(runtime, "PostToolUse", {
      session_id: "p0-residue",
      cwd: root,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE" },
      tool_response: "AWS_SECRET_ACCESS_KEY=abcdefghijklmnop1234",
    }, { cwd: root });
    assert.equal(residue.code, 0);
    const residueStored = await readFile(join(root, ".grudge/session/p0-residue.jsonl"), "utf8");
    assert.equal(residueStored.includes("KEY]"), false, "the env rule must not leave ` KEY]` residue");
    assert.equal(residueStored.includes("AKIAIOSFODNN7EXAMPLE"), false);
    assert.equal(residueStored.includes("abcdefghijklmnop1234"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("P1-1: Stop writes the append-only event log and leaves the legacy file alone", async () => {
  const root = await scratch();
  try {
    const runtime = await install(root);
    const stop = await runHook(runtime, "Stop", { session_id: "p1-stop", cwd: root }, { cwd: root });
    assert.equal(stop.code, 0);

    const lines = (await readFile(join(root, ".grudge/stats.jsonl"), "utf8")).trim().split("\n");
    const events = lines.map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.type === "stop"), "Stop must append a stop event");
    await assert.rejects(access(join(root, ".grudge", "stats.json")), "Stop must not write the legacy stats.json");

    // A repeated delivery is silent and does not append a second stop event.
    const again = await runHook(runtime, "Stop", { session_id: "p1-stop", cwd: root }, { cwd: root });
    assert.equal(again.code, 0);
    assert.equal(again.stdout, "");
    const stops = (await readFile(join(root, ".grudge/stats.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line)).filter((event) => event.type === "stop").length;
    assert.equal(stops, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("P1-1: an invalid payload cwd warns instead of silently disabling enforcement", async () => {
  const root = await scratch();
  try {
    const runtime = await install(root);
    await writeRules(root, [shellRule("p1-warn", "GRUDGE_TEST_WARN")]);
    const missing = join(root, "does-not-exist");
    const result = await runHook(runtime, "PreToolUse", { ...bashPayload(missing, "echo GRUDGE_TEST_WARN", "p1-warn"), cwd: missing }, { cwd: root });
    assert.equal(result.code, 2, "the installed rules still enforce");
    assert.match(result.stderr, /not an existing directory/);

    const nonPath = await runHook(runtime, "PreToolUse", { ...bashPayload(root, "echo GRUDGE_TEST_WARN", "p1-nonpath"), cwd: 42 }, { cwd: root });
    assert.equal(nonPath.code, 2);
    assert.match(nonPath.stderr, /cwd is not a path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
