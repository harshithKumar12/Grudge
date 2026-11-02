// OWNER: lane-b
/**
 * Redact secrets before a value is persisted in a local Grudge session log.
 * This module deliberately has no configuration switch: callers must opt in
 * to keeping a value out of the log rather than silently disabling privacy.
 *
 * Two layers run on every write:
 *   1. key-aware redaction: a value stored under a sensitive key is replaced
 *      wholesale, at any depth, before the structure is serialized;
 *   2. value scanning: credentials embedded in ordinary strings are masked by
 *      shape and by label, preserving the original `:`/`=` separator so a URL
 *      query string is never corrupted.
 */

const PRIVATE_KEY = /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g;
// Provider-issued credentials, matched by their own shape so a value survives
// in no file even when it is not labelled.
const CLOUD_KEY = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const PREFIXED_KEY = /\b(?:sk|pk|rk|ghp|gho|ghs|ghr|github_pat|xox[baprs])[-_][A-Za-z0-9][A-Za-z0-9_\-.]{10,}\b/g;
// `Authorization: Bearer <token>` never reaches the labelled-value rule because
// the value is separated from the label by a scheme word.
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// The separator is captured and re-emitted unchanged: `api_key=value` stays an
// assignment and `?api_key=value&next=1` stays a valid query string. The value
// may be quoted, and `?`/`&` end it so a following parameter is not swallowed.
const LABELED_VALUE = /\b((?:api[_ -]?key|access[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|secret|token|password|passwd|authorization|cookie|set-cookie))\b(\s*[:=]\s*)(["']?)([^\s"'`,;}?&\[\]]{8,})\3/gi;
const ENV_VALUE = /\b([A-Z][A-Z0-9_]{2,})(\s*=\s*)([^\s,;)}\[\]]+)/g;
const FAKE_KEY = /\b(?:FAKE_)?KEY_[A-Za-z0-9][A-Za-z0-9_\-.]{8,}\b/g;

// Keys whose value is a credential regardless of what it looks like. Matching
// is on whole underscore-separated segments after camelCase normalization, so
// `db_password`, `x-api-key`, `apiKey`, and `set-cookie` all match while
// `keyboard` and `monkey` do not.
const SENSITIVE_KEY = /(?:^|_)(?:password|passwd|passphrase|secret|token|api_?key|apikey|client_?secret|authorization|cookie|set_?cookie|access_?token|refresh_?token|access_?key|secret_?key|private_?key|credential|credentials)(?:_|$)/;

/** Normalize a structured key for sensitive-key matching. */
export function normalizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase();
}

/** True when a structured field name names a credential. */
export function isSensitiveKey(key) {
  const normalized = normalizeKey(key);
  return normalized.length > 0 && SENSITIVE_KEY.test(normalized);
}

/** @param {string} text @returns {string} */
export function redact(text) {
  if (typeof text !== "string") return String(text);

  let result = text.replace(PRIVATE_KEY, "[REDACTED PRIVATE KEY]");
  result = result.replace(BEARER, "Bearer [REDACTED]");
  // Labelled values run before the env rule so `PASSWORD=x` becomes one clean
  // assignment instead of leaving a stray bracket behind.
  result = result.replace(LABELED_VALUE, (_match, label, separator) => `${label}${separator}[REDACTED]`);
  result = result.replace(ENV_VALUE, (_match, name, separator) => `${name}${separator}[REDACTED]`);
  result = result.replace(CLOUD_KEY, "[REDACTED KEY]");
  result = result.replace(PREFIXED_KEY, "[REDACTED KEY]");
  return result.replace(FAKE_KEY, "[REDACTED KEY]");
}

/**
 * Recursively redact a structured value.
 * @param {unknown} value
 * @param {string} [key] field name that owns `value`
 * @returns {unknown}
 */
export function redactValue(value, key) {
  if (key !== undefined && isSensitiveKey(key)) {
    return value === null || value === undefined ? value : "[REDACTED]";
  }
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redactValue(item, name)]),
    );
  }
  return value;
}
