# Viewer event stream

**Purpose:** Specify the typed events emitted by the offline five-beat demo.
**Audience:** Viewer authors, demo integrations, and tests consuming `/events`.
**Status:** final
**Last updated (phase):** 10

The event stream is JSON over Server-Sent Events. Each event has a `type` and
monotonic `seq`; the remaining fields are the typed payload. `GET /state`
returns the same payloads in an `events` array, which lets a late viewer render
the completed story without replaying the engines.

## Event schema

| Type | Fields | Meaning |
|---|---|---|
| `demo.started` | `seq` | A new story started. |
| `beat.started` | `n`, `title` | One of the five narrative beats started. |
| `trace.step` | `idx`, `kind`, `summary`, `status` | A captured vulnerable-run step. Summaries are intentionally short and do not expose fake secrets. |
| `trace.outcome` | `leaked` | Whether the vulnerable trace contained the prohibited HTTP sink call. |
| `shrink.started` | `total` | Number of cassette entries before reduction. |
| `shrink.attempt` | `removed`, `kept`, `remaining` | One deterministic ddmin/content candidate. |
| `shrink.done` | `before`, `after`, `bytes` | Final cassette entry count and serialized size. |
| `predicate.synthesized` | `dsl`, `english`, `source` | Validated rule, plain-English explanation, and `llm`, `cache`, or `fallback` provenance. |
| `admission.result` | `admitted`, `reasons`, `bad`, `good` | The red-on-vulnerable/green-on-fixed proof. Color values are `red` or `green`. |
| `gate.result` | `agent`, `passes`, `n`, `wilson`, `threshold`, `passed` | Statistical gate result for one agent. |
| `regression.detected` | `markdown` | The deterministic PR-style comment for the reintroduced bug. |
| `demo.finished` | `seq` | The complete story finished successfully. |

## Ordering

The orchestrator emits `demo.started`, then `beat.started` events in numeric
order. Trace events occur inside beat 1; shrink events inside beat 2; the
predicate event inside beat 3. Beat 4 emits the admission proof followed by a
red vulnerable gate and a green fixed gate. Beat 5 reruns the vulnerable agent,
emits a blocked gate, and emits `regression.detected` before `demo.finished`.

## HTTP transport

`GET /events` sends each event as:

```text
event: gate.result
data: {"type":"gate.result", ...}

```

The endpoint first replays retained events, then follows live events until the
demo finishes or the client disconnects. `POST /restart` clears the retained
history and starts a fresh offline run. `GET /state` is a finite JSON replay.
The server uses only the Python standard library; the orchestrator never opens
a network connection and uses the checked-in Scar, controls, and fallback
predicate when `OFFLINE` is enabled.
