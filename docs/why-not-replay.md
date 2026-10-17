# Why not replay the trace verbatim?

**Purpose:** Explain the Phase 4 replay boundary for deterministic agent
regression tests.
**Audience:** Contributors deciding what belongs in a cassette and reviewers
checking that a replay is a real behavioral reproduction.
**Status:** final
**Last updated (phase):** 4

## A trace is evidence, not a test script

A recorded trace tells us what happened once: which model actions were
selected, which tools were called, and which results were returned. Replaying
those same steps verbatim can prove that a log can be copied. It cannot prove
that the agent would make the same decision when the policy, prompt, or world
response changes.

Verbatim replay also hides the failure boundary. If the runner simply feeds a
stored assistant action back into the next step, it never asks the policy to
react to the response. A missing poisoned email could therefore appear to
reproduce a leak even though a live policy would have stopped before reading a
secret.

## Cassette plus live policy

Grudge converts the tool calls and results from a source trace into a full,
unshrunk cassette. The cassette freezes the external world: it is the only
source of tool responses during replay. The policy remains live and chooses
each next action from the messages produced so far.

This separation gives us both properties we need:

1. **Determinism:** the cassette has stable JSON content, matcher precedence,
   and single-use entries; the Phase 2 scripted policy is deterministic.
2. **Causality:** changing or shrinking the cassette changes what the policy
   sees, so a regression is reproduced only when the relevant world evidence
   is still present.

The replay sandbox additionally rejects filesystem and network access outside
the cassette, applies step and time limits, and returns a schema-valid failed
trace when the agent or the sandbox limit fails. Strict misses are useful
diagnostics while lenient misses are available for exploratory runs.

## What replay does not claim

Replay does not model a real provider, network service, or operating-system
filesystem. Those belong behind explicit adapters or later integration tests.
It answers the narrower and more useful regression question: *does this live
agent policy still fail when supplied the frozen evidence that caused the
original failure?*
