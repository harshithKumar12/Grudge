# Canonical tools

**Purpose:** Normalize host-agent tool names before guard predicates evaluate them.
**Audience:** Adapter and hook implementers.
**Status:** final
**Last updated (phase):** 14

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

For Claude Code, the Phase 14 mapping is:

| Host name | Canonical name |
|---|---|
| `Read` | `read_file` |
| `Write`, `Edit`, `MultiEdit` | `write_file` |
| `Bash` | `shell` |
| `WebFetch` | `http` |
| `mcp__<server>__<tool>` | `mcp` |
| anything else | `other` |

The adapter preserves the original name in event metadata when available, but
predicates never depend on it. Argument values remain JSON and are not coerced
to shell strings. Windows separators are normalized only for `$under` path
matching; the original event is retained for evidence.

Adapter verification is a Phase 19 responsibility. This document records the
canonical contract, not a claim that every host's current documentation has
already been verified.
