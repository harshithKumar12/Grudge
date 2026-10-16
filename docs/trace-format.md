# Trace format

**Purpose:** Specify the Phase 1 ordered trace contract and its JSONL encoding.
**Audience:** Recorder, replay, shrinker, and integration implementers.
**Status:** final
**Last updated (phase):** 1

## Trace envelope

`Trace` is a Pydantic v2 model with these fields:

| Field | Type | Meaning |
|---|---|---|
| `run_id` | non-empty string | Stable identifier for one agent run. |
| `agent_version` | non-empty string | Version of the agent under test. |
| `task` | string | User task supplied to the agent. |
| `steps` | ordered list of `Step` | Events observed during the run. |
| `outcome` | `"ok"` or `"failed"` | Terminal run result. |

Every step has the common fields `idx`, `ts`, `run_id`, `parent_idx`, and
`meta`. `idx` is non-negative and unique within a trace. `parent_idx` is
optional and reserves the link needed for future forked runs.

## Step union

The `kind` field discriminates the five step models:

| `kind` | Additional fields |
|---|---|
| `model_call` | Optional `model`, `messages`, `prompt`, and `response`. |
| `tool_call` | `tool`, `args`, and `call_id`. |
| `tool_result` | `call_id`, `content`, and optional `error`. |
| `state_diff` | Structured `diff` mapping. |
| `final_answer` | Optional final `answer`. |

Example step:

```json
{"args":{"path":"report.txt"},"call_id":"call-1","idx":1,"kind":"tool_call","meta":{},"parent_idx":null,"run_id":"run-1","tool":"read_file","ts":"2026-01-02T03:04:05Z"}
```

## JSONL encoding

`Trace.to_jsonl()` writes one canonical metadata header followed by one JSON
object per step. Keys are sorted, separators are compact, Unicode is preserved,
and a final newline is included:

```jsonl
{"agent_version":"agent-1","outcome":"ok","run_id":"run-1","task":"summarize mail","type":"trace"}
{"args":{"path":"report.txt"},"call_id":"call-1","idx":1,"kind":"tool_call","meta":{},"parent_idx":null,"run_id":"run-1","tool":"read_file","ts":"2026-01-02T03:04:05Z"}
```

`Trace.from_jsonl()` validates the header, reconstructs the discriminated union,
preserves list order, and converts malformed payloads to `SchemaError`.

## Helpers and validation

- `tool_calls()` returns tool calls in trace order.
- `results_for(call_id)` returns matching tool results in trace order.
- `slice(idxs)` selects matching steps without reordering them.
- Duplicate indexes and step/run ID mismatches are rejected.
- Invalid model construction and invalid JSONL raise `SchemaError`.
