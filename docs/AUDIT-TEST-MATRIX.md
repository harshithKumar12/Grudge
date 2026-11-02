# Audit test matrix — Grudge 0.2.1

**Purpose:** Record every black-box test the independent audit executed, with environment, result, exit code, and evidence.
**Audience:** Repository owner, release engineer, re-auditor.
**Status:** Audit evidence. Baseline for the remediation verification matrix.
**Last updated (phase):** audit - 2026-10-31
**Date:** 2026-10-31 · **Host:** Windows 11 26300, Python 3.14.0, Node 25.2.1, Claude Code 2.1.283
**Commit:** `a4788c0` (+ 5 uncommitted version-bump files)

Results are `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED`. "BLOCKED" means the
environment prevented the test (e.g. no login); "NOT TESTED" means out of scope
for this pass.

| Test | Environment | Result | Exit code | Evidence |
|---|---|---|---|---|
| **Environment / repo** | | | | |
| Git branch + HEAD captured | repo | PASS | 0 | `remediation/production-readiness @ a4788c0` |
| Toolchain versions | host | PASS | 0 | Python 3.14.0, Node 25.2.1, npm 11.21.1, git 2.55.0 |
| Pre-existing user changes preserved | repo | PASS | — | 5 modified files unchanged after audit (md5 verified) |
| **Python package** | | | | |
| Install from source into clean venv | temp venv 1 | PASS | 0 | `grudge-cli 0.2.1`, 20 deps |
| Build wheel + sdist | temp venv 1 | PASS | 0 | `grudge_cli-0.2.1.{whl,tar.gz}` |
| Install wheel into second clean venv | temp venv 2 | PASS | 0 | clean install with deps |
| `grudge-engine --version` | outside repo | PASS | 0 | `grudge 0.2.1` |
| `grudge-engine --help` | outside repo | PASS | 0 | 8 commands |
| `grudge-engine doctor` | outside repo | **FAIL** | 2 | `No such command 'doctor'` — Node-only command |
| `grudge-engine verify` | outside repo | **FAIL** | 2 | `No such command 'verify'` — Node-only command |
| Wheel contains `demo/e2e_guard.mjs` | wheel zip | PASS | 0 | present |
| Wheel contains 4 demo payloads | wheel zip | PASS | 0 | all 4 present |
| Wheel contains prompt resource | wheel zip | PASS | 0 | `grudge/predicates/prompts/synthesize.md` |
| `demo --no-browser --fast --json` | outside repo | PASS | 0 | vulnerable gate BLOCKED, fixed passed |
| `demo --guard --json` without runtime | outside repo | **FAIL** | 2 | `Grudge guard runtime not found` |
| `demo --guard --json` with npm runtime | outside repo | PASS | 0 | `ok:true`, `session2:"blocked"` |
| **Node package** | | | | |
| `npm run build` | repo | PASS | 0 | `dist/grudge.mjs` 169 KB |
| Bundle has no external imports | repo | PASS | 0 | only `node:*` imports |
| `npm pack` | repo | PASS | 0 | 48 files, 93.2 KB |
| Install tarball into clean project | temp npm project | PASS | 0 | 1 package, 0 vulns |
| `grudge --version` / `--help` | temp npm project | PASS | 0 | `grudge 0.2.1`, full command list |
| `grudge doctor` | temp npm project | PASS | 0 | 1 passed, 0 failed |
| `grudge verify` | temp npm project | PASS | 0 | PASS (10/10) |
| `grudge verify --keep` | temp npm project | PASS | 0 | temp project kept for inspection |
| **Test suites** | | | | |
| `pytest` | venv 1, repo root | PASS | 0 | 319 passed, 1 skipped |
| `ruff check .` | venv 1 | PASS | 0 | All checks passed |
| `mypy .` (strict) | venv 1 | PASS | 0 | 126 files, no issues |
| `scripts.docs_check` | venv 1 | PASS | 0 | 34 indexed files |
| `scripts.release_check` | venv 1 | PASS | 0 | metadata agree |
| `npm test` | repo | PASS | 0 | 104 tests, 104 pass |
| `npm audit` | temp npm project | PASS | 0 | 0 vulnerabilities |
| `pip-audit` | venv 2 | PASS | 1 (own pip) | only venv's bundled pip flagged; no Grudge dep |
| **Guard black-box** | | | | |
| Capture → propose → accept → block | temp project | PASS | 2 | deny JSON + stderr reason |
| `never call shell where command ~` match | temp project | PASS | 2 | blocked |
| `never call …` non-match | temp project | PASS | 0 | allowed |
| `must call read_file before call http` | temp project | PASS | 2 / 0 | blocked before read, allowed after |
| Taint flow same session | temp project | PASS | 2 | blocked |
| Taint flow other session | temp project | PASS | 0 | isolated, allowed |
| Duplicate hook delivery | temp project | PASS | 2, 2 | both blocked |
| Windows path match | temp project | PASS | 2 | blocked |
| POSIX path match | temp project | PASS | 2 | blocked |
| Relative path match | temp project | PASS | 2 | blocked |
| Malformed JSON input | temp project | PASS | 0 | fail open + warning |
| Empty stdin | temp project | PASS | 0 | allow |
| JSON array input | temp project | PASS | 0 | fail open + warning |
| Unknown hook event | temp project | PASS | 0 | fail open + warning |
| `GRUDGE_DISABLE=1` | temp project | PASS | 0 | allow |
| UTF-8 BOM input | temp project | PASS | 0 | fail open |
| Corrupt `compiled.json` | temp project | PASS | 0 | fail open, cannot invent match |
| Missing `compiled.json` | temp project | PASS | 0 | allow |
| Corrupt/wrong-version rules warn | temp project | **FAIL** | 0 | silent; no stderr warning (P2-3) |
| Path traversal in `session_id` | temp project | PASS | 0 | skipped, nothing written |
| SessionStart output | temp project | PASS | 0 | 5 scar lines |
| UserPromptSubmit trigger | temp project | PASS | 0 | nudge emitted |
| UserPromptSubmit non-trigger | temp project | PASS | 0 | silent |
| Stop hook | temp project | PASS | 0 | silent (no new catch) |
| Stats JSON output | temp project | PASS | 0 | counts present |
| `grudge uninstall` | temp project | PASS | 0 | settings/CLAUDE.md restored |
| **Hook working-directory behaviour** | | | | |
| Hook from subdirectory | temp project | **FAIL** | 1 | `Cannot find module …sub\.grudge…` — Claude Code treats as non-blocking |
| Payload `cwd` ≠ install root | temp project | **FAIL** | 0 | rules skipped silently |
| Payload `cwd` = install root, process cwd elsewhere | temp project | PASS | 2 | blocked (state follows payload cwd) |
| **Global scope** | | | | |
| `setup --scope global` plan | fake HOME | PASS | 0 | writes `~/.claude/settings.json`, `~/.grudge/bin`, `~/.gitignore` |
| Global rule in home dir | fake HOME | PASS | 2 | blocked |
| Global rule from another project | other project | **FAIL** | 0 | not enforced — rules never consulted (P0-2) |
| **Budget** | | | | |
| `hookBudgetMs:1` with matching block | temp project | **FAIL** | 0 | `budget exceeded; allowed (fail-open)` (P0-3) |
| Default budget, matching block | temp project | PASS | 2 | blocked |
| **Redaction** | | | | |
| AWS access key in prose | unit | PASS | — | `[REDACTED KEY]` |
| `AWS_SECRET_ACCESS_KEY=` | unit | PASS | — | value redacted (but residue in compound form) |
| `Authorization: Bearer …` | unit | PASS | — | `Bearer [REDACTED]` |
| `sk-` / `ghp_` / `xoxb-` | unit | PASS | — | `[REDACTED KEY]` |
| Private-key block | unit | PASS | — | `[REDACTED PRIVATE KEY]` |
| Python/Node corpus agreement | unit | PASS | — | 18/18 identical |
| Structured `password` field | end-to-end | **FAIL** | 0 | stored in cleartext (P0-4) |
| Structured `api_key` field | end-to-end | **FAIL** | 0 | stored in cleartext |
| Nested `auth.token` / `auth.secret` | end-to-end | **FAIL** | 0 | stored in cleartext |
| Query-string `?api_key=` | unit | **FAIL** | — | replacement injects `: ` into URL |
| Compound `AWS_ACCESS_KEY_ID=AKIA…` | unit | **FAIL** | — | leaves ` KEY]` residue |
| **Engine workflow** | | | | |
| `capture` | venv 2, temp dir | PASS | 0 | 71 steps, `run_id` |
| `shrink` | venv 2 | PASS | 0 | 11 854 → 2 081 bytes, 1 254 oracle calls |
| `admit` | venv 2 | PASS | 0 | admitted, 3 bad violations |
| `compile` | venv 2 | PASS | 0 | 1 rule, version 1 |
| `run` on bad agent | venv 2 | PASS | 1 | gate fails, 0/20 |
| `run` on fixed agent | venv 2 | PASS | 0 | gate passes, 20/20 |
| **Performance** | | | | |
| Empty-rules hook latency | installed npm | PASS | 0 | p50 164–216 ms |
| Blocking hook latency | installed npm | PASS | 2 | p50 206 ms, p95 302 ms |
| Benign hook latency | installed npm | PASS | 0 | p50 158 ms, p95 210 ms |
| 500-event session | installed npm | PASS | 2 | p50 289 ms |
| ~20 MB session | installed npm | PASS | 0 | p50 435 ms, max 620 ms |
| 25 concurrent matching calls | installed npm | PASS | 25×2 | 25/25 blocked, p50 993 ms |
| **Claude Code integration** | | | | |
| Protocol schema vs live docs | reference | PASS | — | deny JSON on exit 2 matches docs |
| Live `claude -p` tool call | host | **BLOCKED** | — | `Not logged in · Please run /login` |
| PostToolUse dispatch from CLI | temp project | PASS | 0 | session event written to `.grudge/session/<id>.jsonl` |
| **CI** | | | | |
| Workflow matrix review | `.github/workflows` | PASS | — | ubuntu/macos/windows × py3.11/3.14; node 18/20/22; package job |
| CI run of audit findings | — | NOT TESTED | — | no network push; no CI config changed |
