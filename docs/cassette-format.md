# Cassette format

**Purpose:** Specify the Phase 1 frozen-world contract used by replay and shrinking.
**Audience:** Replay, shrinker, recorder, and cassette-producing integrations.
**Status:** final
**Last updated (phase):** 4

## Structure

`Cassette` contains a task and an ordered `world` list:

```json
{
  "task": "summarize mail",
  "world": [
    {
      "tool": "read_file",
      "match": {"kind": "exact", "args": {"path": "report.txt"}},
      "response": {"text": "fake report"},
      "order_hint": 1
    }
  ]
}
```

Each `CassetteEntry` has:

- `tool`: a non-empty tool name;
- `match`: an `ArgMatcher`;
- `response`: arbitrary JSON-compatible response data;
- `order_hint`: optional ordering metadata for replay implementations.

## Argument matchers

`ArgMatcher.kind` is one of:

- `exact`: the actual argument mapping must equal `args`;
- `subset`: every nested key/value in `args` must appear in the actual mapping;
- `any`: accepts any argument mapping and ignores `args`.

The Python constructors are `ArgMatcher.exact(args)`,
`ArgMatcher.subset(args)`, and `ArgMatcher.any()`. The validator also accepts
the compact compatibility shapes `{ "exact": {...} }` and
`{ "subset": {...} }`.

## Stable identity

`Cassette.size_bytes()` returns the UTF-8 byte count of canonical compact JSON.
`Cassette.content_hash` is a SHA-256 digest of that same JSON, with sorted keys.
Equivalent model payloads therefore have identical sizes and hashes. The
content hash is the identity used by later memoized shrink-oracle calls.

## Replay semantics

Phase 4 serves entries through a cassette player or `CassetteWorld`. For each
tool call, the replay layer considers only unconsumed entries for that tool and
matches in this order: `exact`, then `subset`, then `any`. Ties are stable in
cassette order, with `order_hint` available as deterministic ordering metadata
for cassette-backed worlds.

Entries are consumed once. A strict player raises `ReplayMismatch` when no
entry matches; a lenient player records the miss, emits a warning, and returns
the neutral empty mapping `{}`. Replay keeps the policy live, so the next
model decision is calculated from the cassette response rather than copied
from the source trace.
