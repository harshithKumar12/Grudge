# ADR 0004: Prove tests before admitting them

**Purpose:** Record the evidence required before a regression rule enters the suite.
**Audience:** Contributors implementing admission, Scar persistence, or CI runners.
**Status:** accepted
**Last updated (phase):** 7

- **Date:** 2026-10-18
- **Context:** A syntactically valid rule can always pass, fail on both agent
  versions, or reject ordinary permitted activity. Such a rule is not useful
  regression protection. A crashed replay must not be mistaken for a fix.
- **Decision:** Repeat bad and fixed agents against independent copies of the
  same cassette using fresh deterministic policies. Require witnessed
  violations on every successful bad run, clean successful fixed runs, and
  clean nonempty benign controls. Empty input must not count as failure
  evidence; a safety rule holding on empty is allowed only alongside real bad
  witnesses. Fail closed on replay, checker, validation, or persistence errors.
  Save only admitted copies with embedded, timestamped proof records.
- **Alternatives considered:**
  - **Admit on model confidence or parsing alone:** Rejected because neither
    proves discrimination between the bug and its fix.
  - **Only check the vulnerable run:** Rejected because an always-failing or
    overly broad rule could then enter the suite.
  - **Reject every rule satisfied by an empty trace:** Rejected because it
    would reject the demo's legitimate forbidden-flow safety rule. Instead
    require actual violation evidence on bad runs and no empty-input failure.
  - **Silently accept failed or incomplete replays:** Rejected because a tool
    mismatch or exception is not evidence of safe behavior.
- **Consequences:** Proof records explain why a Scar was admitted, and rejected
  candidates carry actionable reasons without writing artifacts. Controls
  remain finite evidence, not universal proof. Offline repeats prove
  repeatability rather than independent samples. Existing proof paths are
  protected against overwrite; the explicit sample generator stages a new
  proof and replaces its own fixture only after successful admission. Changed
  rules need re-admission; admission records are not tamper-proof signatures.

See the admission rules in [`architecture.md`](../architecture.md) and the
deterministic checker semantics in [`predicate-dsl.md`](../predicate-dsl.md).
