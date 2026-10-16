# Progress.md: Grudge build tracker

_Last updated: 2026-10-15 by omnirush.ai_

## Snapshot
- **Current phase:** 0: Bootstrap & Governance
- **Overall:** 0/14 phases complete
- **Test suite:** 20 passing in the project-local environment
- **Demo status:** works offline? n/a (demo is a Phase 10 deliverable)
- **Next action:** Re-run the exit protocol and commit Phase 0 on a machine with Python 3.11, make, git, and Docker available.

## Phase Board
| # | Phase | Status | Exit gate passed | Docs done |
|---|-------|--------|------------------|-----------|
| 0 | Bootstrap & Governance | [!] | no | [x] |
| 1 | Schemas | [ ] | no | no |
| 2 | Leaky Agent & Scripted LLM | [ ] | no | no |
| 3 | Recorder | [ ] | no | no |
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
- [!] Run the Phase Exit Protocol and commit `phase-0: complete bootstrap & governance`.

### Phase 1
- [ ] Schemas and schema tests.

### Phase 2
- [ ] Leaky agent, scripted LLM, example world, and tests.

### Phase 3
- [ ] Recorder, redaction, adapters, and tests.

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

## Blockers
| Date | Blocker | Tried | Needs |
|------|---------|-------|-------|
| 2026-10-15 | The repository has no existing lockfile or project metadata. | Confirmed the workspace contains only owner/spec files and an empty docs progress file. | Phase 0 must create the pinned metadata and lockfile without installing globally. |
| 2026-10-15 | Host cannot run the complete exit protocol: Python is 3.14.0 (not pinned 3.11.11), and `make`, `git`, and Docker are unavailable. | Project-local checks were run with a Python 3.14 venv; the exact missing tools were probed and not found. | Run the documented commands on a clean Linux environment with the declared toolchain, then commit. |
| 2026-10-15 | Exact dependency install from `requirements.lock` cannot build `pydantic-core` on host Python 3.14 without Rust/Cargo. | A project-local install was attempted; the lock remains correct for the declared Python 3.11.11 runtime. | Use Python 3.11.11 or the Docker build environment. |
| 2026-10-15 | Session 2 re-confirmed the Phase 0 exit blocker: host reports Python 3.14.0 and cannot resolve `make`, `git`, or `docker`. | Ran `python --version; make --version; git --version; docker --version` from the repository. | Provide a clean Linux environment with Python 3.11.11, make, Git, and Docker, or explicitly authorize a process exception. |
| 2026-10-15 | WSL2 is available, but its Ubuntu distribution has Python 3.14.4, no Python 3.11, and no Docker CLI; only make and Git are available. | Ran the toolchain probe from `/mnt/c/Users/kotes/Desktop/Grudge` inside the running Ubuntu WSL2 distribution. | Install/use project-approved Python 3.11.11 and provide Docker access in WSL, without starting Phase 1 before Phase 0 passes. |
| 2026-10-15 | Owner decision: all work runs in WSL Ubuntu with Python 3.11 and an activated `.venv`; Makefile commands must use the active environment or detect both POSIX and Windows venv layouts. | The owner supplied a successful WSL Python 3.11.17 setup and requested portability without starting Phase 1. | Makefile, README setup instructions, and Phase 0 verification. |
| 2026-10-15 | The WSL service stopped starting after the Phase 0 checks completed, so the exact `python -m pip install -e .` retry and commit could not be performed by this session. | `wsl --status` returned Ubuntu as the default WSL2 distribution, but `wsl -e bash` then returned `Wsl/Service/CreateInstance/E_FAIL`. | Restart WSL, rerun the exact install/commit steps, and keep Phase 1 unopened. |

## Known Issues & Tech Debt
- Phase 0 intentionally leaves all stretch modules as documented `NotImplementedError` stubs.

## Doc Debt
- Required phase-specific docs for later phases are indexed as planned stubs; they will be written in their owning phases.

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
