// OWNER: integrator
import test from "node:test";
import assert from "node:assert/strict";

test("Phase 14 package scaffold is importable", async () => {
  const { commands } = await import("../src/commands/index.js");
  const { hooks } = await import("../src/hooks/index.js");
  assert.deepEqual(Object.keys(commands).sort(), ["accept", "doctor", "hook", "propose", "scars", "setup", "stats", "statusline", "uninstall"]);
  assert.deepEqual(Object.keys(hooks).sort(), ["postToolUse", "preToolUse", "sessionStart", "stop", "userPromptSubmit"]);
});
