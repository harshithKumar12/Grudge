# Progress.md: Grudge build tracker

_Last updated: 2026-10-18 by omnirush.ai_

## Snapshot
- **Current phase:** 10: Demo Orchestrator & Event Stream complete
- **Overall:** 11/14 phases complete
- **Test suite:** 281 passing in WSL Ubuntu-D Python 3.11.17
- **Demo status:** works offline? yes
- **Next action:** Begin Phase 11 only after owner approval.

## Phase Board
| # | Phase | Status | Exit gate passed | Docs done |
|---|-------|--------|------------------|-----------|
| 0 | Bootstrap & Governance | [x] | yes | [x] |
| 1 | Schemas | [x] | yes | [x] |
| 2 | Leaky Agent & Scripted LLM | [x] | yes | [x] |
| 3 | Recorder | [x] | yes | [x] |
| 4 | Replay Engine | [x] | yes | [x] |
| 5 | Shrinker | [x] | yes | [x] |
| 6 | Predicates | [x] | yes | [x] |
| 7 | Admission Court | [x] | yes | [x] |
| 8 | Gate & Statistics | [x] | yes | [x] |
| 9 | CLI | [x] | yes | [x] |
| 10 | Demo Orchestrator & Event Stream | [x] | yes | [x] |
| 11 | Viewer | [ ] | no | no |
| 12 | Polish, Docs, Pitch | [ ] | no | no |
| 13 | Stretch Implementations | [ ] | no | no |

## Task Checklist
### Phase 0
- [x] Confirm owner instructions and pre-flight inputs.
- [x] Create the full package and directory skeleton with importable modules.
- [x] Create `pyproject.toml`, pinned runtime metadata, lockfile, Makefile, and `.env.example`.
- [x] Implement configuration, error hierarchy, CLI help surface, and honest stretch stubs.
- [x] Create the docs system, docs checker, architecture skeleton, roadmap, and ADRs.
- [x] Add Phase 0 tests for configuration, errors, CLI help, stubs, and docs checking.
- [x] Run the Phase Exit Protocol and commit `phase-0: complete bootstrap & governance`.

### Phase 1
- [x] Implement `Trace` and its discriminated step models with JSONL round-trip helpers.
- [x] Implement `Cassette` and argument matcher contracts with stable hashing and size reporting.
- [x] Implement predicate AST models, combinators, and plain-English descriptions.
- [x] Implement `Scar` metadata, admission record, fingerprint, and JSON file I/O.
- [x] Add model round-trip, invalid payload, Hypothesis, and description snapshot tests.
- [x] Write and index `trace-format.md`, `cassette-format.md`, and `glossary.md`.
- [x] Run the Phase 1 Exit Protocol; owner commit command is supplied in the handoff report.

### Phase 2
- [x] Implement the fake email/file world and pure tool functions.
- [x] Implement the deterministic gullible `ScriptedLLM` policy with defended mode.
- [x] Implement vulnerable and fixed agents with trace output.
- [x] Add the poisoned inbox, fake secret, scripted policy configuration, and example README.
- [x] Add leak, fixed-agent, causality, and byte-identical determinism tests.
- [x] Write and index `docs/scripted-llm.md`; update architecture.
- [x] Run the Phase 2 Exit Protocol; owner commit command is supplied in the handoff report.

### Phase 3
- [x] Implement `Recorder` context manager and `@record` decorator with append-only JSONL output.
- [x] Record model calls, tool calls, tool results, state diffs, final answers, and failed outcomes with monotonic indexes.
- [x] Implement the raw SDK adapter boundary used by the example agent.
- [x] Implement regex-based redaction with pluggable rules and reversible-off test behavior.
- [x] Keep MCP proxy and LangGraph adapters as documented roadmap stubs.
- [x] Add recorder schema/order/exception/redaction tests and update trace/architecture docs.
- [x] Run the Phase 3 Exit Protocol; owner commit command is supplied in the handoff report.

### Phase 4
- [x] Implement cassette playback with exact/subset/any precedence, consumption tracking, strict misses, and lenient misses.
- [x] Implement the hermetic sandbox with cassette-backed tool methods, filesystem/network guards, time and step limits, and failed Trace results.
- [x] Implement `world_from_trace(trace)` for full unshrunk cassette conversion.
- [x] Add replay tests for failure reproduction, missing-poison causality, strict mismatch, hermetic guards, limits, determinism, and cassette conversion.
- [x] Write and index `why-not-replay.md`; update cassette and architecture docs.
- [x] Run the Phase 4 Exit Protocol; owner commit command is supplied in the handoff report.

### Phase 5
- [x] Implement memoized `PredicateOracle` with repeats and `max_oracle_calls` budget handling.
- [x] Implement pure Zeller ddmin with ordered progress callbacks, stats, and 1-minimality coverage.
- [x] Implement `TrimDocument`, `BlankField`, and `NormalizeIds` content reducers.
- [x] Implement `build_minimal_cassette` with entry reduction before content reduction and ordered history.
- [x] Add synthetic, property-based, oracle, reducer, and real leaky-agent shrink tests.
- [x] Write and index `shrinking.md` and ADR 0002; update architecture documentation.
- [x] Run the Phase 5 Exit Protocol; owner commit command is supplied in the handoff report.

### Phase 6
- [x] Implement readable DSL parsing, canonical printing, and located parse errors.
- [x] Implement deterministic call-shape, ordering, and MVP-lite taint checkers with exact trace evidence.
- [x] Reject ill-typed rules and retain outcome checking as an explicit Phase 13 stub.
- [x] Persist source-filtered taint rules and groups through the shared predicate/Scar contracts.
- [x] Implement hand-verified demo fallback, packaged prompt, optional provider client, prompt-hash disk cache, and bounded synthesis retries.
- [x] Add DSL, checker, schema-persistence, offline, retry/fallback, and cache tests; prove red-on-vulnerable and green-on-fixed acceptance.
- [x] Write and index `predicate-dsl.md` and ADR 0003; update architecture and provider environment examples.
- [x] Run Phase 6 exit checks; commit this phase and stop before Phase 7.

