// OWNER: lane-b
/**
 * Redact secrets before a value is persisted in a local Grudge session log.
 * This module deliberately has no configuration switch: callers must opt in
 * to keeping a value out of the log rather than silently disabling privacy.
 */

const PRIVATE_KEY = /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g;
// Provider-issued credentials, matched by their own shape so a value survives
// in no file even when it is not labelled.
const CLOUD_KEY = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const PREFIXED_KEY = /\b(?:sk|pk|rk|ghp|gho|ghs|ghr|github_pat|xox[baprs])[-_][A-Za-z0-9][A-Za-z0-9_\-.]{10,}\b/g;
// `Authorization: Bearer <token>` never reaches the labelled-value rule because
// the value is separated from the label by a scheme word.
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// The value may be quoted, and a query separator ends it so a following
// parameter is not swallowed with the secret (`token=abc&next=1`).
const LABELED_VALUE = /\b((?:api[_ -]?key|access[_ -]?key|access[_ -]?token|secret|token|password|passwd|authorization))\b\s*[:=]\s*(["']?)([^\s"'`,;}?&\]]{8,})\2/gi;
const ENV_VALUE = /\b([A-Z][A-Z0-9_]{2,})\s*=\s*([^\s,;)}\]]+)/g;
const FAKE_KEY = /\b(?:FAKE_)?KEY_[A-Za-z0-9][A-Za-z0-9_\-.]{8,}\b/g;

/** @param {string} text @returns {string} */
export function redact(text) {
  if (typeof text !== "string") return String(text);

  let result = text.replace(PRIVATE_KEY, "[REDACTED PRIVATE KEY]");
  result = result.replace(BEARER, "Bearer [REDACTED]");
  result = result.replace(CLOUD_KEY, "[REDACTED KEY]");
  // Labelled values run before the bare env rule so `PASSWORD=x` becomes one
  // clean `PASSWORD: [REDACTED]` instead of leaving a stray bracket behind.
  result = result.replace(LABELED_VALUE, "$1: [REDACTED]");
  result = result.replace(PREFIXED_KEY, "[REDACTED KEY]");
  result = result.replace(ENV_VALUE, "$1=[REDACTED]");
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
