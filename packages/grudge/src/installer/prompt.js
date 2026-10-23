// OWNER: lane-c
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SCOPE_CHOICES = [
  { id: "repo", label: "This repository", detail: "Configure only the current project" },
  { id: "local", label: "Personal settings", detail: "Configure your user-level settings" },
  { id: "global", label: "All projects", detail: "Configure global settings" },
];

const detectedLabel = (item) => item.detected ? "detected" : "not detected";
const displayName = (id) => ({
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  copilot: "GitHub Copilot CLI",
  opencode: "OpenCode",
  codex: "Codex",
  cursor: "Cursor",
  windsurf: "Windsurf",
}[id] ?? id);

/** Resolve setup choices. --yes remains non-interactive and deterministic. */
export async function prompt({ detected = [], agents = [], scope, defaultScope = "repo", warnGlobal = false, yes = false, inputStream = input, outputStream = output } = {}) {
  const available = detected.filter((item) => item.detected).map((item) => item.id);
  const preferred = available.includes("claude-code") ? ["claude-code"] : available;
  if (agents.length && scope) return { agents, scope };
  if (yes) return { agents: agents.length ? agents : preferred, scope: scope ?? defaultScope };

  const interactive = Boolean(inputStream?.isTTY && outputStream?.isTTY && inputStream?.setRawMode);
  if (!interactive) return promptWithLines({ detected, agents, scope, inputStream, outputStream });

  const reader = createKeyReader(inputStream);
  setRawMode(inputStream, true);
  try {
    let selected = agents;
    if (!selected.length) {
      selected = await selectMany({
        title: "Which agents should use Grudge?",
        hint: "Choose the tools Grudge should configure.",
        choices: detected.map((item) => ({
          ...item,
          label: item.label ?? displayName(item.id),
          detail: item.detail ?? `${item.tier ?? "Advisory"} · ${detectedLabel(item)}`,
        })),
        reader,
        outputStream,
        initialSelected: preferred,
      });
      if (!selected.length) selected = preferred;
    }

    const chosenScope = scope ?? await selectOne({
      title: "Where should Grudge be configured?",
      hint: "Choose the settings scope.",
      choices: SCOPE_CHOICES.map((choice) => choice.id === "global" && warnGlobal ? { ...choice, detail: `${choice.detail} (confirm carefully: this directory is not a detected project)` } : choice),
      reader,
      outputStream,
      initial: SCOPE_CHOICES.findIndex((item) => item.id === defaultScope),
    });
    return { agents: selected, scope: chosenScope };
  } finally {
    reader.close();
    setRawMode(inputStream, false);
    outputStream.write("\x1b[?25h\n");
  }
}

async function promptWithLines({ detected, agents, scope, inputStream, outputStream }) {
  const available = detected.filter((item) => item.detected).map((item) => item.id);
  const preferred = available.includes("claude-code") ? ["claude-code"] : available;
  const rl = createInterface({ input: inputStream, output: outputStream });
  try {
    const chosen = agents.length
      ? agents
      : (await rl.question(`Agents (${available.join(", ")}): `)).trim().split(",").map((item) => item.trim()).filter(Boolean);
    const selected = chosen.length ? chosen : preferred;
    const answer = scope ?? ((await rl.question(`Scope (repo|local|global) [${defaultScope}]: `)).trim() || defaultScope);
    if (!["repo", "local", "global"].includes(answer)) throw new Error("scope must be repo, local, or global");
    return { agents: selected, scope: answer };
  } finally {
    rl.close();
  }
}

async function selectMany({ title, hint, choices, reader, outputStream, initialSelected = [] }) {
  return select({ title, hint, choices, reader, outputStream, multi: true, initialSelected });
}

async function selectOne({ title, hint, choices, reader, outputStream, initial = 0 }) {
  const selected = await select({ title, hint, choices, reader, outputStream, initial });
  return selected[0];
}

async function select({ title, hint, choices, reader, outputStream, multi = false, initial = 0, initialSelected = [] }) {
  if (!choices.length) return [];
  const checked = new Set(initialSelected);
  let cursor = Math.max(0, Math.min(initial, choices.length - 1));
  while (true) {
    renderSelector({ title, hint, choices, cursor, checked, multi, outputStream });
    const key = await reader.next();
    if (key === "up") cursor = (cursor + choices.length - 1) % choices.length;
    else if (key === "down") cursor = (cursor + 1) % choices.length;
    else if (key === "space" && multi) toggle(checked, choices[cursor].id);
    else if (key === "enter") {
      return multi
        ? choices.filter((item) => checked.has(item.id)).map((item) => item.id)
        : [choices[cursor].id];
    } else if (key === "ctrl-c") {
      throw new Error("setup cancelled");
    }
  }
}

function renderSelector({ title, hint, choices, cursor, checked, multi, outputStream }) {
  const lines = [
    "",
    "◆ Grudge setup",
    "│ Configure local guardrails for your agent tools.",
    "│",
    `◆ ${title}`,
    `│ ${hint}`,
    "│",
    ...choices.map((item, index) => {
      const pointer = index === cursor ? "❯" : " ";
      const marker = multi ? (checked.has(item.id) ? "◉" : "◯") : (index === cursor ? "◉" : "◯");
      const detail = item.detail ? ` ${item.detail}` : "";
      return `${pointer} ${marker} ${item.label}${detail}`;
    }),
    "│",
    "└ ↑/↓ navigate  •  Space toggle  •  Enter confirm  •  Ctrl+C cancel",
  ];
  outputStream.write("\x1b[2J\x1b[H\x1b[?25l" + lines.join("\n"));
}

function toggle(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function setRawMode(stream, enabled) {
  if (typeof stream?.setRawMode === "function") stream.setRawMode(enabled);
  if (enabled) stream.resume?.();
  else stream.pause?.();
}

function createKeyReader(stream) {
  let buffer = "";
  let waiter = null;
  const onData = (chunk) => {
    buffer += chunk.toString();
    flush();
  };
  stream.setEncoding?.("utf8");
  stream.on("data", onData);

  function next() {
    const parsed = parseKey(buffer);
    if (parsed) {
      buffer = parsed.rest;
      return Promise.resolve(parsed.key);
    }
    return new Promise((resolve) => { waiter = resolve; });
  }

  function flush() {
    if (!waiter) return;
    const parsed = parseKey(buffer);
    if (!parsed) return;
    buffer = parsed.rest;
    const resolve = waiter;
    waiter = null;
    resolve(parsed.key);
  }

  return {
    next,
    close() {
      stream.removeListener?.("data", onData);
      if (waiter) waiter("enter");
      waiter = null;
    },
  };
}

function parseKey(value) {
  if (!value) return null;
  if (value.startsWith("\x1b[A")) return { key: "up", rest: value.slice(3) };
  if (value.startsWith("\x1b[B")) return { key: "down", rest: value.slice(3) };
  if (value.startsWith("\x03")) return { key: "ctrl-c", rest: value.slice(1) };
  if (value.startsWith(" ")) return { key: "space", rest: value.slice(1) };
  if (value.startsWith("\r") || value.startsWith("\n")) return { key: "enter", rest: value.slice(1) };
  return { key: "unknown", rest: value.slice(1) };
}
