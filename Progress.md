# Grudge baseline report

**Audit date:** 2026-10-23
**Branch:** `master`
**HEAD:** `b21be5a fix: harden pre-production installer and hooks`

## Repository state

- `AGENTS.md` was read and will not be edited.
- `PROMPT.md`, `PROMPT-2.md`, and `PROMPT-2-PARALLEL.md` are absent; Git history records their prior deletion.
- `Progress.md` was absent and is recreated as this canonical current baseline.
- `README.md`, `docs/INDEX.md`, `docs/FINAL-REPORT.md`, `TEST.md`, and relevant architecture/hook/integration docs were read.
- The worktree has two pre-existing, uncommitted newline-only changes in `AGENTS.md` and `CLAUDE.md`; they are unrelated and excluded from remediation changes.
- No publish, upload, login, push, or distribution command is authorized for this audit.

## Current implementation

- Python engine: trace capture, redaction, cassette replay, shrinking, DSL predicates, admission proof, Wilson gate, CLI, offline demo, viewer boundary, and Scar persistence.
- Node Guard: setup, doctor, uninstall, hooks, proposals, acceptance, stats, reports, statusline, self-contained runtime bundling, backups, rollback, and scope selection.
- Recent pre-production fixes already in `b21be5a`: managed-block uninstall safety, Claude `CLAUDE.md` visibility, duplicate hook diagnostics/deduplication, and version metadata `0.1.5`.
- Deferred roadmap items remain explicit: registry, fault locator, fuzzer, changed-Scar selector, GitHub/pytest integrations, outcome predicates, MCP/LangGraph adapters, and full viewer Scar browser.

## Actual package status

- Local npm metadata: `grudge-cli@0.1.7`.
- Local PyPI metadata: `grudge-cli==0.1.7`.
- Registry publication of `0.1.7` is intentionally not performed in this task.
- Release documentation states that `0.1.7` is being prepared and the local release check accepts prepared or published status.

## Baseline acceptance gaps to verify

1. Real packed npm tarball installation must be exercised in a clean scratch project.
2. Claude Code must be tested end to end for instruction loading, hook registration, blocking, safe allow, status-line coexistence, and duplicate scopes.
3. Existing third-party status lines and hooks must be proven unchanged by setup, repair, and uninstall.
4. Doctor must cover broken paths, missing instructions, duplicate scopes, status-line conflicts, malformed state, and actionable repair guidance.
5. Python/Node quality gates and package checks must be rerun from the current checkout.
6. Windows is the available host; Linux/WSL and macOS remain unverified until executed.

## Remediation completed in this pass

- Fixed selective uninstall cleanup so an existing `CLAUDE.md` or `AGENTS.md` is restored byte-for-byte, including its original trailing-newline shape.
- Added npm repository/homepage/issue metadata and Python classifiers, keywords, and project URLs.
- Added `scripts/release_check.py`, its test, and `make release-check`; `make all` now includes the local release check.
- Updated release, integration, token-budget, walkthrough, and package documentation for the current `0.1.5` state.
- Added a shared Node CLI renderer, structured default output, stable pretty JSON mode, error fixes, not-installed doctor output, and CLI output documentation.
- Changed unmarked setup to default to repository scope and preselect Claude Code with Guard/Advisory tier labels.

## Evidence from current checkout

- Node suite passes **60/60** tests after the uninstall fix.
- `python -m pytest -q` passes the Python suite with **one skip**. The bare `pytest -q` console entry point is not usable in this shell because it omits the repository import path; this is an invocation-environment issue, not a test failure.
- `ruff check scripts tests` passes.
- `mypy grudge scripts` passes with no issues across 82 source files.
- `python -m scripts.docs_check` passes: 30 indexed, non-empty, linked documentation files.
- `python -m scripts.release_check` passes: local npm/PyPI metadata and published-version documentation agree.
- `npm pack --dry-run --json` reports a self-contained `grudge-cli-0.1.5.tgz` with the bundled runtime.
- A fresh Python sdist and wheel build for `0.1.5` succeeds, and `twine check` passes for both artifacts.
- `git diff --check` reports no whitespace errors.
- Broad Ruff and mypy checks have known pre-existing failures under `examples/leaky_agent` and duplicate test-module discovery.
- Current registry status was queried directly on 2026-10-23; no registry mutation was performed in this audit.

## Remaining release evidence

- Full Claude Code UI/model verification remains unavailable because the earlier API attempt ended with `ECONNREFUSED`.
- Linux/WSL and macOS compatibility remain unverified.
- A clean scratch-project run using the freshly packed npm tarball and the complete Claude hook/status-line flow still needs to be recorded.
- `AGENTS.md` and `CLAUDE.md` retain unrelated newline-only worktree changes and
  are excluded from the 0.1.7 commit.

## 0.1.7 output work

- Added the shared Node renderer in `packages/grudge/src/output.js`.
- Default Node CLI output is structured text; `--json` is pretty-printed and
  preserves the result object; hook stdout remains machine JSON.
- Added not-installed doctor output, strict-mode handling, error/fix messages,
  ASCII marks, TTY-aware color behavior, setup scope correction, and Guard /
  Advisory picker labels.
- Added `docs/cli-output.md` and renderer regression tests.
- Current Node verification: **65/65 tests passed** and `npm pack --dry-run`
  reports `grudge-cli@0.1.7`.
- Python test, Ruff, mypy, build, and Twine commands were not runnable in the
  current Linux shell because the required Python tooling is unavailable;
  documentation and release checks did run successfully.
