# Glossary

**Purpose:** Define the shared vocabulary used by Grudge’s typed contracts.
**Audience:** Contributors, reviewers, and demo audiences.
**Status:** final
**Last updated (phase):** 1

| Term | Definition |
|---|---|
| **Trace** | Ordered record of an agent run, including model, tool, result, state, and final-answer steps. |
| **Step** | One discriminated event in a trace. |
| **Cassette** | Frozen task plus tool-response world used to make replay hermetic. |
| **Scar** | Cassette, never-again predicate, provenance, and admission evidence packaged as one regression artifact. |
| **Predicate** | Behavioral rule describing a call shape, ordering, taint flow, or outcome. |
| **Oracle** | Deterministic test that answers whether a candidate cassette still reproduces a failure; implemented in Phase 5. |
| **ddmin** | Zeller’s delta-debugging algorithm for reducing a failing set while preserving the failure; implemented in Phase 5. |
| **Admission** | Proof that a predicate is red on the failing agent and green on the fixed agent; implemented in Phase 7. |
| **Wilson lower bound** | Conservative confidence bound used to gate repeated pass-rate evidence; implemented in Phase 8. |
| **Taint** | Provenance marking that follows sensitive data from a source operation toward a sink. |

Phase 1 establishes the vocabulary and data contracts. Execution semantics are
owned by the later pipeline phases listed in [`architecture.md`](architecture.md).
