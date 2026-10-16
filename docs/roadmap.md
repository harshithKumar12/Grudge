# Roadmap

**Purpose:** Record deferred work honestly so later phases can implement it without changing the Phase 0 contract.
**Audience:** Contributors, reviewers, and demo owners deciding what belongs in the MVP.
**Status:** draft
**Last updated (phase):** 0

## Phase sequence

The implementation proceeds one phase at a time: schemas (1), the leaky-agent story (2), recording (3), replay (4), shrinking (5), predicates (6), admission (7), statistics and gating (8), CLI (9), demo events (10), viewer (11), and polish (12). Stretch implementations wait until the core story is complete in phase 13.

## Stretch register

| Item | What | Why it is deferred | How it plugs in |
|---|---|---|---|
| Fault locator | Fork a run at step *k*, swap a decision, and find the earliest successful alternative. | The MVP can shrink a known failing world without causal search. | Consumes traces and calls the replay sandbox; reports evidence alongside the shrink result. |
| MCP and LangGraph recorder adapters | Capture traces from two common orchestration surfaces. | The raw SDK adapter is enough to prove the recorder contract first. | Implements the recorder adapter boundary and emits the shared trace format. |
| Variant fuzzer | Paraphrase injections, reorder entries, add noise, and swap names while preserving a fingerprint. | Variants add breadth after one deterministic Scar is proven. | Runs after shrinking and before admission or registry insertion; guarded by fingerprint checks. |
| Scar registry | Store fingerprints, predicate hashes, flake scores, quarantine state, and retirement metadata in SQLite. | A filesystem of admitted Scars is sufficient for the MVP demo. | Receives admitted Scars and supplies selection and lifecycle queries to the gate. |
| Gate selector | Run only Scars related to changed prompts, tools, or models. | Full-suite execution is clearer while contracts are still moving. | Filters registry results before the repeated-run gate. |
| GitHub integrations | Pytest plugin and PR comment publisher. | Local CLI output demonstrates the decision without external credentials. | Converts gate verdicts into CI status and review feedback. |
| Outcome predicate | Assert final state rather than only call shape, ordering, or taint flow. | The demo's leak rule needs call and taint evidence first. | Adds another compiled predicate implementation and admission test coverage. |
| Scar browser | Browse saved Scars in the viewer. | The viewer's first job is to make shrinking and gate evidence visible. | Reads registry or filesystem summaries without owning mutation or evaluation. |

## Delivery rules

- A stretch item remains an explicit stub until its owning phase is approved.
- A stub documents its contract, integration point, and reason for deferral; it does not silently pretend to be production-ready.
- Every implementation phase updates [`architecture.md`](architecture.md) and this register when a boundary changes.
- New non-obvious choices receive an ADR based on [`adr/0000-template.md`](adr/0000-template.md).

## Phase 0 exit target

Phase 0 establishes the documentation index, architecture skeleton, roadmap, ADR format, and a self-checking docs tree. It does not claim that the runtime pipeline exists yet.
