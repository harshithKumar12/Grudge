# Final report: Grudge Phases 14-21

**Purpose:** Record final parallel-mode evidence, limitations, and release commands.
**Audience:** Project owner, reviewers, and release operator.
**Status:** final
**Last updated (phase):** 21

**Mode:** PARALLEL after Phase 14; three dedicated worktrees, merges A → B → C.
**Phase board:** 0-12 `[x]`, 13 deferred `[ ]`, 14-21 `[x]`; Phase 21 exit passed.

## Definition of Done evidence

- Python and Node shared conformance: `make VENV=.venv-wsl all` → **301 Python passed**, Ruff clean, mypy clean, docs-check **30**; `npm test` → **35 Node passed**; **27/27** fixtures pass in both languages.
- Built hook has no npm runtime imports and fails open: `npm run build`; bundle scan/tests and fail-open hook tests passed; malformed input returns code 0.
- Two-session offline proof: `node tests/test_e2e_guard.mjs` → pass; `grudge demo --guard --json` → Session 1 proposed/accepted, Session 2 blocked.
- Installer: Node installer tests pass; `npm pack --dry-run` lists intended package files; doctor reports green in a scratch repo.
- Adapter safety: verified Claude Code, Codex, Gemini CLI, GitHub Copilot, OpenCode, Windsurf; Cursor is unverified and writes nothing.
- Budgets: doctor measured `0/1200`, `0/400`, `123/200`, `800/1000 chars`, managed block `8/12 lines`; all within caps; token savings remain labeled **est.**
- No MCP/server/telemetry/API key/runtime network was added; demo values are fake and labeled.
- Fresh clone: `uv pip install --no-deps -e <clone>` then `make all` → **301 passed**, Node **35 passed**, e2e and guard demo passed.

## Measurements and limitations

- Hook timing: p50/p95 **1.80/4.86 ms**; warm statusline p50/p95 **0.01/0.03 ms**. Results are environment measurements, not universal guarantees.
- Python remains the full-engine source of truth; Node implements call-shape, ordering, and taint-lite runtime semantics.
- Phase 13 stretch work remains deferred. JSON Schema validation used structural contract tests because the optional `jsonschema` package was unavailable in the pinned environment.
- Adapter documentation was checked on **2026-10-19**. npm name availability was not queried; publishing is intentionally left to the owner.

## Release commands (not run)

```bash
git push origin master
cd packages/grudge
npm publish --access public
```
