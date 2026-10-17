# ADR 0002: ddmin over entries, then content

**Purpose:** Record the Phase 5 shrink ordering.
**Audience:** Contributors changing cassette reduction or oracle behavior.
**Status:** accepted
**Last updated (phase):** 5

- **Date:** 2026-10-17
- **Context:** A recorded failure cassette contains both a causal sequence of
  tool responses and irrelevant detail inside those responses. Removing text
  before removing whole entries creates unnecessary oracle calls and can make
  the causal sequence harder to recognize.
- **Decision:** First apply pure Zeller ddmin to the ordered cassette entries.
  Then apply deterministic content reducers to the surviving responses and
  matchers. Keep a candidate only when the hermetic replay oracle still
  reproduces the seed predicate, and record every attempt in ordered history.
- **Alternatives considered:**
  - **Content-first reduction:** Rejected because it spends the budget on
    fields belonging to entries that will later be discarded.
  - **Greedy one-pass deletion:** Rejected because interacting culprit pairs
    require complement testing and granularity changes.
  - **Verbatim trace slicing:** Rejected because it bypasses the live policy
    and cannot establish causal reproduction.
- **Consequences:** Entry reduction is independent and property-testable;
  content reducers can remain small and composable. The two-level process can
  require many oracle calls, so memoization and an explicit call budget are
  part of the public oracle contract. The resulting history is suitable for
  later viewer animation.

See [`shrinking.md`](../shrinking.md) and the replay boundary in
[`architecture.md`](../architecture.md).
