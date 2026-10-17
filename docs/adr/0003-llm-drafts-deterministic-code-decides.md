# ADR 0003: LLM drafts, deterministic code decides

**Purpose:** Keep optional predicate drafting separate from regression verdicts.
**Audience:** Contributors changing synthesis, checkers, or provider adapters.
**Status:** accepted
**Last updated (phase):** 6

- **Date:** 2026-10-17
- **Context:** A model can generalize a failure, but model output is untrusted
  and nondeterministic. CI cannot rely on a model judging its own draft, and
  the offline demo must work without an API key or provider connection.
- **Decision:** Restrict live model access to the synthesis client. Load a
  packaged prompt, cache completion text on disk by prompt hash, and parse
  and compile each draft using the closed predicate DSL. Feed validation
  errors back for at most two retries, then use a hand-verified demo fallback.
  Offline mode never calls a provider. Compiled checkers evaluate only trace
  data and return exact evidence with deterministic verdicts.
- **Alternatives considered:**
  - **Model-as-judge:** Rejected because the verdict would vary or require
    network access during shrinking, admission, and CI.
  - **Generated Python checkers:** Rejected because executing untrusted code
    expands the security boundary and makes behavior harder to inspect.
  - **Live-only synthesis:** Rejected because cost and provider availability
    would block offline regression workflows.
- **Consequences:** Cache hits avoid repeat provider calls, and malformed
  drafts cannot silently become executable checks. Grammar/type validation
  still does not prove discrimination; Phase 7 must demonstrate red on the
  vulnerable agent and green on the fixed agent. Taint checking is explicitly
  substring/identity based; outcome checking stays a Phase 13 stretch stub.

See [`predicate-dsl.md`](../predicate-dsl.md) and
[`architecture.md`](../architecture.md).
