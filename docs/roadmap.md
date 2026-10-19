# Roadmap

**Purpose:** Record every deferred runtime stub and design note honestly so later phases can implement it without changing the MVP contract.
**Audience:** Contributors, reviewers, and demo owners deciding what belongs in the MVP.
**Status:** final
**Last updated (phase):** 12

## Phase sequence

The implementation proceeds one phase at a time: schemas (1), the leaky-agent story (2), recording (3), replay (4), shrinking (5), predicates (6), admission (7), statistics and gating (8), CLI (9), demo events (10), viewer (11), and polish (12). Stretch implementations wait until the core story is complete in phase 13.

## Stretch register

| Item | What | Why it is deferred | How it plugs in |
|---|---|---|---|
| Fault locator (`grudge/locator/fork.py`, `point_of_no_return.py`) | Fork a run at step *k*, swap a decision, and find the earliest successful alternative. | The MVP can shrink a known failing world without causal search. | Consumes traces and calls the replay sandbox; reports evidence alongside the shrink result. |
| MCP and LangGraph recorder adapters (`grudge/recorder/adapters/`) | Capture traces from two common orchestration surfaces. | The raw SDK adapter is enough to prove the recorder contract first. | Implements the recorder adapter boundary and emits the shared trace format. |
| Variant fuzzer (`grudge/fuzzer/`) | Paraphrase injections, reorder entries, add noise, and swap names while preserving a fingerprint. | Variants add breadth after one deterministic Scar is proven. | Runs after shrinking and before admission or registry insertion; guarded by fingerprint checks. |
| Scar registry (`grudge/registry/`) | Store fingerprints, predicate hashes, flake scores, quarantine state, and retirement metadata in SQLite. | A filesystem of admitted Scars is sufficient for the MVP demo. | Receives admitted Scars and supplies selection and lifecycle queries to the gate. |
| Gate selector (`grudge/gate/selector.py`) | Run only Scars related to changed prompts, tools, or models. | Full-suite execution is clearer while contracts are still moving. | Filters registry results before the repeated-run gate. |
| GitHub integrations (`grudge/integrations/`, workflow) | Pytest plugin, PR comment publisher, and CI workflow. | Local CLI output demonstrates the decision without external credentials. | Converts gate verdicts into CI status and review feedback. |
| Outcome predicate (`grudge/predicates/outcome.py`) | Assert final state rather than only call shape, ordering, or taint flow. | The demo's leak rule needs call and taint evidence first. | Adds another compiled predicate implementation and admission test coverage. |
| Full Scar browser (`viewer/components/scar_browser.js`) | Browse, filter, and retire saved Scars from the viewer. | The current viewer only needs to expose the evidence trail; filesystem summaries are enough for the MVP. | Reads registry or filesystem summaries without owning mutation or evaluation. |
| CLI viewer and Scar retirement (`grudge/cli/main.py`, `grudge/cli/scars.py`) | Make `grudge viewer` a first-class server command and implement `scars retire`. | `grudge demo` already starts the supported local viewer; mutation needs registry semantics. | Delegates to the server and registry once those contracts exist. |
| Benchmark measurement integration (`scripts/generate_trace.py` plus runner) | Generate configurable failing traces and feed measured shrink results into benchmark tables. | The Phase 12 helper now generates deterministic inputs, but it does not time shrinking or aggregate measurements. | Produces stable inputs for README and stress-test measurements; a future runner must never fabricate timings. |

## Delivery rules

- A stretch item remains an explicit stub until its owning phase is approved. Implemented MVP boundaries may have a minimal presentation-only surface, such as the current Scar evidence panel, without implying registry support.
- A stub documents its contract, integration point, and reason for deferral; it does not silently pretend to be production-ready.
- Every implementation phase updates [`architecture.md`](architecture.md) and this register when a boundary changes.
- New non-obvious choices receive an ADR based on [`adr/0000-template.md`](adr/0000-template.md).

## Phase 12 boundary

Phase 12 is complete when the README, pitch artifacts, fallback procedure,
documentation index, measured benchmark row, and reproducibility audit describe
the built offline path accurately. It does not implement any remaining runtime
item in this register. The benchmark helper produces deterministic inputs; the
README records one measured capture/shrink run and labels its environment, but
there is no automatic timing or aggregation service.

## Phase 13 implementation order

1. Registry and Scar lifecycle: `grudge/registry/*`, then `scars retire`.
2. Fault locator: `grudge/locator/*`.
3. Variant fuzzer: `grudge/fuzzer/*` with fingerprint guards.
4. Changed-Scar selector: `grudge/gate/selector.py`.
5. Pytest/GitHub integrations and CI workflow.
6. Outcome predicates and MCP/LangGraph recorder adapters.
7. Full viewer Scar browser integration.
