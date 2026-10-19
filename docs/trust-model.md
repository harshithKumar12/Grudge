# Trust model

**Purpose:** Define the privacy and trust boundary for local Grudge session capture.
**Audience:** Developers installing the guard and reviewers inspecting captured data.
**Status:** final for Phase 16a
**Last updated (phase):** 16

## What is stored

The PostToolUse recorder writes one JSON object per tool invocation to
`.grudge/session/<session-id>.jsonl`. The Phase 16 event contract contains:

- `tool`: the canonical tool name;
- `args`: normalized arguments, recursively redacted before persistence;
- `result`: a string result truncated to at most 4 KiB;
- `resultHash`: a digest of the stored (redacted and truncated) result;
- `byteSize`: the UTF-8 size of that stored result;
- `timestamp`: the local recorder timestamp.

Session logs are diagnostic inputs, not executable code. The Python importer
turns valid lines into a typed `Trace`; malformed lines are skipped so a
partial capture cannot prevent later analysis.

## Redaction boundary

Redaction runs before a value is written. It masks private-key blocks,
environment-style assignments, labeled values such as `api_key` and `token`,
common provider key prefixes, and the clearly fake `FAKE_KEY_` form used by
the examples. Redaction is always enabled in the runtime recorder; there is
no silent opt-out. A redaction marker is not proof that a source value was
secret, and redaction is intentionally conservative rather than a complete
secret scanner.

## Retention and repository boundary

The recorder keeps at most the newest 500 events per session and removes
session files whose newest event (or filesystem modification time when no
timestamp is available) is more than seven days old. The installer adds
`.grudge/session/` to `.gitignore`; session captures therefore remain local
unless a developer explicitly copies them elsewhere. Committed scars and
compiled rules contain only the fields needed for deterministic enforcement.

No network, telemetry, hosted service, API key, or model call is involved in
capture. Anyone with access to the working directory can read local logs, so
filesystem permissions remain part of the user's trust boundary.
