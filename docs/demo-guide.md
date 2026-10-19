# CLI, offline demo, viewer, and fallback recording

**Purpose:** Explain the scriptable CLI pipeline and the deterministic demo.
**Audience:** Contributors, CI authors, and demo operators.
**Status:** final
**Last updated (phase):** 12

## Offline demo

The demo captures the real vulnerable example, shrinks its replay world,
synthesizes the fallback predicate, proves admission, and runs the Wilson gate
against the fixed and vulnerable agents. The offline path uses the checked-in
`scars/sample_leak.scar.json`, controls, and scripted agents; it does not call a
provider or require a network connection:

```bash
python -m grudge demo --no-browser
```

For tests and CI, `--fast` disables presenter pacing and uses one deterministic
gate repetition per agent so the complete story stays under ten seconds. It
prints the complete event log before exiting:

```bash
python -m grudge demo --no-browser --fast
```

The fixed agent must pass and the vulnerable agent must be blocked. Machine
consumers can request one JSON document containing the event list and
compatibility gate summaries:

```bash
python -m grudge demo --no-browser --runs 2 --fast --json
```

`--live` remains reserved for a future provider integration. The local server
is available from `grudge.demo.server` and serves the checked-in `viewer/`
directory, `/events` as SSE, `/state` as a replay snapshot, and `/restart` as a
fresh run trigger. The default presenter pacing is approximately 75–95 seconds;
`--fast` removes those delays for tests and CI. The complete event contract is in
[`viewer-events.md`](viewer-events.md).

## Phase 11 viewer

The Phase 10 local server serves the static viewer, the Server-Sent Events
stream, replay state, and the restart endpoint. Start the normal paced demo
from the repository root:

```bash
python -m grudge demo --port 8765
```

Use `--no-browser` when the URL should be opened manually, for example on a
remote machine or when presenting from another browser window:

```bash
python -m grudge demo --no-browser --port 8765
```

Open `http://127.0.0.1:8765/` after the server starts. The viewer is a static,
CDN-free page; it renders the retained and live events without owning any
pipeline state. Use `--fast` for a quick smoke run rather than a presentation.

### Viewer controls and presenter behavior

- **Replay** sends `POST /restart`, clears the current view, and reconnects to
  the fresh five-beat run.
- **Pause** (or the **Space** key) buffers incoming events so a presenter can
  explain the current beat. Press it again to render the buffered events and
  continue.
- The connection badge shows **Live** while the SSE stream is open and
  **Complete** after the final event. If the server stops, it changes to
  **Disconnected · retrying**; start or restart `grudge demo` and the browser's
  `EventSource` connection will retry automatically.
- The beat indicator, event count, timeline, shrink meter, predicate card,
  admission/gate panels, regression comment, and evidence browser are all
  driven by the Phase 10 event types documented in
  [`viewer-events.md`](viewer-events.md).

For a projector-friendly presentation, start without `--fast`, pause between
beats as needed, and use Replay to reset the story before another take. The
server and viewer use only the checked-in offline demo data; no provider key or
external CDN is needed.

## Fallback video procedure

The step-by-step recording procedure, output location, and headless fallback
are maintained in [`../scripts/record_fallback_video.md`](../scripts/record_fallback_video.md).
The event log is safe to regenerate offline; only process-local sequence
numbers and runtime timestamps may differ between recordings.

## Manual pipeline

Every stage uses the existing typed engine contracts and returns exit code 2
for an invalid argument, missing input, or `GrudgeError`.

```bash
python -m grudge capture examples.leaky_agent.agent --out /tmp/failure.jsonl
python -m grudge shrink /tmp/failure.jsonl \
  --failure 'never flow read_file to send_http field body' \
  --agent examples.leaky_agent.agent --out /tmp/cassette.json
python -m grudge admit /tmp/cassette.json \
  --bad examples.leaky_agent.agent \
  --good examples.leaky_agent.agent_fixed \
  --out /tmp/scars
python -m grudge run --scars /tmp/scars --agent examples.leaky_agent.agent_fixed
```

The shrink command defaults to the vulnerable example agent for the checked-in
demo. Use `--agent` for another agent module. A module must expose `run_agent`
or `run`, returning a `Trace` from capture and accepting the normal replay
world shape for shrink and gate operations.

## JSON output and debugging

All implemented commands accept `--json`, including `scars list` and
`scars show`. JSON is written as one document on stdout, so it is safe to pipe
to a parser. Expected failures are friendly by default:

```bash
python -m grudge scars show missing-id --json
```

Add `--debug` to place the Python traceback on stderr while retaining the
normal command result/error document on stdout. `grudge run` returns 0 when all
Scars pass, 1 when a Scar is blocked, and 2 for configuration or input errors.

## Scar browsing

```bash
python -m grudge scars list --scars scars
python -m grudge scars show sample_leak --scars scars
```

`scars retire` remains an explicit roadmap stub until the Phase 13 registry is
implemented.
