# Grudge progress tracker

**Purpose:** Canonical, current state of the repository, the phase board, and
the known issues that still block a universal production claim.
**Audience:** Project owner, reviewers, and release operator.
**Status:** current as of the production-readiness remediation, after the 0.1.9 release.
**Last updated:** 2026-10-30

## Current snapshot

- **Branch:** `master`. **Head at the start of this pass:** `0d6227d docs: point
  the npm readme at the per-agent setup options`.
- **Published:** `grudge-cli@0.1.9` on npm and PyPI (`npm view grudge-cli
  version` and `pip index versions grudge-cli` both report 0.1.9). The npm
  package `grudge` is a different project (`eddieparc/grudge`), so every
  documented `npx` invocation names `grudge-cli` explicitly.
- **Phase 25 (unreleased on `master`):** `grudge verify` proves blocking end to
  end; a deny exits `2`; `propose` reports pending truthfully and gains
  `--accept`; unknown flags error; the tool map covers `PowerShell`,
  `NotebookRead`, and `NotebookEdit`; `doctor` points at `verify`; the managed
  block forbids claiming a pending rule is active.
- **Fixes landed earlier in 0.1.9:** a preserved `statusLine` that points at a
  missing script is named by `setup`/`doctor` (never rewritten), and `grudge
  doctor` finds a user-scope install from inside a project; README gained
  per-agent setup sections.
- **Fixes in 0.1.8:** `scars show`, Node `--help` and short flags, wheel data,
  `admit` controls default, filtered taint seeds, ASCII gate output, engine
  `--version`. See `CHANGELOG.md`.
- **Verified in this checkout (Phase 25):**
  - `grudge verify` on Windows 11 → `Result: PASS (10/10 checks)`, exit 0,
    temp project removed. Checks: install, runtime, capture, propose, accept,
    block (`Bash "echo GRUDGE_TEST"` exited 2), allow (`echo hello` exited 0),
    fail open, stats (exactly 1 block), report (1 caught, 1 blocked).
  - Node suite: **88/88 pass** (`npm test --prefix packages/grudge`).
  - Python suite: **308 passed, 1 skipped**, exit 0 (`python -m pytest -q`).
  - `ruff check .`, `mypy .` (**125 source files**), `python -m
    scripts.docs_check` (**33** files), and `scripts.release_check` all pass.
  - `npm run build` and `node dist/grudge.mjs --version` → `grudge 0.1.9`.
  - Benchmark (unchanged, still the only measured row): capture 71 steps,
    cassette 23 → 23 entries and 11,854 → 2,081 bytes, 1,254 oracle calls,
    4.68/4.83/5.31 s on Windows 11 / Python 3.14.0.
- **Step 0 evidence:** [`docs/phase-25-findings.md`](docs/phase-25-findings.md)
  records the published-CLI commands and output that showed propose wrote only
  a pending scar, `--accept` was silently ignored, the tool map lacked
  `PowerShell`, and a deny exited 0.

## Production-readiness remediation (2026-10-30)

- **Branch:** `remediation/production-readiness`, based on `481872e`. All
  changes are uncommitted; nothing was pushed, tagged, or published.
- **Source:** [`docs/production-readiness-audit-2026-10-30.md`](docs/production-readiness-audit-2026-10-30.md).
  The audit called the tree NOT READY; the remediation section at the end of
  that file records the fix, test, and command result for each finding.
- **P0-1 — concurrent calls escaped the guard.** The handler wrote stats before
  deciding, so a stale lock or contention turned a match into an allow.
  Reproduced: 2/25 concurrent matching calls allowed, 9/10 duplicate deliveries
  allowed. Fixed by deciding first and making accounting lock-free and bounded.
  Now 25/25 and 10/10 blocked.
- **P1-2/P2-1 — hook latency.** A referenced 1,500 ms timer made every call
  wait out the budget. End-to-end spawn went from p50 ≈1.78 s to ≈0.16 s.
