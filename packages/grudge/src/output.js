import { VERSION } from "./version.js";

export function jsonOutput(value) {
  return `${JSON.stringify(value ?? null, null, 2)}\n`;
}

export function renderError(error, { command = "command", ascii = false } = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const fix = fixFor(message, command);
  return [`Grudge ${command} v${VERSION}`, `Error: ${message}`, `Fix: ${fix}`].join("\n") + "\n";
}

export function renderCommand(command, result, options = {}) {
  if (command === "doctor") return renderDoctor(result, options);
  if (command === "statusline") return `${result || ""}${result ? "\n" : ""}`;

  const lines = [`Grudge ${command} v${VERSION}`];
  const items = commandItems(command, result);
  const groups = groupItems(command, items);
  for (const [group, groupItemsValue] of groups) {
    if (groups.length > 1) lines.push(`${group}:`);
    for (const item of groupItemsValue) lines.push(formatItem(item, options));
  }
  const counts = countItems(items);
  lines.push(`${counts.passed} passed, ${counts.failed} failed, ${counts.warnings} warnings`);
  lines.push(`Next: ${nextCommand(command, result)}`);
  return `${lines.join("\n")}\n`;
}

function renderDoctor(result, options) {
  const notInstalled = !result?.checks?.find((check) => check.name === "config")?.ok
    && !result?.checks?.find((check) => check.name === "runtime")?.ok;
  if (notInstalled) {
    const lines = [`Grudge doctor v${VERSION}`, "Grudge is not installed here.", "Next: grudge setup --scope repo"];
    if (options.strict) lines.push("0 passed, 1 failed, 0 warnings");
    else lines.push("1 passed, 0 failed, 0 warnings");
    return `${lines.join("\n")}\n`;
  }
  const checks = (result?.checks ?? []).filter((check) => !check.ok || check.warning);
  const lines = [`Grudge doctor v${VERSION}`];
  if (!checks.length) lines.push("[ok] Healthy");
  else {
    for (const check of checks) {
      const item = { status: check.warning ? "warning" : "failed", label: check.name, detail: check.detail };
      lines.push(formatItem(item, options));
      if (!check.ok) lines.push(`  Fix: ${fixFor(check.detail, "doctor")}`);
    }
    lines.push(`Needs attention (${checks.filter((check) => !check.ok).length} issues)`);
  }
  const measurements = result?.budgetMeasurements ?? [];
  if (measurements.length) {
    const failed = measurements.filter((measurement) => !measurement.withinCap || measurement.withinLineCap === false);
    lines.push(formatItem({ status: failed.length ? "failed" : "ok", label: "Budgets", detail: failed.length ? `${failed.length} budget limits exceeded` : "within configured limits" }, options));
  }
  const passed = (result?.checks ?? []).filter((check) => check.ok && !check.warning).length;
  const failed = (result?.checks ?? []).filter((check) => !check.ok).length;
  const warnings = (result?.checks ?? []).filter((check) => check.warning).length;
  // File checks cannot prove that a hook actually stops a call. Say so, and
  // point at the only command that can.
  if (!failed) lines.push("Enforcement: not proven by file checks. Run `grudge verify` to prove blocking works.");
  lines.push(`${passed} passed, ${failed} failed, ${warnings} warnings`);
  lines.push(`Next: ${failed ? "grudge setup --scope repo --agents claude-code" : "grudge verify"}`);
  return `${lines.join("\n")}\n`;
}