### Phase 7
- [x] Implement repeated red-on-bad/green-on-fixed admission with fresh policies and isolated cassettes.
- [x] Implement typed verdicts, exact evidence, empty sanity, benign controls, and readable rejection reasons.
- [x] Fail closed on vacuous/non-discriminating predicates, replay/checker failures, tool errors, and invalid controls.
- [x] Persist only admitted copies with embedded proof records and safe exclusive filenames.
- [x] Add actual benign control traces, the sample generation command, and prebuilt `scars/sample_leak.scar.json`.
- [x] Verify repeated demo admission, predicate tampering rejection, persistence round trips, and all negative boundaries.
- [x] Document architecture admission rules, ADR 0004, README steps, and container fixture copies.
- [x] Pass Phase 7 exit checks and include this tracker in `phase-7: complete admission court`; stop before Phase 8.

### Phase 8
- [x] Implement validated Wilson lower-bound calculation with empty-sample handling and known-value/property tests.
- [x] Implement admitted-Scar gate runner with fresh policies, deep cassette copies, per-run traces/evidence, offline metadata, and fail-closed replay/checker handling.
- [x] Implement CI status mapping (`0` pass, `1` blocked, `2` configuration/error), Rich terminal output, and deterministic PR Markdown reporting.
- [x] Add fixed-agent pass and vulnerable-agent block acceptance tests plus report snapshots and invalid-input tests.
- [x] Write and index `statistics.md`; update architecture with gate semantics and limitations.
- [x] Pass Phase 8 Exit Protocol and commit this phase; stop before Phase 9.

### Phase 9
- [x] Scriptable CLI commands and tests.
- [x] Capture, shrink, admit, run, demo, and Scar browsing commands expose consistent JSON/error behavior.
- [x] Verify the shell pipeline end to end on the vulnerable and fixed example agents.
- [x] Update CLI and demo documentation, then run the complete Phase Exit Protocol.

### Phase 10
- [x] Demo orchestrator, event stream, server, and tests.
- [x] Real five-beat offline flow emits typed, ordered events and blocks the reintroduced regression.
- [x] SSE server serves static viewer assets, event replay, state, and restart.
- [x] Document the event contract, server endpoints, pacing, and fallback video procedure.

### Phase 11
- [ ] Static viewer and viewer tests.

### Phase 12
- [ ] Final docs, pitch material, benchmarks, and audit.

### Phase 13
- [ ] Stretch implementations, one sub-entry per item.

## Decisions & Conflicts
| Date | Decision / conflict | Reason | Affects |
|------|--------------------|--------|---------|
| 2026-10-15 | `docs/PROGRESS.md` existed but was empty; use root `Progress.md` as the canonical tracker required by PROMPT.md, and retain the docs file as a pointer. | The specification's final layout and all phase rules name root `Progress.md`; the user's note identified the empty docs file as the intended existing tracker. | Progress tracking and docs-check |
| 2026-10-15 | Choose the standard-library `http.server` path for Phase 0 rather than adding FastAPI/Uvicorn. | Phase 0 needs only a buildable skeleton; this minimizes dependencies and keeps the bootstrap offline-friendly. | pyproject.toml, ADR 0001 |
| 2026-10-15 | Keep the required Python 3.11.11 pin instead of widening it to accommodate the host's Python 3.14. | The specification requires Python 3.11+ and the lock's pinned Pydantic version has no usable host-Python wheel here; the project must remain reproducible on its declared runtime. | .python-version, requirements.lock |
| 2026-10-16 | Phase 0 exit gate is passed by owner commit `aa965bc` (`phase-0: complete bootstrap & governance`). | Owner-provided WSL Ubuntu/Python 3.11.17 evidence shows `make test` (20 passed), lint, typecheck, docs-check, `make all`, and CLI help all green. | Phase Board, Snapshot, Phase 1 start |
| 2026-10-16 | Docker is optional and is not part of any exit gate. | Owner clarified that PROMPT.md does not require Docker for phase exits. Keep the Dockerfile as an optional reproducibility artifact. | Progress blockers and exit protocol |
| 2026-10-16 | Supported Python range is `>=3.11,<3.14`; `.python-version` uses `3.11`. | Owner decision broadens the prior exact patch pin while excluding the unsupported Python 3.14 environment. | pyproject.toml, .python-version |
| 2026-10-16 | The schema import failure was a Phase 1 acceptance failure, not a Phase 0 failure. | `Trace`, `Cassette`, and `Scar` are Phase 1 deliverables. | Phase 1 implementation and acceptance |
| 2026-10-16 | All commands run in WSL with the activated `.venv`; failed git commands do not block implementation. | Owner will perform commits in their terminal when needed. | Command execution and handoff |
| 2026-10-16 | Root `Progress.md` is canonical; `docs/PROGRESS.md` is a one-line pointer. | Prevent duplicate progress trackers from drifting. | docs/PROGRESS.md, docs-check |
| 2026-10-17 | Shrink cassettes in two levels: entry ddmin first, then deterministic content reducers. | Whole-entry reduction exposes the causal set before spending oracle calls on response detail; memoization and a call budget control the remaining search cost. | `grudge/shrinker/`, ADR 0002, `docs/shrinking.md` |
| 2026-10-17 | Keep model drafting outside deterministic checking; add persisted `FilteredTaintFlow` for source argument filters and package the synthesis template. | DSL rules must retain their filters through Scar JSON. Drafts must parse and compile before use; outcome checking stays a stretch stub. Offline mode and cached drafts require no credentials or network. No dependencies were added. | Phase 6 predicates, schema union, provider cache, ADR 0003 |
| 2026-10-18 | Interpret empty-trace sanity as no failure evidence on an empty trace, not rejection of every safety rule satisfied by an empty trace. | The demo's forbidden-flow safety rule necessarily holds on empty input. Admission still requires witnessed violations on bad runs, clean good runs, and nonempty benign controls; empty replay alone is never proof. | Phase 7 court, architecture admission rules |
| 2026-10-18 | Keep four complete response entries in the admitted demo cassette, including the successful sink response. | Phase 7 rejects tool replay errors; a missing sink response is not a successful complete proof even when the Phase 5 attempted-call predicate still fires. | `scars/sample_leak.scar.json`, sample generator |
| 2026-10-18 | Make narrow example typing fixes now reached by the sample script, and copy example/control/Scar/docs inputs into Docker. | The new script makes the normal typecheck traverse both example agents, exposing three older typing errors. Shared `Step` annotations and dataclass-instance narrowing fix these without changing trace output. Container copies keep the new offline fixtures available; no dependencies added. | Examples, Dockerfile, Phase 7 reproducibility |
| 2026-10-18 | Count a gate pass only when replay succeeds and the compiled predicate is clean; use the lower Wilson bound, not observed pass rate, for the threshold decision. | A replay/checker error must not look like a safe run. Small-N pass rates are optimistic, so the lower bound is the conservative CI decision. Offline repeated runs are deterministic and explicitly labeled rather than presented as independent samples. | Phase 8 gate runner, `statistics.md`, reports |

