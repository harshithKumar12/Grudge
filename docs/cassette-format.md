# Cassette format

**Purpose:** Specify the Phase 1 frozen-world contract used by replay and shrinking.
**Audience:** Replay, shrinker, recorder, and cassette-producing integrations.
**Status:** final
**Last updated (phase):** 1

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

Phase 1 defines the data contract only. Matching order, strict replay behavior,
and consumed-entry tracking are implemented in Phase 4.
