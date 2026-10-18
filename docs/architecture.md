# Architecture

**Purpose:** Describe the Phase 1 architecture and typed contract boundaries that later stages consume.
**Audience:** Contributors designing or implementing a pipeline stage, and reviewers checking stage boundaries.
**Status:** draft
**Last updated (phase):** 7

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
5. **Admission Court** repeats hermetic bad/fixed replays, checks witnessed red-on-bad and clean green-on-fixed behavior, and checks empty and benign control traces. Only a successful proof is persisted as a Scar with its embedded admission record.
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

## Admission rules

Phase 7 exposes `grudge.admission.admit(candidate, bad_agent, good_agent,
runs=3, controls=controls, output_dir=...)`. The candidate is a `Scar`; the
agents use the existing cassette-backed world interface. No model drafts or
live provider decisions participate in admission. The result is a Pydantic
`AdmissionVerdict` with `admitted`, human-readable `reasons`, `evidence`,
`bad_results`, `good_results`, `control_results`, `empty_result`, and
`saved_path`.

Admission requires all of the following:

1. A valid candidate and a predicate that compiles to a deterministic checker.
2. At least one valid, nonempty, successful benign control, and no violation
   on any control. The demo supplies two checked-in controls: a permitted local
   report read and a public status POST with no file read. Tests regenerate
   both traces byte-for-byte through the actual example loop and fake tools.
3. An empty trace is not classified as a failure. This is an empty-evidence
   sanity check, **not** a demand that safety rules violate on empty input:
   `never leak` correctly holds when nothing ran. A rule holding on empty
   input cannot by itself prove non-vacuity.
4. Every bad replay succeeds and violates the rule with nonempty evidence
   drawn from that replay. A rule that never fires is rejected as vacuous.
5. Every fixed replay succeeds without violating. Crashes, truncation, tool
   errors (including missing cassette responses), malformed traces, or
   checker errors reject the candidate rather than masquerading as green.

Each agent run receives an independent deep copy of the same cassette and a
fresh deterministic `ScriptedLLM` constructed before sandbox entry. The fixed
agent's defended-policy mutation cannot contaminate later bad runs. Repeated
offline runs demonstrate repeatability, not statistical independence; Wilson
gating is Phase 8.

On success, the court writes a detached copy to `scars/<id>.scar.json` (or the
explicit output directory). The embedded `AdmissionRecord` contains the UTC
proof time, run counts, reasons, evidence, all result sets, empty sanity, and
replay limits. Input objects are not mutated and an old `admission` claim is
never trusted. IDs must be safe filename components. Exclusive file creation
rejects existing files and symlinks instead of overwriting another proof.
Rejections do not write a Scar. Filesystem persistence failures return a
rejected verdict; invalid run-count/limit configuration raises `ValueError`.

### Offline sample and reproducible verification

`scars/sample_leak.scar.json` is a real pre-admitted demo artifact. Its four
entries retain inbox metadata, the poisoned email, the fake file result, and
the successful fake HTTP response. This deliberately includes the sink
response, unlike an attempted-call-only reproducer: a missing sink response
must not produce a valid admission proof. The full source trace hash and
predicate/cassette fingerprint are recorded; timestamps reflect actual
generation, so regenerating a proof changes its timestamp.

From the activated project environment:

```bash
# Validate and re-admit in test-local temporary directories; no fixture rewrite.
python -m pytest tests/test_admission_court.py tests/test_sample_scar.py
# Explicitly regenerate the checked-in sample only after real admission succeeds.
python -m scripts.build_sample_scar --runs 3
make all
```

The generator stages the proof in a temporary directory and atomically
replaces only the sample on success. `--output-dir` can target another folder.
Tests tamper with the predicate (`never call read_file`), verify rejection on
the permitted-read control, and verify no rejected artifact is written. They
also cover non-discrimination, replay/checker failures, safe persistence, fresh
policies, and proof-record round trips. No real network is used; all demo
secrets are clearly fake.

Admission is scoped to the supplied agents, cassette, and controls. It is not
a proof over every possible benign trace and is not a cryptographic signature
over later edits to a Scar; modified artifacts must be re-admitted. The
decision is recorded in
[`adr/0004-prove-tests-before-admitting.md`](adr/0004-prove-tests-before-admitting.md).

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