## Blockers
| Date | Blocker | Tried | Needs |
|------|---------|-------|-------|
| 2026-10-15 | The repository has no existing lockfile or project metadata. | Resolved by Phase 0 bootstrap and owner commit `aa965bc`. | Closed |
| 2026-10-15 | Host cannot run the complete exit protocol under the original Windows environment. | Superseded by owner’s WSL evidence and Phase 0 commit. | Closed; Docker is not required |
| 2026-10-15 | Exact dependency install from `requirements.lock` cannot build `pydantic-core` on host Python 3.14 without Rust/Cargo. | Superseded by owner’s Python 3.11.17 WSL environment. | Closed |
| 2026-10-15 | Session 2 re-confirmed the Phase 0 blocker in the original host environment. | Superseded by owner’s WSL evidence and commit. | Closed |
| 2026-10-15 | WSL2 initially lacked Python 3.11 and Docker CLI. | Owner supplied a working Python 3.11.17 WSL environment; Docker removed from the gate. | Closed |
| 2026-10-15 | Owner’s WSL service temporarily returned `Wsl/Service/CreateInstance/E_FAIL`. | Owner later supplied successful WSL checks and commit evidence. | Closed |

## Known Issues & Tech Debt
- Phase 0 intentionally leaves all stretch modules as documented `NotImplementedError` stubs.
- Phase 2’s fixed agent uses a simple substring taint check and explicit confirmation heuristic; generalized taint semantics belong to Phase 6.
- Phase 6 taint checking is substring/typed-identity matching, not complete provenance tracking; transformation/implicit-flow limits are documented in `docs/predicate-dsl.md`.
- One Phase 6 full-suite run intermittently failed the existing Phase 5 cassette-builder reproduction assertion. The focused rerun and two subsequent full-suite runs passed without shrinker changes; the underlying intermittent replay/shrinker behavior remains unisolated.

## Doc Debt
- Phase 8 documentation is complete; documents required in Phases 9-12 remain future work.

## Session Log (append-only, newest at bottom)
### 2026-10-15 Session 1
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read docs/PROGRESS.md y (empty), read docs/INDEX.md n (missing).
- **Plan:**
  - Complete Phase 0 only: bootstrap the reproducible Python project and its governance surface.
  - Touch root build metadata, `grudge/`, `tests/`, `scripts/`, and the required Phase 0 directory tree.
  - Write tests for CLI help, configuration defaults, error inheritance, importable stubs, and `docs-check`.
  - Write/update `docs/INDEX.md`, `docs/architecture.md`, `docs/roadmap.md`, and the two ADR files.
  - Use the standard-library HTTP server path and document that choice in the ADR and this tracker.
  - Finish with `make test`, `make lint`, `make typecheck`, `make docs-check`, `make all`, and the Phase 0 acceptance commands.
- **Done:** Phase 0 package tree, pinned metadata, local lockfile, CLI scaffold, configuration, error hierarchy, honest stubs, docs system, docs checker, README, LICENSE, and project-local test environment.
- **Tests:** `.venv/Scripts/python -m pytest` → `20 passed`; Ruff check → `All checks passed!`; Ruff format check → `80 files already formatted`; mypy strict → `Success: no issues found in 75 source files`; docs-check → `7 indexed, non-empty, linked documentation files`; import sweep → `56 modules imported`; `python -m grudge --help` → command list printed.
- **Docs updated:** `docs/INDEX.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/adr/0000-template.md`, `docs/adr/0001-cli-first-with-viewer.md`, `docs/assets/pipeline.svg`, `docs/PROGRESS.md`, and README setup/deploy instructions.
- **Handoff note:** Phase 0 is implementation-complete but exit-blocked by missing host tools and runtime mismatch. `make all`, Docker acceptance, exact `pip install -e .`, and the required git commit must be rerun on a clean Linux machine. No Phase 1 work has started.

### 2026-10-15 Session 2
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y, read docs/architecture.md y.
- **Plan:** Verify whether the Phase 0 exit blockers recorded above have cleared; if they have, run the complete Phase 0 exit protocol and commit it; if they have not, record the current blocker and do not begin Phase 1 because PROMPT.md requires the prior phase's exit gate first.
- **Done:** environment verification completed; Phase 0 remains blocked, so Phase 1 was not started.
- **Tests:** `python --version` → `Python 3.14.0`; `make`, `git`, and `docker` were not found. No phase tests were rerun because the required exit protocol cannot pass in this environment.
- **Docs updated:** Progress.md session log only.
- **Handoff note:** The next safe action is to run the Phase 0 exit protocol on a clean Linux environment with Python 3.11.11, make, git, and Docker available. PROMPT.md forbids starting Phase 1 before that gate passes.