- **P1-1 — `must` rules were enforced backwards.** The Node compiler emitted
  `polarity`, but the Python compiler returned `never` for a bare `CallShape`,
  so a Python-compiled `must call` rule blocked the required call. Fixed in
  `grudge/guard/compile.py` (`_polarity` now returns `must` for `CallShape` and
  `Ordering`, `never` for a negated set or a taint flow); `atEvents` stays empty
  for a missing required call. Pinned by Python polarity tests plus a
  Python-compile → Node-guard end-to-end test.
- **P1-3 — demo proof was repo-only.** Script and payloads ship in the wheel;
  runtime resolution is `--node-runtime` → `GRUDGE_NODE_RUNTIME` → checkout →
  `node_modules`. Verified from a clean venv + npm tarball outside the checkout.
- **P1-4/P3-1 — redaction drift.** Node and Python now apply one ordered rule
  list, including an identical labelled-value pattern (quoted values, trailing
  punctuation, and query separators), pinned by the 18 cases in
  `spec/redaction-corpus.json` and asserted by both suites.
- **P1-5 — path semantics diverged.** Python mirrors Node's canonicalization;
  Windows casing, `..` escapes, and sibling prefixes are shared fixtures.
- **P2-2, P2-3, P2-6, P2-7, P3-3, P3-4:** hostile session ids rejected;
  `doctor --json` states enforcement is unproven; `must` control message added;
  `propose` rejects shell-splitting values; `uninstall` preserves user files in
  `.grudge`; release docs stop using `npm pack --prefix`.
- **Verification:** Python **319 passed, 1 skipped**; Node **104/104**;
  `ruff`, `mypy`, `docs_check`, `release_check`, `twine check`, `build`,
  `npm pack`, clean wheel+tarball install, wheel-compiled `must call` → Node
  guard (`npm test` exit 0, `ls -la` exit 2), and `demo --guard` all exit 0.
  Redaction parity: 0 divergences over 779 generated inputs plus the 18-case
  shared corpus.
- **Not verified locally:** macOS/Linux runners, Python 3.11, Node 18/20/22, and
  the two new CI jobs. They are declared NOT VERIFIED in the audit until the
  first CI run; the commands they run were verified on Windows.

## Phase board

- [x] 0. Contracts, repository shape, ADR template
- [x] 1. Schemas: trace, cassette, predicate, Scar
- [x] 2. Leaky-agent story and scripted policy
- [x] 3. Recording and redaction
- [x] 4. Cassette replay sandbox
- [x] 5. Two-level shrinking (entries, then content)
- [x] 6. Predicate DSL and compiler
- [x] 7. Admission proof (red/green plus controls)
- [x] 8. Statistics and Wilson gate
- [x] 9. Python CLI
- [x] 10. Demo events and local server
- [x] 11. Static viewer
- [x] 12. Documentation, pitch, benchmark row, reproducibility audit
- [ ] 13. Stretch register (registry, locator, fuzzer, selector, integrations,
      outcome predicates, MCP/LangGraph adapters, full Scar browser) —
      **intentionally deferred**; the register lives in
      [`docs/roadmap.md`](docs/roadmap.md)
- [x] 14. Cross-language guard contract and compiled predicate schema
- [x] 15. Node Guard command surface
- [x] 16. Trust model and retention boundaries
- [x] 17. Hook contracts, fail-open behavior, and output caps
- [x] 18. Managed instruction block
- [x] 19. Per-agent installer integration matrix
- [x] 20. Token budgets and status line
- [x] 21. Python/Node shared conformance
- [x] 22. Installer safety: scope selection, backups, rollback, uninstall
- [x] 23. Doctor diagnostics and duplicate-scope accounting
- [x] 24. Scratch walkthrough, package artifacts, release preparation
- [x] 25. One-command proof (`grudge verify`), truthful propose output, and doc
      corrections

## Phase 14-21 checklists

### 14 — Guard contract