function commandItems(command, result) {
  if (command === "setup" || command === "init") {
    return [
      { status: "ok", label: "Scope", detail: result.scope },
      { status: result.selected?.length ? "ok" : "skipped", label: "Agents", detail: result.selected?.join(", ") || "none" },
      { status: result.changes?.length ? "ok" : "skipped", label: "Files", detail: `${result.changes?.length ?? 0} changed` },
      ...(result.warnings ?? []).map((warning) => ({ status: "warning", label: "Warning", detail: warning })),
      ...(!result.runtimeInstalled ? [{ status: "warning", label: "Runtime", detail: "not installed" }] : []),
    ];
  }
  if (command === "uninstall") return [
    { status: "ok", label: "root", detail: result.root },
    { status: "ok", label: "Restored", detail: `${result.restored?.length ?? 0} files` },
    { status: result.removed?.length ? "ok" : "skipped", label: "Removed", detail: `${result.removed?.length ?? 0} paths` },
  ];
  if (command === "stats") return [
    { status: "ok", label: "Blocks", detail: String(result.blocks ?? 0) },
    { status: "ok", label: "Warnings", detail: String(result.warnings ?? 0) },
    { status: "ok", label: "Scars", detail: String(result.scars ?? 0) },
    { status: "ok", label: "Estimated savings", detail: `~${result.estimatedTokensSaved ?? 0} tokens` },
  ];
  if (command === "report") return Object.entries(result).filter(([key]) => key !== "estimated").map(([key, value]) => ({ status: "ok", label: key, detail: `${value.caught} caught, ${value.blocked} blocked, ${value.warned} warned` }));
  if (command === "propose") return result.accepted === false && result.error
    ? [{ status: "failed", label: "Proposal", detail: result.error }]
    : [{ status: "ok", label: "Proposal", detail: result.id || "created" }, result.pending
      ? { status: "warning", label: "Status", detail: `PENDING. Not enforced until you run: grudge accept ${result.id}` }
      : { status: "ok", label: "Status", detail: "accepted and enforced" }];
  if (command === "accept") return [{ status: result.accepted ? "ok" : "failed", label: "Scar", detail: result.id }];
  if (command === "scars") {
    // `list` returns arrays, `show` returns one pending and one admitted record.
    const pending = Array.isArray(result.pending) ? result.pending : result.pending ? [result.pending] : [];
    const admitted = Array.isArray(result.scars) ? result.scars : result.scar ? [result.scar] : [];
    const items = [
      ...pending.map((scar) => ({ status: "warning", label: scar.id, detail: "pending" })),
      ...admitted.map((scar) => ({ status: scar.mode === "off" ? "skipped" : "ok", label: scar.id, detail: scar.english ?? scar.mode ?? "admitted" })),
    ];
    return items.length ? items : [{ status: "failed", label: "Scar", detail: "not found" }];
  }
  return Object.entries(result ?? {}).filter(([key, value]) => !["measurement", "budgetMeasurements", "checks", "warnings"].includes(key) && ["string", "number", "boolean"].includes(typeof value)).map(([label, detail]) => ({ status: "ok", label, detail: String(detail) }));
}

function groupItems(command, items) {
  if (command !== "doctor") return [["", items]];
  return [["Checks", items]];
}

function formatItem(item, options) {
  const marks = { ok: "[ok]", failed: "[fail]", warning: "[warn]", skipped: "[skip]" };
  const mark = marks[item.status] ?? marks.ok;
  return `${mark} ${item.label}: ${item.detail}`;
}

function countItems(items) {
  return items.reduce((counts, item) => {
    if (item.status === "warning") counts.warnings += 1;
    else if (item.status === "failed") counts.failed += 1;
    else if (item.status === "ok") counts.passed += 1;
    return counts;
  }, { passed: 0, failed: 0, warnings: 0 });
}

function nextCommand(command, result) {
  if (command === "setup" || command === "init") return "grudge doctor";
  if (command === "doctor") return result?.ok ? "grudge verify" : "grudge setup --scope repo";
  if (command === "uninstall") return "grudge setup --scope repo";
  if (command === "propose") return result?.pending ? result.run : "grudge scars list";
  if (command === "accept") return "grudge doctor";
  if (command === "stats" || command === "report" || command === "statusline") return "grudge doctor";
  return "grudge doctor";
}

function fixFor(detail, command) {
  const text = String(detail).toLowerCase();
  if (text.includes("runtime missing") || text.includes("not installed")) return "grudge setup --scope repo";
  if (text.includes("config") || text.includes("gitignore")) return "grudge setup --scope repo";
  if (text.includes("hook")) return "grudge setup --scope repo --agents claude-code";
  if (command === "doctor") return "grudge doctor --debug";
  return "rerun the command with --debug for details";
}
