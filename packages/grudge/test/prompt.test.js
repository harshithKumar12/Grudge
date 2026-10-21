import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { prompt } from "../src/installer/prompt.js";

function terminalStreams(keys = "") {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  input.setRawMode = () => {};
  output.setEncoding("utf8");
  const outputChunks = [];
  output.on("data", (chunk) => outputChunks.push(chunk));
  setImmediate(() => input.write(keys));
  return { input, output, outputText: () => outputChunks.join("") };
}

test("interactive prompt selects agents and scope with terminal keys", async () => {
  const streams = terminalStreams(" \r\x1b[B\r");
  const result = await prompt({
    detected: [
      { id: "claude-code", detected: true },
      { id: "codex", detected: false },
    ],
    inputStream: streams.input,
    outputStream: streams.output,
  });

  assert.deepEqual(result, { agents: ["claude-code"], scope: "local" });
  assert.match(streams.outputText(), /Which agents should use Grudge\?/);
  assert.match(streams.outputText(), /Space toggle/);
});

test("explicit setup flags remain non-interactive", async () => {
  const streams = terminalStreams();
  const result = await prompt({
    agents: ["codex"],
    scope: "global",
    inputStream: streams.input,
    outputStream: streams.output,
  });

  assert.deepEqual(result, { agents: ["codex"], scope: "global" });
  assert.equal(streams.outputText(), "");
});
