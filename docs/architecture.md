# Architecture

**Purpose:** Describe the Phase 0 architecture skeleton that later implementation phases will fill in.
**Audience:** Contributors designing or implementing a pipeline stage, and reviewers checking stage boundaries.
**Status:** draft
**Last updated (phase):** 0

## System boundary

Grudge turns an agent failure trace into a durable regression artifact called a **Scar**. A Scar combines a minimal frozen world (a cassette), a behavioral predicate, and evidence that the predicate distinguishes a failing agent from a fixed agent. The Phase 0 repository has the documentation and planned boundaries only; runtime modules are delivered in later phases.

## Eight-stage pipeline

```text
agent run
   │
   ▼
[1 Recorder] ── raw trace ──► [2 Fault Locator] (stretch)
                                   │
                                   ▼
                         [3 World Shrinker] ──► minimal cassette
                                                     │
                                                     ▼
                                      [4 Predicate Synthesizer]
                                                     │
                                                     ▼
                                      [5 Admission Court]
                                                     │
                              ┌──────────────────────┴─────────────────────┐
                              ▼                                            ▼
                   [6 Variant Fuzzer] (stretch)                 [7 Scar Registry] (stretch)
                              └──────────────────────┬─────────────────────┘
                                                     ▼
                                      [8 CI Gate + Runner]
```

The exported placeholder is [`assets/pipeline.svg`](assets/pipeline.svg). Stage 6 and stage 7 are intentionally deferred; their contracts are recorded in [`roadmap.md`](roadmap.md).

## Data flow and contracts

1. **Recorder** captures model, tool, and result steps as an ordered trace.
2. **Fault Locator** is an optional analysis boundary for finding a point of no return.
3. **World Shrinker** evaluates candidate cassettes with a deterministic oracle and keeps a minimal reproducer.
4. **Predicate Synthesizer** may draft a rule with an LLM, but the resulting rule must compile into deterministic checking code.
5. **Admission Court** proves the rule is red on the bad agent and green on the fixed agent before it becomes a Scar.
6. **Variant Fuzzer** can produce input variants while preserving the failure fingerprint.
7. **Scar Registry** can deduplicate, score, quarantine, and retire artifacts.
8. **CI Gate + Runner** executes admitted Scars repeatedly and makes a Wilson-bound decision.

The deterministic core is the shrinker, predicate checker, admission court, and gate. Live model calls are isolated to predicate drafting and are protected by a cache and offline fallback.

## Planned module map

| Boundary | Planned package | Phase | Contract |
|---|---|---:|---|
| Shared data | `grudge.schema` | 1 | Typed trace, cassette, predicate, and Scar models. |
| Capture | `grudge.recorder` | 3 | Append-only trace recording with redaction hooks. |
| Replay | `grudge.replay` | 4 | Cassette-backed tools and a deterministic sandbox. |
| Reduction | `grudge.shrinker` | 5 | Delta debugging plus content reducers. |
| Rules | `grudge.predicates` | 6 | Parse, compile, and evaluate behavioral predicates. |
| Proof | `grudge.admission` | 7 | Reject predicates that do not discriminate. |
| Statistics | `grudge.gate` | 8 | Repeated runs, Wilson lower bound, and reporting. |
| User surface | `grudge.cli` | 9 | Scriptable capture, shrink, admit, run, and demo commands. |
| Presentation | `viewer/` | 11 | Static event-driven visualization of the CLI pipeline. |

## Extension points

- **Recorder adapters** can wrap raw SDK loops, MCP, or LangGraph without changing the trace contract.
- **Cassette matchers** can evolve from exact arguments to subset and wildcard matching while retaining strict replay diagnostics.
- **Predicate types** can add taint-flow and outcome checks behind the same compiled checker interface.
- **Gate selectors and registries** can remain optional so the offline CLI path stays small and reproducible.
- **Viewer events** are emitted by the demo boundary; the viewer does not own pipeline state or decision logic.

Phase-specific documents will deepen this skeleton as each contract is implemented. Deferred work is tracked in [`roadmap.md`](roadmap.md).
