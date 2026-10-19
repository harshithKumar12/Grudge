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

function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)\"/);
  return match ? match[1] : 2;
}