### 2026-10-15 Session 3
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y, read docs/architecture.md y.
- **Plan:**
  - Re-check the Phase 0 status and required toolchain before interpreting “next phase.”
  - If Phase 0 has passed, start only Phase 1 and update this session log before coding.
  - If Phase 0 remains blocked, record the evidence and stop without touching Phase 1 files.
  - Preserve the one-phase-at-a-time rule and do not claim an exit gate or commit that cannot be verified.
- **Done:** toolchain verification completed; Phase 0 remains blocked and Phase 1 was not started.
- **Tests:** `python --version` → `Python 3.14.0`; `make`, `git`, and `docker` were not found. No phase tests were run because the Phase 0 exit protocol cannot pass in this environment.
- **Docs updated:** Progress.md session log only.
- **Handoff note:** Run the Phase 0 exit protocol on a clean Linux environment with Python 3.11.11, make, Git, and Docker; then Phase 1 can begin.

### 2026-10-15 Session 4
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y; WSL2 status checked before any repository change.
- **Plan:** Run the Phase 0 toolchain probe inside WSL2 from the repository mount; use the result to decide whether the Phase 0 exit protocol can run, and do not start Phase 1 unless it can.
- **Done:** WSL2 Ubuntu is running as version 2; it has `/usr/bin/make` and `/usr/bin/git`, but lacks `python3.11` and `docker`; WSL reports Python 3.14.4 as its available interpreter. Phase 1 was not started.
- **Tests:** No project tests run because the pinned Python 3.11.11 environment and Docker acceptance remain unavailable.
- **Docs updated:** Progress.md session log and blocker table.
- **Handoff note:** The next safe action is to provide Python 3.11.11 and Docker access inside WSL or use another clean Linux environment, then rerun the Phase 0 exit command.

### 2026-10-15 Session 5
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y; owner supplied WSL setup output.
- **Plan:**
  - Make only the requested portability change in `Makefile` and the matching setup wording in `README.md`.
  - Record the owner’s WSL/Python 3.11 decision in this tracker.
  - Re-run only Phase 0 checks inside WSL: CLI help, test, lint, typecheck, docs-check, and `make all`.
  - Do not implement or repair the Phase 1 schema export despite the separately attempted Phase 1 import command.
- **Done:** Makefile portability edit and README wording update completed; Phase 0 checks ran successfully inside the owner’s WSL Python 3.11.17 environment; Phase 1 remains unopened.
- **Tests:** `python -m grudge --help` printed the CLI; `make test` → `20 passed`; `make lint` → `All checks passed!`; `make typecheck` → `Success: no issues found in 75 source files`; `make docs-check` → `docs-check: 7 indexed, non-empty, linked documentation files`; `make all` → all four checks passed; import sweep → `56 modules imported`; `uv pip install -e .` succeeded. The separately attempted `from grudge.schema import Trace, Cassette, Scar` remains intentionally unavailable because it is a Phase 1 acceptance check.
- **Docs updated:** Progress.md decision/session log and README portability instructions.
- **Handoff note:** WSL then failed to start with `Wsl/Service/CreateInstance/E_FAIL`, so this session did not run the exact pip retry or commit. Restart WSL, rerun the Phase 0 exit/commit steps, and do not begin Phase 1.

### 2026-10-16 Session 6
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y, read Phase 1 requirements in PROMPT.md.
- **Plan:**
  - Record the owner’s Phase 0 pass, commit `aa965bc`, Python range, optional Docker, WSL execution, Phase 1 import interpretation, and canonical progress-file decisions.
  - Update the Phase 0 tracker state and make the progress pointer one line.
  - Implement only Phase 1 schemas in `grudge/schema/` with tests for round trips, invalid payloads, Hypothesis JSONL properties, and descriptions.
  - Write and index `docs/trace-format.md`, `docs/cassette-format.md`, and `docs/glossary.md`, then update architecture links/status.
  - Run the Phase 1 acceptance import and the full Phase Exit Protocol; do not begin Phase 2.
- **Done:** Phase 0 decisions recorded; Phase 1 work in progress.
- **Tests:** Phase 1 checks not yet run.
- **Docs updated:** Progress.md, docs/PROGRESS.md, docs/INDEX.md, and Phase 1 docs pending.
- **Handoff note:** At phase end, provide exact owner-run git commands for `phase-1: complete schemas`; if git is unavailable to this session, do not treat that as a phase blocker.

### 2026-10-16 Session 7
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y; Phase 1 requirements re-read before implementation.
- **Plan:** Implement only Phase 1 schemas, tests, and required docs; expose schema imports; run the acceptance import and full Phase Exit Protocol; do not begin Phase 2.
- **Done:** Implemented Trace/Step discriminated models and JSONL, Cassette/ArgMatcher contracts and hashes, predicate AST/combinators, Scar/AdmissionRecord persistence, package exports, Hypothesis round-trip coverage, and Phase 1 documentation. Fixed JSONL parsing to preserve Unicode line-separator characters and made docs progress a one-line canonical pointer.
- **Tests:** `python -m pytest` → `30 passed`; `python -m ruff check grudge tests scripts` → `All checks passed!`; `python -m ruff format --check grudge tests scripts` → `85 files already formatted`; `python -m mypy grudge scripts` → `Success: no issues found in 75 source files`; `python -m scripts.docs_check` → `docs-check: 10 indexed, non-empty, linked documentation files`; `make all` → all four checks passed; acceptance import → `schema imports ok`; `git diff --check` passed.
- **Docs updated:** `docs/trace-format.md`, `docs/cassette-format.md`, `docs/glossary.md`, `docs/INDEX.md`, `docs/architecture.md`, and one-line `docs/PROGRESS.md`.
- **Handoff note:** Phase 1 exit gate is complete. Owner should run the exact git commands in the final report to create `phase-1: complete schemas`. Phase 2 has not started.