- [x] Compiled predicate JSON schema checked into `spec/`.
- [x] Python compiler and Node runtime agree on call shape, ordering, and
      taint-lite semantics.
- [x] Canonical tool-name normalization documented.

### 15 — Node Guard commands

- [x] `setup`, `doctor`, `uninstall`, `hook`, `propose`, `accept`, `scars`,
      `stats`, `report`, `statusline` are implemented and tested.
- [x] Every command supports structured text output and `--json` where it
      applies; hook stdout stays machine JSON.
- [x] The bundled runtime has no npm runtime dependencies.

### 16 — Trust model

- [x] Local-only state under `.grudge/`; no telemetry or hosted service.
- [x] Captured content is redacted before persistence.
- [x] Hook failures fail open with a visible warning.

### 17 — Hooks

- [x] Five hook events registered: `SessionStart`, `UserPromptSubmit`,
      `PreToolUse`, `PostToolUse`, `Stop`.
- [x] Deny payloads match the host contract; malformed input exits 0.
- [x] Result payloads are capped; timings recorded as environment measurements.

### 18 — Managed instruction block

- [x] Versioned block with stable begin/end markers.
- [x] Block is line-budgeted and re-installed idempotently.
- [x] Uninstall removes only the managed block and restores the original bytes.

### 19 — Integrations

- [x] Claude Code verified for hook enforcement and instruction loading.
- [x] Codex, Gemini CLI, GitHub Copilot, OpenCode, and Windsurf documented as
      advisory (instruction files only).
- [x] Cursor documented as unverified; the installer writes no Cursor files.

### 20 — Token budgets

- [x] Managed block, hook payloads, and status line have enforced caps.
- [x] Token savings are labelled estimated, never measured claims.
- [x] `doctor` reports budget usage.

### 21 — Shared conformance

- [x] Python and Node suites both run in CI on Linux, macOS, and Windows.
- [x] Fixture conformance is covered by both languages.
- [x] `ruff check .` and `mypy .` pass on the whole tree.
- [x] `npm pack --dry-run` runs in CI.

### 25 — One-command proof

- [x] `grudge verify` builds a temp project, runs the installer and the
      installed-script smoke test, proposes and accepts a rule, feeds real
      Claude Code `PreToolUse` payloads over stdin, and checks stats and
      `report` (10 checks; PASS/FAIL; non-zero on failure; `--keep`;
      `--json`).
- [x] A matching `Bash` call exits `2` with a reason; a benign call exits `0`;
      malformed input exits `0` (fail open).
- [x] `test/phase25-verify.test.js` runs `verify` itself, including `--keep`,
      a broken-runtime failure, and the CLI `--json` path.
- [x] `doctor` prints "run `grudge verify` to prove blocking works" and never
      claims blocking from file checks.
- [x] `propose` prints `PENDING. Not enforced until you run: grudge accept <id>`
      and returns `accepted: false`, `enforced: false`, `status: "pending"`.
- [x] `propose --accept` enforces immediately; the default stays pending and
      the trade-off is documented.
- [x] Unknown options exit `2` and list valid flags; `--help` lists the propose
      options and `verify`.
- [x] `test/phase25-mapping.test.js` covers every mapped Claude Code tool and
      blocks a real payload per tool.
- [x] Managed block tells the model to paste exact output and never claim a
      pending rule is active (977 chars, 9 lines, under the 1,000/12 caps).
- [x] README Quickstart uses `npx grudge-cli@latest`, has a "Verify it works"
      section, and states that enforcement is verified for Claude Code only.

## Known issues

1. **Phase 25 is unreleased.** `grudge-cli@0.1.9` is published on both
   registries; the Phase 25 changes on `master` need the next version bump and
   the owner's npm and PyPI credentials. Release commands are in the final
   report for this phase.
2. **Push events still do not start CI on this repository.** The workflow is
   active and `workflow_dispatch` runs it; manual dispatch was green
   (run `40818300615`, 6/6 jobs).
