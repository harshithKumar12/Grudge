# Slides outline

Six slides maximum. Keep the live demo on one slide and use the offline,
deterministic label wherever a result is shown.

## 1. The problem: agent mistakes are hard to keep out

- Long provider-dependent traces are expensive to replay and review.
- Verbatim transcript replay does not test whether the live policy would react
  differently to a changed world.
- One sentence: **Agents repeat mistakes. Grudge makes each one happen exactly once.**

## 2. Why replay fails

- A trace is evidence of what happened once, not a behavioral test.
- Grudge freezes tool responses in a cassette while the policy chooses each next
  action live.
- Missing the poisoned email therefore changes the policy's next decision;
  causality survives shrinking.

## 3. The three artifacts

- **Cassette:** minimal frozen world and single-use matcher history.
- **Predicate:** readable call/order/taint rule with exact evidence.
- **Verdict:** admission proof plus repeated-run Wilson gate decision.
- One Scar packages all three with provenance.

## 4. Live demo: five beats

- Capture the vulnerable run.
- Shrink the world from a noisy trace to the causal entries.
- Show the offline fallback predicate.
- Prove red bad / green fixed admission.
- Reintroduce the bug and show the gate block plus PR comment.

## 5. Results and stats

- Fixed agent: clean replay and passing gate.
- Vulnerable agent: witnessed predicate violation and blocked gate.
- Wilson lower bound is the decision metric; offline repeats demonstrate
  repeatability, not independent statistical samples.
- Benchmark table is intentionally unmeasured until the synthetic generator is
  implemented and run on a clean Linux environment.

## 6. Roadmap

- Registry and lifecycle first, then causal fault location and variant fuzzing.
- Changed-Scar selection and GitHub/pytest integrations.
- Outcome predicates, MCP/LangGraph adapters, and full Scar browsing.
- Link: [`docs/roadmap.md`](../docs/roadmap.md).