### 2026-10-17 Session 8
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y, read Phase 2 requirements; verified Phase 1 commit `ebde38e` exists.
- **Plan:** Implement only Phase 2 fake world, scripted policy, vulnerable/fixed agents, tests, and required docs; run the Phase 2 acceptance commands and full exit protocol; do not start Phase 3.
- **Done:** Added the immutable JSON-backed fake world with 20 ordered emails and one poisoned message; deterministic `ScriptedLLM` with configurable injection patterns and defended mode; vulnerable and fixed agents using Phase 1 traces; causality/determinism tests; `scripted-llm.md`; and architecture/index updates.
- **Tests:** `python -m pytest` → `39 passed`; `python -m ruff check grudge tests scripts` → `All checks passed!`; `python -m ruff format --check grudge tests scripts` → `87 files already formatted`; `python -m mypy grudge scripts` → `Success: no issues found in 75 source files`; `python -m scripts.docs_check` → `docs-check: 11 indexed, non-empty, linked documentation files`; `make all` → all four checks passed; vulnerable example → `71` steps and `1` `send_http` call; fixed example → `65` steps and `0` `send_http` calls; `git diff --check` passed.
- **Docs updated:** `docs/scripted-llm.md`, `docs/INDEX.md`, `docs/architecture.md`, and `examples/leaky_agent/README.md`.
- **Handoff note:** Phase 2 exit gate is complete. Owner should run the exact git commands in the final report to create `phase-2: complete leaky agent & scripted llm`. Phase 3 has not started.

### 2026-10-17 Session 9
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y, read Phase 3 requirements; Phase 2 is marked complete and its implementation is present.
- **Plan:**
  - Implement only Phase 3 recorder, redaction, raw adapter, tests, and required documentation.
  - Touch `grudge/recorder/`, recorder tests, `docs/trace-format.md`, `docs/architecture.md`, `docs/INDEX.md`, and this tracker.
  - Ensure recorder output validates with Phase 1 `Trace`, preserves event order, records exceptions as failed outcomes, and can redact the fake key.
  - Keep MCP proxy and LangGraph adapters as honest stubs; do not begin Phase 4 replay work.
  - Run the Phase 3 acceptance and complete exit protocol, then provide owner-run commit commands.
- **Done:** Phase 3 plan recorded; implementation pending.
- **Tests:** not yet run in this session.
- **Docs updated:** Progress.md session log only so far.
- **Handoff note:** Phase 3 must stop after its exit protocol; Phase 4 remains unopened.

### 2026-10-17 Session 10
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y, read Phase 3 requirements; Phase 2 remains complete.
- **Plan:** Implement only Phase 3 recorder, redaction, raw adapter, tests, and trace/architecture documentation; keep MCP/LangGraph stubs; run the full exit protocol and stop before Phase 4.
- **Done:** Added exported `Recorder`, `JsonlWriter`, `@record`, raw SDK event adapter, recursive configurable redaction with disabled mode, and honest MCP/LangGraph stubs. Recorder tests cover JSONL validity/order, failure persistence, adapter translation, decorator behavior, package exports, and fake-key redaction.
- **Tests:** `python -m pytest` → `47 passed`; `python -m ruff check grudge tests scripts` → `All checks passed!`; `python -m ruff format --check grudge tests scripts` → `89 files already formatted`; `python -m mypy grudge scripts` → `Success: no issues found in 75 source files`; `python -m scripts.docs_check` → `docs-check: 11 indexed, non-empty, linked documentation files`; `make all` → all four checks passed; recorder acceptance → `71 steps, valid Trace JSONL`; `git diff --check` passed.
- **Docs updated:** `docs/trace-format.md` recording semantics, `docs/architecture.md`, `docs/INDEX.md`, and recorder package docstring.
- **Handoff note:** Phase 3 exit gate is complete. Owner should run the exact git commands in the final report to create `phase-3: complete recorder`. Phase 4 has not started.

### 2026-10-17 Session 11
- **Pre-flight:** read `AGENTS.md`, `PROMPT.md`, `Progress.md`, `docs/INDEX.md`, `docs/cassette-format.md`, `docs/trace-format.md`, and `docs/architecture.md`; verified Phase 3 is complete and Phase 4 is next; preserved unrelated untracked files.
- **Plan:**
  - Implement only Phase 4 cassette playback, hermetic sandbox execution, full-trace cassette conversion, focused tests, and required documentation.
  - Match cassette entries in exact, then subset, then wildcard order; support strict and lenient misses with consumption tracking.
  - Run the existing leaky agent against cassette-backed tools without loading the example world or permitting real file/network access; enforce step/time limits and return failed traces.
  - Prove failure reproduction, missing-poison safety, strict mismatch behavior, determinism, and filesystem/network guards.
  - Run the Phase 4 acceptance and full exit protocol; do not begin Phase 5.
- **Done:** Added `CassettePlayer` with exact/subset/any precedence, single-use entries, strict `ReplayMismatch`, lenient neutral results, and miss tracking; added `CassetteWorld`, `CassetteToolAdapter`, `world_from_trace`, hermetic filesystem/network guards, timeout and step-limit failure traces, and replay API exports; added focused cassette and sandbox tests.
- **Tests:** `python -m pytest` → `61 passed`; focused replay tests → `14 passed`; `python -m ruff check grudge tests scripts` → `All checks passed!`; `python -m ruff format --check grudge tests scripts` → all files formatted; `python -m mypy grudge scripts` → `Success: no issues found in 75 source files`; `python -m scripts.docs_check` → `docs-check: 12 indexed, non-empty, linked documentation files`; `make all` → all four checks passed; `git diff --check` passed.
- **Docs updated:** `docs/why-not-replay.md`, `docs/cassette-format.md`, `docs/architecture.md`, `docs/INDEX.md`, and this tracker.
- **Handoff note:** Phase 4 exit gate is complete. Owner should run the exact git commands in the final report to create `phase-4: complete replay engine`. Phase 5 has not started.

