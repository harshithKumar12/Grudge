// OWNER: lane-b
/**
 * Redact secrets before a value is persisted in a local Grudge session log.
 * This module deliberately has no configuration switch: callers must opt in
 * to keeping a value out of the log rather than silently disabling privacy.
 */

const PRIVATE_KEY = /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g;
const ENV_VALUE = /\b([A-Z][A-Z0-9_]{2,})\s*=\s*([^\s,;)}\]]+)/g;
const LABELED_VALUE = /\b((?:api[_ -]?key|access[_ -]?key|secret|token|password|passwd|authorization))\b\s*[:=]\s*(["']?)([^\s"'`,;}\]]{8,})\2/gi;
const PREFIXED_KEY = /\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9][A-Za-z0-9_\-.]{10,}\b/g;
const FAKE_KEY = /\b(?:FAKE_)?KEY_[A-Za-z0-9][A-Za-z0-9_\-.]{8,}\b/g;

/** @param {string} text @returns {string} */
export function redact(text) {
  if (typeof text !== "string") return String(text);

  let result = text.replace(PRIVATE_KEY, "[REDACTED PRIVATE KEY]");
  result = result.replace(ENV_VALUE, "$1=[REDACTED]");
  result = result.replace(LABELED_VALUE, "$1: [REDACTED]");
  result = result.replace(PREFIXED_KEY, "[REDACTED KEY]");
  return result.replace(FAKE_KEY, "[REDACTED KEY]");
}

/** @param {unknown} value @returns {unknown} */
export function redactValue(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item)]),
    );
  }
  return value;
}
