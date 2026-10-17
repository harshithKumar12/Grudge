# Architecture

**Purpose:** Describe the Phase 1 architecture and typed contract boundaries that later stages consume.
**Audience:** Contributors designing or implementing a pipeline stage, and reviewers checking stage boundaries.
**Status:** draft
**Last updated (phase):** 6

## System boundary

Grudge turns an agent failure trace into a durable regression artifact called a **Scar**. Phase 1 implements the shared Pydantic contracts for traces, cassettes, predicates, and Scars; Phase 2 adds a deterministic fake-world agent whose behavior responds to tool results and exposes a prompt-injection leak; Phase 3 captures those events with an append-only recorder and optional redaction.

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
3. **World Shrinker** first applies entry-level ddmin, then content reducers, evaluating candidate cassettes with a deterministic memoized oracle and keeping a minimal reproducer.
4. **Predicate Synthesizer** drafts a rule using a packaged template and prompt-hash disk cache, validates it through the DSL parser/compiler, retries invalid drafts twice, and otherwise uses the offline demo fallback. Call-shape, ordering, and MVP-lite taint checkers return deterministic verdicts with exact trace evidence; outcome checking stays a stretch stub.
5. **Admission Court** proves the rule is red on the bad agent and green on the fixed agent before it becomes a Scar.
6. **Variant Fuzzer** can produce input variants while preserving the failure fingerprint.
7. **Scar Registry** can deduplicate, score, quarantine, and retire artifacts.
8. **CI Gate + Runner** executes admitted Scars repeatedly and makes a Wilson-bound decision.

The deterministic core is the replay sandbox, shrinker, predicate checker, admission court, and gate. Replay keeps the policy live while replacing external tools with a cassette, and blocks filesystem/network access outside that cassette. Live model calls are isolated to predicate drafting and are protected by a cache and offline fallback.

## Planned module map

| Boundary | Planned package | Phase | Contract |
|---|---|---:|---|
| Shared data | `grudge.schema` | 1 | Typed trace, cassette, predicate, and Scar models with JSON persistence helpers. |
| Example policy | `grudge.replay.scripted_llm` | 2 | Deterministic message-driven gullible policy with defended mode. |
| Demo world | `examples.leaky_agent` | 2 | Pure fake email/file tools plus vulnerable and fixed agent loops. |
| Recording | `grudge.recorder` | 3 | Context manager, decorator, raw SDK adapter, and recursive redaction. |
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

The Phase 1 schema details are in [`trace-format.md`](trace-format.md),
[`cassette-format.md`](cassette-format.md), and [`glossary.md`](glossary.md).
The Phase 2 policy contract is described in [`scripted-llm.md`](scripted-llm.md).
The Phase 4 replay boundary is described in [`why-not-replay.md`](why-not-replay.md).
The Phase 5 shrink workflow is described in [`shrinking.md`](shrinking.md),
with the ordering decision recorded in
[`adr/0002-ddmin-over-entries-then-content.md`](adr/0002-ddmin-over-entries-then-content.md).
The Phase 6 grammar and checking/synthesis limits are described in
[`predicate-dsl.md`](predicate-dsl.md). The model boundary is recorded in
[`adr/0003-llm-drafts-deterministic-code-decides.md`](adr/0003-llm-drafts-deterministic-code-decides.md).
Deferred work is tracked in [`roadmap.md`](roadmap.md).