### 2026-10-17 Session 12
- **Pre-flight:** read `AGENTS.md`, `PROMPT.md`, `Progress.md`, `docs/INDEX.md`, `docs/cassette-format.md`, `docs/architecture.md`, and the Phase 5 requirements; verified Phase 4 commit `a88b0c3` exists; preserved unrelated untracked files.
- **Plan:**
  - Implement only Phase 5 oracle, pure ddmin, content reducers, cassette-builder orchestration, focused tests, and required documentation.
  - Keep oracle evaluation deterministic, memoized by cassette hash, bounded by `max_oracle_calls`, and repeat-safe for configured flakiness checks.
  - Implement classic entry-level ddmin with ordered progress history and prove 1-minimality, soundness, interaction cases, and determinism.
  - Apply content reducers after entry reduction and preserve cassette validity and reproducibility.
  - Run the real leaky-agent shrink acceptance: at most three entries, under 1 KB, reproducing the failure; then run the full Phase Exit Protocol and stop before Phase 6.
- **Done:** Added memoized `PredicateOracle` with repeats and call budgets; pure Zeller ddmin with ordered progress events and deterministic stats; `TrimDocument`, `BlankField`, and `NormalizeIds`; two-level cassette builder and public shrinker exports; synthetic, property-based, reducer, oracle, builder, and real-agent tests.
- **Tests:** `python -m pytest` → `82 passed`; focused Phase 5 tests → `21 passed`; `python -m ruff check grudge tests scripts` → `All checks passed!`; `python -m ruff format --check grudge tests scripts` → `9 files already formatted`; `python -m mypy grudge scripts` → `Success: no issues found in 75 source files`; `python -m scripts.docs_check` → `docs-check: 14 indexed, non-empty, linked documentation files`; `make all` → all four checks passed; real shrink acceptance → `21` original entries to `3` minimal entries, `375` bytes, `196` ordered history events; `git diff --check` passed.
- **Docs updated:** `docs/shrinking.md`, `docs/adr/0002-ddmin-over-entries-then-content.md`, `docs/architecture.md`, `docs/INDEX.md`, and this tracker.
- **Handoff note:** Phase 5 exit gate is complete. Owner should run the exact git commands in the final report to create `phase-5: complete shrinker`. Phase 6 has not started.

### 2026-10-17 Session 13
- **Pre-flight:** read `AGENTS.md`, `PROMPT.md`, `Progress.md`, `docs/INDEX.md`, Phase 6 requirements, and the existing predicate/LLM stubs; verified Phase 5 commit `bc3bd43` exists; preserved unrelated untracked files.
- **Plan:**
  - Implement only the Phase 6 predicate DSL, deterministic compiler/checkers, demo fallback rule, provider-neutral offline LLM boundary, disk cache, synthesizer, focused tests, and required documentation.
  - Parse the four readable predicate forms with precise `PredicateParseError` line/column diagnostics and canonical pretty-print round trips.
  - Compile call-shape, ordering, and taint-flow predicates into evidence-bearing checkers; keep outcome explicitly as the documented stretch stub.
  - Ensure the demo predicate flags the vulnerable trace and passes the fixed trace, with plain-English explanations.
  - Keep synthesis deterministic and offline-safe: validate generated DSL, retry malformed drafts up to two times, then use the hand-verified fallback; cache by prompt hash.
  - Run the Phase 6 Exit Protocol, commit `phase-6: complete predicates`, and stop before Phase 7.
- **Done:** Implemented typed readable DSL and canonical printer, located parse errors, deterministic evidence-bearing call-shape/ordering/MVP-lite taint checkers, persistent filtered taint rules, demo fallback, packaged synthesis prompt, optional OpenAI-compatible client, disk cache, and validated synthesis with at most two retries. Outcome checking remains the required Phase 13 stub.
- **Tests:** In WSL with activated `.venv`, `make all` → `178 passed`, Ruff clean, mypy `Success: no issues found in 75 source files`, docs-check `16 indexed, non-empty, linked documentation files`; `python -m ruff format --check grudge tests scripts` → `98 files already formatted`; `python -m pytest tests/test_predicates_dsl.py tests/test_predicate_compiler.py tests/test_predicate_synthesizer.py` → `96 passed`. An initial `make all` timed out during mypy and one later run hit the existing intermittent Phase 5 assertion; subsequent complete checks passed as recorded above.
- **Acceptance:** `python -m pytest tests/test_predicate_compiler.py::test_generalized_rule_is_red_on_vulnerable_and_green_on_fixed_leaky_agent -v` verifies the actual example traces and exact evidence. Direct `python -c` smoke check of the same parsed rule produced `phase6 acceptance: vulnerable=True, fixed=False, evidence=[43, 44, 46]`. The rule describes the prohibited read-file-to-send-body flow in plain English. Schema and Scar persistence, invalid-draft retries, and offline cache/fallback paths are covered by the focused suite.
- **Docs updated:** `docs/predicate-dsl.md`, `docs/adr/0003-llm-drafts-deterministic-code-decides.md`, `docs/architecture.md`, `docs/INDEX.md`, `.env.example`, and this tracker. `pyproject.toml` includes the prompt as package data.
- **Handoff note:** Commit this verified phase as `phase-6: complete predicates` and report the actual commit hash. Phase 7 has not started. Live external-provider and Docker builds were not exercised; provider behavior was tested with fakes and offline network guards. Preserve unrelated untracked files.

