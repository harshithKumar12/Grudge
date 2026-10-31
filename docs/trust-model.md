# Trust model

**Purpose:** Define the privacy and trust boundary for local Grudge session capture.
**Audience:** Developers installing the guard and reviewers inspecting captured data.
**Status:** final for Phase 16a, updated for the 0.2.1 production remediation
**Last updated (phase):** 0.2.1 production remediation - 2026-10-31

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

Redaction runs before a value is written, and both runtimes apply the same
ordered rule list so the same input stores the same text. It has two layers:

1. **Key-aware redaction.** A value stored under a credential-shaped key is
   replaced wholesale with `[REDACTED]` at any depth. Matching normalizes
   `camelCase`, dashes, dots and spaces to underscores, then matches whole
   segments, so `password`, `passwd`, `secret`, `token`, `access_token`,
   `refresh_token`, `api_key`, `apikey`, `client_secret`, `authorization`,
   `cookie`, `set-cookie`, `private_key`, and `credentials` all match inside
   `auth`, `headers`, `config`, arrays, and arbitrary objects, while
   `keyboard` and `monkey` do not.
2. **Value scanning.** Strings are scanned with the shared ordered rules; the
   `:`/`=` separator is preserved so `api_key=value` stays an assignment and
   `?api_key=value&next=1` stays a valid query string. Labelled values run
   before the bare environment rule, so `AWS_ACCESS_KEY_ID=AKIA…` becomes one
   clean `AWS_ACCESS_KEY_ID=[REDACTED]` with no ` KEY]` residue.

The scanning rules cover:

- whole `-----BEGIN … PRIVATE KEY-----` blocks;
- `Authorization: Bearer <token>` (the scheme word hides the value from the
  label rule, so it is matched explicitly);
- provider keys by shape — AWS `AKIA`/`ASIA`, `sk-`/`pk-`/`rk-`, `ghp_`/`gho_`/
  `ghs_`/`ghr_`, `github_pat_`, and `xoxb-`-style Slack tokens;
- labelled values such as `api_key`, `access_token`, `refresh_token`,
  `client_secret`, `authorization`, `cookie`, `set-cookie`, `secret`, `token`,
  `password`, and `passwd`, keeping the label and the original separator;
- bare `UPPER_CASE=value` environment assignments;
- the clearly fake `FAKE_KEY_` form used by the examples.

Redaction is applied at every persistence choke point, not just in CLI output:

| Artifact | Writer | Redaction |
|---|---|---|
| `.grudge/session/<id>.jsonl` | Node PostToolUse | `redactValue` over `args` and the result text |
| Python trace JSONL | `Recorder.close` | `redact_trace` per record |
| Python `capture` output | `grudge capture` | `redact_jsonl` per line |
| Python `shrink` cassette | `grudge shrink` | `redact_trace` over the dumped cassette |

Cassette *replay reads* are deliberately not redacted: redacting on read would
make a live call and its recorded replay disagree about the arguments a tool
received.

The shared corpus is `spec/redaction-corpus.json` (23 cases):
`tests/test_shared_corpora.py` and
`packages/grudge/test/remediation-regressions.test.js` both assert it
exactly, including entries that must pass through **unchanged** (ordinary prose,
and the phrase `token bucket algorithm`), so redaction cannot quietly eat
unrelated text. The two implementations are also compared directly: a generated
sweep of 1,170 inputs (every label form × separator × value shape, plus the
audit's prefix and suffix variants) produced identical output with zero
divergences (Node 25.2.1 / Python 3.14.0, 2026-10-31), and the only unmasked
values were ordinary prose, values shorter than eight characters, and values
containing a space. Redaction is always enabled in the runtime recorder; there is
no silent opt-out. A redaction marker is not proof that a source value was
secret, and redaction is intentionally conservative rather than a complete
secret scanner. In particular, a secret that is neither under a
credential-shaped key nor in a recognized shape is stored in cleartext.

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
