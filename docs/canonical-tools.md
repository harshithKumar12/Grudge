# Canonical tools

**Purpose:** Normalize host-agent tool names before guard predicates evaluate them.
**Audience:** Adapter and hook implementers.
**Status:** final
**Last updated (phase):** 25

## Contract

Every runtime event has a canonical `tool` and JSON `args`. The supported names
are:

| Canonical tool | Required argument shape |
|---|---|
| `read_file` | `{path}` |
| `write_file` | `{path, ...}` |
| `shell` | `{command}` |
| `http` | `{url, body?}` |
| `mcp` | `{server, tool, args}` |
| `other` | `{name, args}` |

For Claude Code, the mapping is (case-insensitive; re-verified 2026-10-29):

| Host name | Canonical name |
|---|---|
| `Read`, `NotebookRead` | `read_file` |
| `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | `write_file` |
| `Bash`, `PowerShell` | `shell` |
| `WebFetch`, `WebSearch` | `http` |
| `mcp__<server>__<tool>` | `mcp` |
| anything else (`Glob`, `Grep`, ...) | the host name, unchanged |

Unmapped host tools keep their own name instead of being coerced to `other`.
That is deliberate: a rule written for `read_file` must not fire on `Glob`, and
a rule written for `Glob` (if someone writes one) still matches. `test/phase25-mapping.test.js`
asserts every row above, and blocks a real payload per row.

## MCP capabilities

An MCP call carries more than one name, because a rule may have been written for
either vocabulary:

- `tool` is `mcp`, so `never call mcp ...` keeps matching every MCP tool;
- `tools` lists `mcp`, the raw `mcp__<server>__<tool>` name, and — when the tool
  name is a recognisable capability — the canonical tool it implements
  (`write_file`, `read_file`, `shell`, `http`).

So `mcp__filesystem__write_file` matches both `never call mcp ...` and
`never call write_file ...`, and a path predicate written for `write_file`
applies unchanged. Unknown capability names are never guessed: `mcp__db__query`
matches only `mcp` and its raw name, because inventing `read_file` for an
unfamiliar name could block an unrelated call.

MCP arguments keep the historical `{server, tool, args}` shape and also expose
the raw arguments at the top level, so `path` matches the way it does for the
native tool. Both engines implement this: the `mcp-*` conformance fixtures pin
the Node and Python results to the same expectation.

The adapter preserves the original name in event metadata when available, but
predicates never depend on it. Argument values remain JSON and are not coerced
to shell strings. Windows separators are normalized only for `$under` path
matching; the original event is retained for evidence.

Adapter verification is a Phase 19 responsibility. This document records the
canonical contract, not a claim that every host's current documentation has
already been verified.
