# Guard contract

**Purpose:** Define the flat JSON contract shared by the Python compiler and the Node runtime guard.
**Audience:** Contributors implementing the local hooks and maintainers reviewing generated rules.
**Status:** final
**Last updated (phase):** 14

## Compiled payload

`grudge compile` reads only admitted `*.scar.json` files and writes a canonical
`.grudge/compiled.json` payload:

```json
{
  "version": 1,
  "rules": [{
    "id": "mail-leak-7",
    "mode": "block",
    "kind": "taint_flow",
    "tool": "http",
    "match": {},
    "ordering": {"before": "", "after": ""},
    "taint": {"source": "read_file", "sink": "http", "sourceField": null,
               "sinkField": "body", "sourceMatch": {}},
    "english": "Data from `read_file` must not flow to `http.body`.",
    "createdFrom": "scars"
  }]
}
```

The JSON Schema in `spec/compiled-predicates.schema.json` is the authority for
field names and allowed values. Rules are sorted by `id`, and JSON is written
with sorted keys through a temporary file followed by an atomic rename.

## Runtime semantics

- **call_shape:** a violation is every event whose canonical `tool` matches and
  whose `args` satisfy all entries in `match`. `$contains`, `$under`, and
  `$not_under` are supported for string values.
- **ordering:** `must call before before call after`; an `after` event before
  the first `before` event is a violation.
- **taint_flow:** values in a matching source result are remembered only for
  later events. A sink violates when a remembered scalar appears in its
  selected argument, result, or nested JSON value. This is intentionally the
  small runtime form of the Python engine's taint checker.

The Python and Node implementations must return the same fixture result:
`{"violated": bool, "atEvents": [zero-based indexes]}`. Hooks fail open on
malformed compiled data; compilation itself fails closed and does not produce a
partial output.

## Compile command

```text
grudge compile --scars scars --out .grudge/compiled.json
```

Only admitted Scars compile. The output is local data, not executable code.
