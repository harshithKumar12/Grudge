# Documentation index

**Purpose:** Map every file currently under `docs/` and show its purpose, owner phase, and status.
**Audience:** Contributors, reviewers, demo operators, and future implementation agents.
**Status:** final
**Last updated (phase):** 0.1.7 · 2026-10-23

## Documents

| File | Purpose | Owner phase | Status |
|---|---|---:|---|
| [`docs/INDEX.md`](INDEX.md) | Complete index of the documentation tree and its delivery status. | 0-12 | final |
| [`docs/PROGRESS.md`](PROGRESS.md) | Pointer from the docs tree to the canonical root progress tracker. | 0 | final |
| [`docs/architecture.md`](architecture.md) | Pipeline contracts, admission proof boundaries, gate semantics, demo orchestration, CLI integration, and the static viewer boundary. | 0-12 | final |
| [`docs/roadmap.md`](roadmap.md) | Complete register of deferred stubs, design notes, and Phase 13 ordering. | 0-12 | final |
| [`docs/trace-format.md`](trace-format.md) | JSONL trace envelope, step union, validation, and helpers. | 1, updated 3 | final |
| [`docs/cassette-format.md`](cassette-format.md) | Cassette entries, argument matchers, stable identity, and replay semantics. | 1-4 | final |
| [`docs/glossary.md`](glossary.md) | Definitions for trace, cassette, Scar, predicate, and pipeline terms. | 1 | final |
| [`docs/scripted-llm.md`](scripted-llm.md) | Gullible policy design, configuration, defended branch, and limits. | 2 | final |
| [`docs/why-not-replay.md`](why-not-replay.md) | Explains cassette-plus-live-policy replay instead of verbatim trace replay. | 4 | final |
| [`docs/shrinking.md`](shrinking.md) | ddmin workflow, content reducers, worked example, and complexity limits. | 5 | final |
| [`docs/predicate-dsl.md`](predicate-dsl.md) | Predicate grammar, rule semantics/evidence, limits, and offline-safe synthesis. | 6 | final |
| [`docs/adr/0003-llm-drafts-deterministic-code-decides.md`](adr/0003-llm-drafts-deterministic-code-decides.md) | Separates optional model drafting from deterministic checking and admission. | 6 | final |
| [`docs/adr/0004-prove-tests-before-admitting.md`](adr/0004-prove-tests-before-admitting.md) | Records red/green, controls, empty sanity, and proof-bearing admission. | 7 | final |
| [`docs/statistics.md`](statistics.md) | Wilson lower bound, gate semantics, reports, offline mode, and limitations. | 8 | final |
| [`docs/demo-guide.md`](demo-guide.md) | CLI reference, five-beat offline demo, event server, viewer controls, JSON/errors, and fallback recording. | 9-12 | final |
| [`docs/viewer-events.md`](viewer-events.md) | Typed five-beat event schema, ordering, SSE transport, state replay, and restart behavior. | 10 | final |
| [`docs/adr/0002-ddmin-over-entries-then-content.md`](adr/0002-ddmin-over-entries-then-content.md) | Records the Phase 5 two-level shrink ordering. | 5 | final |
| [`docs/adr/0000-template.md`](adr/0000-template.md) | Reusable template for future architecture decision records. | 0 | final |
| [`docs/adr/0001-cli-first-with-viewer.md`](adr/0001-cli-first-with-viewer.md) | Records the CLI-first product shape and the viewer's supporting role. | 0 | final |
| [`docs/assets/pipeline.svg`](assets/pipeline.svg) | Exported eight-stage engine pipeline diagram used by the README and architecture docs. | 0-12 | final |
| [`docs/assets/shrink.svg`](assets/shrink.svg) | Static visual reference for the trace-to-minimal-cassette shrink story. | 12 | final |
| [`docs/assets/grudge-logo.png`](assets/grudge-logo.png) | Repository logo used by the README and package documentation. | 0.1.6 | final |
| [`docs/interfaces.md`](interfaces.md) | Frozen cross-lane Python, Node, session, compiled JSON, and hook interfaces. | 14 | final |
| [`docs/guard-contract.md`](guard-contract.md) | Compiled predicate schema and deterministic runtime evaluation semantics. | 14 | final |
| [`docs/canonical-tools.md`](canonical-tools.md) | Canonical tool names and the Claude Code normalization map. | 14 | final |
| [`docs/trust-model.md`](trust-model.md) | Stored session data, redaction, retention, and local trust boundaries. | 16 | final |
| [`docs/integrations.md`](integrations.md) | Per-agent installer verification status and safe no-write policy. | 19 | final |
| [`docs/hooks.md`](hooks.md) | Hook event contracts, fail-open behavior, output caps, and measured timings. | 17 | final |
| [`docs/cli-output.md`](cli-output.md) | Human-readable default output, stable JSON mode, marks, errors, and command matrix. | 0.1.7 | final |
| [`docs/instruction-block.md`](instruction-block.md) | The compact managed model instruction block and its rationale. | 18 | final |
| [`docs/token-budgets.md`](token-budgets.md) | Enforced output caps, token estimates, stats, and status-line discipline. | 20 | final |
| [`docs/FINAL-REPORT.md`](FINAL-REPORT.md) | Final parallel-mode Definition of Done evidence, limitations, and release commands. | 21 | final |
| [`../TEST.md`](../TEST.md) | Scratch-directory walkthrough for setup, hooks, stats, savings, and uninstall. | 24 | final |

## Status vocabulary

- **stub:** The location and intent are established, but the runtime behavior is intentionally unavailable and raises an explicit roadmap error.
- **draft:** Useful for the current phase but still missing a stated completion boundary.
- **final:** Complete for its stated phase; later phases may add links or detail without changing the recorded contract.

The index is itself checked. Run `python scripts/docs_check.py` from the
repository root to verify that every file is listed, every file is non-empty,
and every relative Markdown link resolves.
