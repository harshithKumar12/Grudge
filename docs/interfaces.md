# Cross-lane interfaces

**Purpose:** Freeze the exact contracts used by the Phase 15-21 lanes.
**Audience:** Integrator and lane workers.
**Status:** final
**Last updated (phase):** 14

## Python and JSON

- `grudge.guard.compile.evaluate_rule(rule, events) -> {violated: bool, atEvents: int[]}`.
- `grudge.guard.compile.compile_scars(scars, *, created_from) -> {version: 1, rules: []}`.
- `grudge.guard.compile.write_compiled(payload, destination) -> Path`.
- `Trace` importers preserve event order and use zero-based fixture indexes.
- `spec/compiled-predicates.schema.json` and `spec/conformance/*.json` are shared
  contracts; Python is authoritative only for the full engine, not for Node's
  reduced runtime semantics.

## Node core

- `parse(source) -> AST` parses the three runtime DSL forms and throws an error
  with `line`, `column`, and `hint` fields on malformed input.
- `check(rule, events) -> {violated, atEvents}` implements the fixture semantics.
- `normalize(event) -> {tool, args, result?, ...}` returns canonical events.
- `store.readJson(path, fallback) -> value` returns fallback on missing/corrupt JSON.
- `store.writeJsonAtomic(path, value) -> void` writes a temp file then renames it.
- `session.append(root, id, event) -> void`; `session.read(root, id) -> event[]`.
- `redact(text) -> string` masks key-like strings before persistence.
- `compiled.json` is the schema-shaped payload above; `mode` is `block|warn|off|pending`.

## Hook process contract

The exact command is `node .grudge/bin/grudge.mjs hook <event>`. It reads one JSON
object from stdin and writes event-specific output to stdout/stderr. A hook that
cannot parse its input, load its rules, or finish within its budget exits zero
and emits one short warning to stderr. Pre-tool blocking is represented by a
non-zero process result and a JSON object containing `blocked`, `reason`, and
`scarId`; the official mechanism is verified and documented by Phase 17.

Managed instruction blocks use `<!-- grudge:begin v1 -->` and
`<!-- grudge:end -->` markers. The command registry imports one file per command;
the hook registry imports one file per hook. Workers must not edit a shared
dispatcher.
