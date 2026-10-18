# Documentation index

**Purpose:** Map every file currently under `docs/` and show its purpose, owner phase, and status.
**Audience:** Contributors, reviewers, and future implementation agents.
**Status:** final
**Last updated (phase):** 8

## Documents

| File | Purpose | Owner phase | Status |
|---|---|---:|---|
| [`docs/INDEX.md`](INDEX.md) | Complete index of the documentation tree and its delivery status. | 0 | final |
| [`docs/PROGRESS.md`](PROGRESS.md) | Pointer from the docs tree to the canonical root progress tracker. | 0 | final |
| [`docs/architecture.md`](architecture.md) | Pipeline contracts and Phase 7 admission rules and proof boundaries. | 0-7 | draft |
| [`docs/roadmap.md`](roadmap.md) | Design notes for deferred and stretch work across the build phases. | 0 | draft |
| [`docs/trace-format.md`](trace-format.md) | JSONL trace envelope, step union, validation, and helpers. | 1 | final |
| [`docs/cassette-format.md`](cassette-format.md) | Cassette entries, argument matchers, stable identity, and replay semantics. | 1-4 | final |
| [`docs/glossary.md`](glossary.md) | Definitions for trace, cassette, scar, predicate, and pipeline terms. | 1 | final |
| [`docs/scripted-llm.md`](scripted-llm.md) | Gullible policy design, configuration, defended branch, and limits. | 2 | final |
| [`docs/why-not-replay.md`](why-not-replay.md) | Explains cassette-plus-live-policy replay instead of verbatim trace replay. | 4 | final |
| [`docs/shrinking.md`](shrinking.md) | ddmin workflow, content reducers, worked example, and complexity limits. | 5 | final |
| [`docs/predicate-dsl.md`](predicate-dsl.md) | Predicate grammar, rule semantics/evidence, limits, and offline-safe synthesis. | 6 | final |
| [`docs/adr/0003-llm-drafts-deterministic-code-decides.md`](adr/0003-llm-drafts-deterministic-code-decides.md) | Separates optional model drafting from deterministic checking and admission. | 6 | final |
| [`docs/adr/0004-prove-tests-before-admitting.md`](adr/0004-prove-tests-before-admitting.md) | Records red/green, controls, empty sanity, and proof-bearing admission. | 7 | final |
| [`docs/statistics.md`](statistics.md) | Wilson lower bound, gate semantics, reports, offline mode, and limitations. | 8 | final |
| [`docs/adr/0002-ddmin-over-entries-then-content.md`](adr/0002-ddmin-over-entries-then-content.md) | Records the Phase 5 two-level shrink ordering. | 5 | final |
| [`docs/adr/0000-template.md`](adr/0000-template.md) | Reusable template for future architecture decision records. | 0 | final |
| [`docs/adr/0001-cli-first-with-viewer.md`](adr/0001-cli-first-with-viewer.md) | Records the CLI-first product shape and the viewer's supporting role. | 0 | final |
| [`docs/assets/pipeline.svg`](assets/pipeline.svg) | Small exported placeholder diagram for the eight-stage pipeline. | 0 | draft |

## Status vocabulary

- **stub:** The location and intent are established, but the content is intentionally minimal.
- **draft:** Useful for the current phase and expected to grow as implementation lands.
- **final:** Complete for its stated phase; later phases may still add links or detail.

The index is itself checked. Run `python scripts/docs_check.py` from the repository root to verify that every file is listed, every file is non-empty, and every relative Markdown link resolves.
