import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = join(fileURLToPath(new URL("..", import.meta.url)));
const script = join(repo, "scripts/e2e_guard.mjs");

test("two offline sessions propose, accept, and block the leak", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-e2e-test-"));
  const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.session2, "blocked");
  assert.match(output.reason, /do not retry/i);
});
