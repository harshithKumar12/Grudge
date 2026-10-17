# Progress.md: Grudge build tracker

_Last updated: 2026-10-17 by omnirush.ai_

## Snapshot
- **Current phase:** 3: Recorder complete; awaiting owner commit
- **Overall:** 4/14 phases complete
- **Test suite:** 47 passing in WSL Python 3.11.17
- **Demo status:** works offline? n/a (demo is a Phase 10 deliverable)
- **Next action:** Owner runs the Phase 3 commit commands, then the next session re-runs pre-flight before Phase 4.

## Phase Board
| # | Phase | Status | Exit gate passed | Docs done |
|---|-------|--------|------------------|-----------|
| 0 | Bootstrap & Governance | [x] | yes | [x] |
| 1 | Schemas | [x] | yes | [x] |
| 2 | Leaky Agent & Scripted LLM | [x] | yes | [x] |
| 3 | Recorder | [x] | yes | [x] |
| 4 | Replay Engine | [ ] | no | no |
| 5 | Shrinker | [ ] | no | no |
| 6 | Predicates | [ ] | no | no |
| 7 | Admission Court | [ ] | no | no |
| 8 | Gate & Statistics | [ ] | no | no |
| 9 | CLI | [ ] | no | no |
| 10 | Demo Orchestrator & Event Stream | [ ] | no | no |
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
- [ ] Replay engine, sandbox, and tests.

### Phase 5
- [ ] Shrinker, reducers, cassette builder, and tests.

### Phase 6
- [ ] Predicate DSL, compiler, synthesizer, and tests.

### Phase 7
- [ ] Admission court, verdicts, sample scar, and tests.

### Phase 8
- [ ] Gate runner, Wilson statistics, reports, and tests.

### Phase 9
- [ ] Scriptable CLI commands and tests.

### Phase 10
- [ ] Demo orchestrator, event stream, server, and tests.

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

## Doc Debt
- Required docs for Phases 2-12 remain indexed as planned work; no Phase 1 doc debt remains.

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