### 2026-10-17 Session 8
- **Pre-flight:** read AGENTS.md y, read PROMPT.md y, read Progress.md y, read docs/INDEX.md y; Phase 2 requirements re-read; `docs/scripted-llm.md` is absent and will be created as required by this phase.
- **Plan:**
  - Confirm the owner’s Phase 1 commit state without changing history; proceed because Progress.md marks Phase 1’s exit gate passed and the user authorized the next phase.
  - Touch only Phase 2 example/world files, `grudge/replay/scripted_llm.py`, agent tests, `docs/scripted-llm.md`, `docs/INDEX.md`, architecture, and this tracker.
  - Implement a deterministic policy that reacts to tool-result content rather than replaying a fixed transcript.
  - Write tests for vulnerable leakage, fixed-agent safety, poisoned-email causality, and byte-identical traces with at least 35 steps.
  - Run the Phase 2 acceptance commands and full exit protocol; do not start Phase 3.
- **Done:** Phase 2 plan recorded; implementation pending.
- **Tests:** not yet run in this session.
- **Docs updated:** Progress.md session log only so far.
- **Handoff note:** Phase 2 must stop after its exit protocol and provide owner-run git commands for `phase-2: complete leaky agent & scripted llm`.

### 2026-10-18 Session 14
- **Pre-flight:** Read `AGENTS.md`, full `Progress.md`, Phase 7 requirements and Phase Exit Protocol in `PROMPT.md`, `docs/INDEX.md`, architecture, predicate compiler, replay, and Scar contracts. Verified Phase 6 commit `aa4d046`; unrelated untracked files are preserved.
- **Plan:**
  - Implement only Phase 7 court/verdict APIs, controls, sample Scar generation/persistence, tests, and documentation.
  - Replay both agents on independent copies of the same cassette and require repeated witnessed bad violations and clean successful good runs.
  - Reject vacuous, over-broad, both-agent-failing, invalid, and failed-replay candidates with actionable reasons; check empty trace and supplied benign controls.
  - Save only admitted Scars with embedded admission records; verify disk round trips and the demo predicate-tampering rejection.
  - Update architecture admission rules and write/index ADR 0004; run acceptance and `make all`, then commit `phase-7: complete admission court` and stop before Phase 8.
- **Done:** Implemented `admit` and Pydantic `AdmissionVerdict`, strict trace/evidence validation, repeated isolated proof, empty and control checks, safe exclusive proof persistence, two real-loop benign controls, sample generation and the admitted demo artifact. Added 56 focused tests. Fixed three existing example typing issues exposed by the new script and added container fixture copies. No dependency or runtime changes.
- **Tests:** WSL Ubuntu-D, activated `.venv` Python 3.11.17: `make all` → `234 passed`, Ruff clean, mypy `Success: no issues found in 76 source files`, docs-check `17 indexed, non-empty, linked documentation files`; `python -m ruff format --check grudge tests scripts` → `101 files already formatted`; `python -m pytest tests/test_admission_court.py tests/test_sample_scar.py` → `56 passed`; `git diff --check` passed. First combined check exposed the example typing errors; final combined check passed after narrow fixes.
- **Acceptance:** `python -m scripts.build_sample_scar --runs 3` → `admitted: true`, all 3 bad runs violated with evidence, all 3 fixed runs and 2 controls successful/clean, empty sanity passed. Artifact: four cassette entries, successful fake sink response, embedded proof. `python -m pytest tests/test_sample_scar.py::test_checked_in_sample_re_admits_with_repeated_real_runs tests/test_sample_scar.py::test_overbroad_never_read_file_rejects_without_artifact -v` → `2 passed`; tampered predicate rejected on benign controls and wrote no artifact.
- **Docs updated:** `docs/architecture.md` admission rules, `docs/adr/0004-prove-tests-before-admitting.md`, `docs/INDEX.md`, README offline proof/regeneration steps, and this tracker.
- **Final rerun limitation:** After the successful combined code checks and regenerated-sample acceptance tests, a final redundant `make all` rerun was terminated by the host; retry failed before Python started with `Wsl/Service/E_UNEXPECTED`. No code changed after the successful checks. WSL was not restarted; the latest successful suite remains `234 passed` above.
- **Handoff note:** Include this verified phase in `phase-7: complete admission court` and report its actual commit hash. Phase 8 has not started. Docker build was not executed; offline replay and persistence were verified in WSL. The previously recorded intermittent Phase 5 issue was not changed or observed in the successful suite. Before Phase 8, restore WSL and rerun `source .venv/bin/activate && make all`. Unrelated `GrudgeBrief.pdf` and `PROMPT-2-PARALLEL.md` remain untouched.

### 2026-10-18 Session 15
- **Pre-flight:** Read `AGENTS.md`, full `Progress.md`, Phase 8 requirements and Exit Protocol in `PROMPT.md`, `docs/INDEX.md`, architecture, config, Scar, admission, replay, and predicate contracts. Verified Phase 7 commit `17932d6`; unrelated untracked files remain untouched.
- **Plan:**
  - Implement only Wilson lower-bound math, admitted-Scar gate execution, report renderers, focused tests, and Phase 8 documentation.
  - Require admitted Scars, run the selected agent repeatedly against isolated cassette copies, evaluate deterministic predicate results, and count gate passes as nonviolations.
  - Support offline repeated runs with an explicit deterministic/offline note; reject invalid inputs and fail closed on replay/checker failures.
  - Provide machine-readable result objects plus Rich terminal and PR-style Markdown reports; keep selector as the Phase 13-style stub.
  - Verify fixed agent exits 0 and vulnerable agent exits 1 through a reusable gate command path, run `make all`, commit `phase-8: complete gate and statistics`, and stop before Phase 9.
