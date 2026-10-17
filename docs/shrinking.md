# Shrinking a failure cassette

**Purpose:** Explain the two-level reduction used to turn a full replay
cassette into a small, reviewable reproducer.
**Audience:** Contributors implementing or reviewing shrinkers and users
reading shrink history.
**Status:** final
**Last updated (phase):** 5

## The question the shrinker answers

Given a cassette that reproduces a seed failure, Grudge asks which external
responses are actually necessary for the failure to remain. It never replays a
recorded assistant transcript. Every candidate is run through the Phase 4
replay sandbox with the live deterministic policy and checked by the seed
predicate.

## Level 1: remove entries with ddmin

`grudge.shrinker.ddmin.minimize(items, test)` implements Zeller's delta
debugging algorithm. It starts with two contiguous partitions, tries retaining
each subset, then tries each complement, and increases the granularity when no
candidate reproduces. A successful reduction resets the search toward two
partitions. The result is 1-minimal when no single remaining item can be
removed while keeping `test` true.

Every attempted candidate produces a stable event:

```json
{
  "attempted_removal": 4,
  "kept": true,
  "size_before": 8,
  "size_after": 4
}
```

The pure algorithm knows nothing about agents. `PredicateOracle` supplies the
test in the real pipeline and memoizes evaluations by cassette content hash.
Repeated runs can be required when a seed predicate is suspected to be flaky;
all configured repetitions must reproduce for a candidate to be kept.

## Level 2: reduce content

After entry reduction, content reducers try smaller responses and matchers:

- `TrimDocument` removes irrelevant lines and then sentences from text fields;
- `BlankField` replaces selected fields with neutral JSON values;
- `NormalizeIds` renames stable entity tokens such as `email-042` to
  `email_1`, updating all references together.

Each candidate is copied, validated, and kept only if the reproduction test
still passes. This makes reducers composable and prevents an invalid cassette
from entering the next oracle call.

## Worked example

The Phase 2 failing agent produces a full cassette with one entry for each
tool call. Running the Phase 5 builder against the leak predicate first removes
ordinary email reads and unrelated list results. The remaining content is the
poisoned email response, the `read_file(api_keys.txt)` response, and the
`send_http` sink response. Content reduction then removes irrelevant fields
and matcher detail while preserving the fake key's flow to the sink.

The acceptance run records the measured result in the test suite: the minimal
cassette has at most three entries, is below 1 KiB, has a non-empty ordered
history, and reproduces the leak from the cassette alone.

## Complexity and limits

If there are `n` entries, ddmin typically makes `O(n log n)` candidate tests in
the common case, but the exact count depends on the predicate and interaction
between entries. Content reduction can add many more tests because each field
and text chunk is considered independently. `PredicateOracle` therefore
supports `max_oracle_calls`; exhausting the budget raises `OracleError` rather
than silently returning a result that was not checked.

The shrinker minimizes the supplied seed predicate, not an arbitrary notion
of semantic equivalence. A weak or overly broad predicate can preserve too
much or too little; predicate synthesis and admission are later phases that
strengthen this guarantee.
