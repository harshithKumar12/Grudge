// OWNER: lane-c

/** Parse strict JSON and return a merge-ready object. */
export function parseJson(text, file = "settings.json") {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("top-level JSON value must be an object");
    }
    return value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`Cannot merge ${file}: invalid JSON (${reason})`);
    wrapped.code = "GRUDGE_INVALID_JSON";
    throw wrapped;
  }
}

/** Deeply merge object keys while preserving existing scalar values. */
export function mergeObjects(existing, additions) {
  const result = structuredClone(existing ?? {});
  for (const [key, value] of Object.entries(additions ?? {})) {
    if (isObject(result[key]) && isObject(value)) result[key] = mergeObjects(result[key], value);
    else if (Array.isArray(result[key]) && Array.isArray(value)) result[key] = mergeUnique(result[key], value);
    else result[key] = structuredClone(value);
  }
  return result;
}

/** Parse, merge, and serialize JSON using the existing indentation style. */
export function mergeJson(text, additions, file = "settings.json") {
  const existing = parseJson(text || "{}", file);
  const merged = mergeObjects(existing, additions);
  const indent = detectIndent(text);
  return `${JSON.stringify(merged, null, indent)}\n`;
}

export function isGrudgeHookCommand(command) {
  return typeof command === "string" && /grudge(?:\.mjs)?[^\n]*\s+hook\s+(?:SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop)\b/i.test(command);
}

export function isGrudgeStatusLine(value) {
  return Boolean(value && typeof value === "object" && isGrudgeCommand(value.command, "statusline"));
}

export function grudgeHookEvents(settings) {
  const events = new Set();
  const hooks = settings?.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return events;
  for (const [event, groups] of Object.entries(hooks)) {
    if (collectCommands(groups).some((command) => isGrudgeHookCommand(command))) events.add(event);
  }
  return events;
}

export function stripGrudgeSettings(settings) {
  const result = structuredClone(settings ?? {});
  let changed = false;
  if (result.hooks && typeof result.hooks === "object" && !Array.isArray(result.hooks)) {
    for (const [event, groups] of Object.entries(result.hooks)) {
      const cleaned = stripHookGroups(groups);
      if (cleaned.changed) changed = true;
      if (cleaned.value.length) result.hooks[event] = cleaned.value;
      else { delete result.hooks[event]; changed = true; }
    }
    if (!Object.keys(result.hooks).length) { delete result.hooks; changed = true; }
  }
  if (isGrudgeStatusLine(result.statusLine)) { delete result.statusLine; changed = true; }
  return { value: result, changed };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeUnique(left, right) {
  const result = [...left];
  for (const value of right) {
    if (!result.some((item) => JSON.stringify(item) === JSON.stringify(value))) result.push(structuredClone(value));
  }
  return result;
}

function isGrudgeCommand(command, suffix) {
  return typeof command === "string" && new RegExp(`grudge(?:\\.mjs)?[^\\n]*\\s+${suffix}\\b`, "i").test(command);
}

function collectCommands(value) {
  const commands = [];
  const visit = (item) => {
    if (typeof item === "string") { commands.push(item); return; }
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (item && typeof item === "object") for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return commands;
}

function stripHookGroups(groups) {
  if (!Array.isArray(groups)) return { value: groups, changed: false };
  let changed = false;
  const value = groups.map((group) => {
    if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) return group;
    const hooks = group.hooks.filter((hook) => !isGrudgeHookCommand(hook?.command));
    if (hooks.length !== group.hooks.length) changed = true;
    return hooks.length ? { ...group, hooks } : null;
  }).filter(Boolean);
  if (value.length !== groups.length) changed = true;
  return { value, changed };
}

function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)\"/);
  return match ? match[1] : 2;
}