- **Done:** Implemented Wilson lower-bound statistics, admitted-Scar gate execution with isolated deterministic replays, typed run/gate results, CI exit status mapping, Rich terminal and PR Markdown reports, and Phase 8 tests. Selector remains an honest stub and Phase 9 CLI was not touched.
- **Tests:** WSL Ubuntu-D `.venv`: focused gate tests → `32 passed`; full `python -m pytest` → `266 passed`; Ruff check → `All checks passed!`; Ruff format → `104 files already formatted`; mypy → `Success: no issues found in 76 source files`; docs-check → `18 indexed, non-empty, linked documentation files`; `git diff --check` passed.
- **Acceptance:** gate smoke command → `fixed_exit=0 vulnerable_exit=1 fixed_passes=20/20 lower=0.8389`; Markdown header → `## Grudge gate: **PASS**`. Offline mode is reported explicitly and the vulnerable agent is blocked by predicate violations.
- **Docs updated:** `docs/statistics.md`, `docs/architecture.md`, `docs/INDEX.md`, and this tracker.
- **Handoff note:** Commit this verified phase as `phase-8: complete gate and statistics` and report the actual hash. Phase 9 has not started. The two unrelated untracked files remain untouched.

### 2026-10-18 Session 16
- **Pre-flight:** Read `AGENTS.md`, Phase 9 requirements and Exit Protocol in `PROMPT.md`, `Progress.md`, `docs/INDEX.md`, the CLI stubs, and the capture/shrink/admission/gate APIs. Verified commit `7366746`; unrelated untracked files remain untouched.
- **Plan:**
  - Implement the scriptable Typer commands with `--json`, `--debug`, friendly `GrudgeError` handling, and the required exit-code contract.
  - Add CliRunner coverage for every Phase 9 command, machine-readable output, missing-file errors, and the fixed/vulnerable gate outcomes.
  - Repair only the shrinker boundary needed for the required pipeline so empty source values cannot falsely reproduce taint failures.
  - Update the CLI reference and demo guide, then run the manual capture → shrink → admit → run pipeline.
  - Run `make test`, `make lint`, `make typecheck`, `make docs-check`, `make all`, formatting, and diff checks; commit Phase 9 and stop before Phase 10.
- **Done:** Implemented the Phase 9 CLI, shared JSON/debug/error handling, real Scar browsing commands, offline demo, and CLI tests. Added a CLI shrink boundary that requires complete replay and the seed checker to reproduce, preventing cassettes that pass the shrink oracle but fail admission. Updated README, architecture, docs index, and demo guide.
- **Tests:** Focused CLI/shrinker/cassette tests → `20 passed`; WSL `make VENV=.venv-wsl all` → `275 passed`, Ruff clean, `Success: no issues found in 77 source files`, and docs-check `19 indexed, non-empty, linked documentation files`; WSL Ruff format → `105 files already formatted`; WSL `git diff --check` passed. The Windows rerun had one environment-only symlink privilege failure (`WinError 1314`); the clean WSL run passed it.
- **Acceptance:** Manual shell pipeline completed: capture wrote a 71-step trace; shrink wrote a 23-entry cassette; admit proved 3 bad red / 3 good green / 2 controls and persisted a Scar; fixed-agent run returned exit `0` with `20/20`; vulnerable-agent run returned exit `1` with `0/20`. Offline demo returned fixed pass and vulnerable blocked in JSON mode.
- **Handoff note:** Phase 9 implementation, acceptance, clean WSL exit checks, and commit `1b50a10` are complete. Do not start Phase 10 without owner approval. Preserve unrelated `GrudgeBrief.pdf` and `PROMPT-2-PARALLEL.md`.

### 2026-10-18 Session 17
- **Pre-flight:** Read `AGENTS.md`, Phase 10 requirements and Exit Protocol in `PROMPT.md`, `Progress.md`, `docs/INDEX.md`, the Phase 9 CLI, viewer stubs, and demo boundaries. Verified commit `bad9769`; unrelated untracked files remain untouched.
- **Plan:**
  - Implement typed Pydantic events and a synchronous replayable in-process bus for the complete five-beat story.
  - Orchestrate the real capture/replay/shrink/synthesis/admission/gate engines offline, including the fixed-to-vulnerable regression beat and fast test mode.
  - Implement a dependency-free local HTTP server with static viewer files, SSE `/events`, JSON `/state`, and `POST /restart`; add focused flow and server tests with network guards.
  - Integrate the CLI demo, document the event protocol and fallback procedure, and update architecture/index documentation.
  - Run the Phase 10 Exit Protocol, commit this phase, and stop before Phase 11.
- **Done:** Implemented typed event models and replayable bus, real five-beat orchestrator, SSE/static demo server, `--fast` CLI flow, server/ordering/network tests, event documentation, and architecture updates. Default presenter pacing is `0.4s` per event; fast mode uses one deterministic gate repetition to keep the test/demo path under ten seconds while preserving real engine execution.
- **Tests:** Focused Phase 10/CLI tests → `16 passed`; clean WSL `make VENV=.venv-wsl all` → `281 passed`, Ruff clean, `Success: no issues found in 77 source files`, docs-check `20 indexed, non-empty, linked documentation files`; Ruff format → `106 files already formatted`; `git diff --check` passed. The unlazy G1-G5 ledger gates all passed, including the full Linux check bundle.
- **Acceptance:** `grudge demo --no-browser --fast` emits all required event types and exits successfully; event order is demo start → beats 1-5 → finished; beat 4 emits vulnerable blocked and fixed passing gate results; beat 5 emits a blocked vulnerable gate and PR regression comment. The server replays completed events over SSE, returns state, restarts runs, and serves `viewer/` assets without network use by the orchestrator.
- **Handoff note:** Phase 10 implementation, acceptance, Exit Protocol, and commit are pending only the owner commit action. Do not start Phase 11 until the phase commit is recorded. Preserve unrelated `GrudgeBrief.pdf` and `PROMPT-2-PARALLEL.md`.