3. **No live Claude Code run in this pass.** `grudge verify` proves the shipped
   runtime blocks a payload, but the interactive session check still needs a
   human; steps and expected output are in
   [`scripts/live-check.md`](scripts/live-check.md). The historical attempt in
   [`docs/FINAL-REPORT.md`](docs/FINAL-REPORT.md) ended with provider
   `ECONNREFUSED` after hooks loaded successfully. **Guard enforcement is
   verified for Claude Code only.**
4. **Taint matching is substring-based.** `tainted_by` looks for the source
   value inside later arguments; it does not track structured data flow.
5. **The Node runtime is a subset of the Python engine.** Node evaluates call
   shape, ordering, and taint-lite predicates only; shrinking, admission,
   statistics, and the demo live in Python.
6. **The gate is offline and deterministic.** It replays recorded cassettes; it
   does not call a model provider and cannot detect drift in live model output.
7. **Advisory agents are not enforced.** Codex, Gemini CLI, Copilot, OpenCode,
   and Windsurf receive instruction files only; nothing blocks a tool call.
8. **Cursor writes nothing.** The adapter is unverified by design.
9. **Phase 13 stretch work is deferred:** registry and retirement, fault
   locator, variant fuzzer, changed-Scar selector, pytest/GitHub integrations,
   outcome predicates, MCP/LangGraph adapters, and the full Scar browser.
10. **The benchmark row is one environment.** The README records a Windows 11
    / Python 3.14.0 run: 71 trace steps, 23 → 23 cassette entries, 1,254 oracle
    calls, 4.83 s, 11,854 → 2,081 cassette bytes. Entry reduction keeps all 23
    entries because every recorded call is needed to replay the leak; content
    reduction does the work here. Wall time is not a cross-platform guarantee.
11. **Windows timing assertions are machine-sensitive.** The statusline test now
    asserts the median of 20 in-process calls instead of the maximum, because a
    single antivirus/GC spike produced 115–162 ms samples; the hook p50/p95 test
    keeps its threshold and passes in isolation on this machine.
12. **This machine's `~/.claude/settings.json` points `statusLine` and
    `subagentStatusLine` at `C:\Users\kotes\.claude\helpers\grudge-graft-statusline.cjs`,
    which does not exist.** Grudge preserves it and `doctor` reports the missing
    target; restoring that helper is out of scope for this repository.

## Phase 25 evidence

`node packages/grudge/dist/grudge.mjs verify` from a scratch directory on
Windows 11, PowerShell, Node 22:

```text
[ok] install: 5 files written, including .claude/settings.json and CLAUDE.md
[ok] runtime: grudge 0.1.9
[ok] capture: PostToolUse payload stored as canonical tool "shell"
[ok] propose: scar-4b6fc490dc87 recorded as pending
[ok] accept: scar-4b6fc490dc87 compiled with mode "block"
[ok] block: Bash "echo GRUDGE_TEST" exited 2: Never call shell with the specified arguments. [scar scar-4b6fc490dc87]. Do not retry; change approach or ask the user.
[ok] allow: Bash "echo hello" exited 0 with no decision
[ok] fail open: malformed payload exited 0 (allowed)
[ok] stats: 1 blocked event in .grudge/stats.jsonl
[ok] report: grudge report shows 1 caught, 1 blocked
Result: PASS (10/10 checks)
Temp project removed (use --keep to inspect it)
```

Before this phase the same payload printed the deny JSON and exited `0`, and
nothing in the test suite fed the installed runner a Claude Code payload end to
end. The published-CLI measurements that established that are in
[`docs/phase-25-findings.md`](docs/phase-25-findings.md).

## Release evidence remaining

- Push the branch, confirm the three-OS CI matrix is green.
- Run [`scripts/live-check.md`](scripts/live-check.md) in a scratch repository
  and attach the screenshots.
- Record a second benchmark run on a different host before quoting timings in
  public material.
