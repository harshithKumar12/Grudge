# Grudge progress tracker

**Purpose:** Canonical, current state of the repository, the phase board, and
the known issues that still block a universal production claim.
**Audience:** Project owner, reviewers, and release operator.
**Status:** current as of the 0.1.8 release preparation.
**Last updated:** 2026-10-29

## Current snapshot

- **Branch:** `master`. **Head at the start of this pass:** `ff720e1 fix: make
  grudge commands available on Windows`.
- **Fixes landed in this pass:**
  - `b995c1c` fail builds on unresolved imports (bundler validates every
    relative import and exported name).
  - `52e6cb6` restore original settings on uninstall (byte-identical
    third-party hooks and `statusLine`).
  - `2c2e2c3` emit ASCII-only human output (`--ascii`/`NO_COLOR` are
    compatibility no-ops, `[ok] Healthy`).
  - `2d8e5aa` make content reduction independent of mapping order.
  - `a803a41`, `0a8e8e9`, `32f7810` lint and type hygiene for examples, package
    bases, and tests.
  - `bd65b53` CI matrix: Ubuntu, macOS, Windows × Python 3.11/3.14, Node suite,
    build, and `npm pack --dry-run`.
- **Local versions:** `grudge-cli@0.1.8` (npm) and `grudge-cli==0.1.8` (PyPI
  metadata). **0.1.7 is published in both registries** but its PyPI wheel omits
  the demo data and its Node CLI has the `scars show`/`--help` defects; 0.1.8
  is the fixed build.
- **Fixes queued in 0.1.8:** `scars show`, Node `--help` and short flags, wheel
  data, `admit` controls default, filtered taint seeds, ASCII gate output,
  engine `--version`. See `CHANGELOG.md`.
- **Verified in this checkout:**
  - Node suite: **74/74 pass** (`npm test --prefix packages/grudge`).
  - Python suite: **308 passed, 1 skipped**, exit 0 (`python -m pytest -q`).
    The single skip and the `pytest_asyncio` deprecation warning are benign.
  - `ruff check .` passes (whole tree, examples and tests included).
  - `mypy .` passes: **125 source files**.
  - `python -m scripts.docs_check`: **32** indexed, non-empty, linked files.
  - `python -m scripts.release_check`: local npm/PyPI metadata agree.
  - `npm run build` and `node dist/grudge.mjs --version` → `grudge 0.1.8`.
  - Benchmark re-measured three times on Windows 11 / Python 3.14.0: capture
    71 steps, cassette 23 → 23 entries and 11,854 → 2,081 bytes, 1,254 oracle
    calls, 4.68/4.83/5.31 s. README now carries only this measured row.
  - Flake probe: the shrinker/cassette-builder assertion ran **200 times** plus
    eight `PYTHONHASHSEED` values and produced one identical fingerprint
    `(3 entries, 5e5e8edd…0b31, 199 events, 145 oracle calls)`. No
    intermittent failure was reproduced, so no `xfail` was added.

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

## Known issues

1. **`0.1.8` is not published yet.** The `0.1.7` artifacts lack the fixes
   listed above; publishing `0.1.8` needs the owner's npm and PyPI credentials.
2. **CI has not executed yet.** `.github/workflows/grudge-guard.yml` is
   committed but its first green run can only happen after a push.
3. **No live Claude Code run in this pass.** The real hook/status-line block
   test needs an interactive Claude session; steps and expected output are in
   [`scripts/live-check.md`](scripts/live-check.md). The historical attempt in
   [`docs/FINAL-REPORT.md`](docs/FINAL-REPORT.md) ended with provider
   `ECONNREFUSED` after hooks loaded successfully.
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

## Release evidence remaining

- Push the branch, confirm the three-OS CI matrix is green.
- Run [`scripts/live-check.md`](scripts/live-check.md) in a scratch repository
  and attach the screenshots.
- Record a second benchmark run on a different host before quoting timings in
  public material.
