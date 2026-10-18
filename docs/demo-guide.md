# Phase 9 CLI and offline demo

**Purpose:** Explain the scriptable CLI pipeline and the deterministic demo.
**Audience:** Contributors, CI authors, and demo operators.
**Status:** final
**Last updated (phase):** 9

## Offline demo

The demo uses the checked-in `scars/sample_leak.scar.json` and the scripted
agents. It does not call a provider or open a browser:

```bash
python -m grudge demo --no-browser
```

The fixed agent must pass and the vulnerable agent must be blocked. Machine
consumers can request one JSON document instead of Rich output:

```bash
python -m grudge demo --no-browser --runs 2 --json
```

`--live` and the viewer `--port` are accepted as forward-compatible options;
live providers and the event-stream viewer are implemented in later phases.

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
