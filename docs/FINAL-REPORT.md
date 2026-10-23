# Final report: Grudge Phases 14-24 and current release audit

**Purpose:** Record final parallel-mode evidence, limitations, and release commands.
**Audience:** Project owner, reviewers, and release operator.
**Status:** historical baseline plus current release note
**Last updated (phase):** 0.1.5 · 2026-10-23

**Mode:** PARALLEL after Phase 14; three dedicated worktrees, merges A → B → C.
**Phase board:** 0-12 `[x]`, 13 deferred `[ ]`, 14-24 `[x]`; Phase 24 walkthrough and release-preparation exit passed.

## Current release audit — 2026-10-23

- Local metadata and registry queries report `grudge-cli@0.1.5` on npm and `grudge-cli==0.1.5` on PyPI.
- Commit `b21be5a` contains the current pre-production fixes: uninstall safety, Claude `CLAUDE.md` visibility, duplicate-hook diagnostics/deduplication, and version `0.1.5` metadata.
- The current Node suite passes 55 tests; the current Python suite passes with one skip; configured Ruff, mypy, docs, and package checks pass.
- Broad Ruff and mypy remain blocked by known pre-existing example formatting and duplicate-module discovery issues.
- The current audit still requires a clean third-party status-line coexistence proof, a full packed-artifact end-to-end install record, and non-Windows platform evidence before claiming universal production readiness.

## Definition of Done evidence

- Python and Node shared conformance: the Phase 21 baseline was **301 Python passed**, Ruff clean, mypy clean, docs-check **30**; the Phase 24 rerun is **301 passed, 1 skipped** and **48 Node passed**; **27/27** fixtures pass in both languages.
- Built hook has no npm runtime imports and fails open: `npm run build`; bundle scan/tests and fail-open hook tests passed; malformed input returns code 0.
- Two-session offline proof: `node tests/test_e2e_guard.mjs` → pass; `grudge demo --guard --json` → Session 1 proposed/accepted, Session 2 blocked.
- Installer: Node installer tests pass; `npm pack --dry-run` lists intended package files; doctor reports green in a scratch repo.
- Adapter safety: verified Claude Code, Codex, Gemini CLI, GitHub Copilot, OpenCode, Windsurf; Cursor is unverified and writes nothing.
- Budgets: doctor measured `0/1200`, `0/400`, `123/200`, `800/1000 chars`, managed block `8/12 lines`; all within caps; token savings remain labeled **est.**
- No MCP/server/telemetry/API key/runtime network was added; demo values are fake and labeled.
- Fresh clone baseline: `uv pip install --no-deps -e <clone>` then `make all` → **301 passed**, Node **35 passed**, e2e and guard demo passed.

## Phase 22-24 walkthrough and release evidence

- Scratch root: `C:\Users\kotes\AppData\Local\Temp\grudge-phase24-t3-20261022`; no walkthrough commands ran in the repository or home directory.
- Node release artifact: `npm run build` and `npm pack --dry-run` from `packages/grudge` passed for `grudge-cli@0.1.2`; the tarball contained the bundled runtime and source files with no runtime npm dependencies.
- Python release artifacts: `python -m build --outdir <scratch>\python-dist` passed for `grudge_cli-0.1.2.tar.gz` and `grudge_cli-0.1.2-py3-none-any.whl`; `twine check` passed for both. No upload or publish command was run.
- Scratch installer walkthrough passed using the local `0.1.2` npm tarball: repo setup, `doctor` (all checks green), installed `statusline`, scar proposal/acceptance, allowed PreToolUse silence, matching PreToolUse deny, `stats`, `report`, and uninstall cleanup.
- Python `demo --guard --json` passed from a scratch editable copy: Session 1 leaked and proposed, Session 2 blocked, with no provider or network call.
- Verification after the release edits: `npm test` → **49 Node passed**; `python -m pytest -q` → **301 passed, 1 skipped**; configured Ruff and mypy targets, docs-check, and `git diff --check` passed.
- `claude --version` was available (`2.1.283`). A real Claude Code `--print --include-hook-events --output-format stream-json` run in the scratch repo loaded three SessionStart and two UserPromptSubmit Grudge hooks with exit code 0. The interactive `/hooks` UI and natural-language Step 7 model execution were not completed because Claude returned `ECONNREFUSED` after hook startup; this is an API connectivity limitation, not a hook-load failure.
- The Stop hook was verified directly in the installed runtime: PreToolUse returned the official deny payload, Stop returned `{"systemMessage":"..."}` once, and the second Stop was silent. Docker was installed but its Linux daemon was unavailable; WSL2 was present but the configured Python 3.14 environment lacked `python3.14-venv`, so the WSL walkthrough was unverified. Home-directory safety and cleanup were verified in isolated fake-home directories: unsafe `--yes` was rejected, explicit global setup succeeded, and uninstall removed the fake-home `.grudge` tree.
- Broad `ruff check .` remains blocked by pre-existing formatting findings in `examples/leaky_agent`; broad `mypy .` is blocked by the pre-existing Windows `nul` entry. The configured project checks (`ruff check grudge tests scripts` and `mypy grudge scripts`) are clean.

## Measurements and limitations

- Hook timing: p50/p95 **1.80/4.86 ms**; warm statusline p50/p95 **0.01/0.03 ms**. Results are environment measurements, not universal guarantees.
- Python remains the full-engine source of truth; Node implements call-shape, ordering, and taint-lite runtime semantics.
- Phase 13 stretch work remains deferred. JSON Schema validation used structural contract tests because the optional `jsonschema` package was unavailable in the pinned environment.
- The historical Phase 24 adapter documentation was checked on **2026-10-19**. The current 0.1.5 audit rechecked the Claude Code documentation on **2026-10-23** and queried npm/PyPI directly; both registries report 0.1.5 as latest.

## Historical release commands for 0.1.2 (archived; not run in Phase 24)

```bash
git push origin master
cd packages/grudge
npm publish --access public
cd ../..
python -m twine upload release-dist/*
npm deprecate grudge-cli@0.1.0 "Broken installer, use 0.1.1 or later"
```
