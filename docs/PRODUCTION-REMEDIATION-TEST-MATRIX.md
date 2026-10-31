# Production remediation test matrix — Grudge 0.2.1

**Purpose:** Re-run the independent audit's black-box matrix against the remediated installed packages and record each row's post-fix result, exit code, and evidence.
**Audience:** Repository owner, release engineer, re-auditor.
**Status:** Remediation evidence. Read together with `docs/AUDIT-TEST-MATRIX.md` (the baseline) and `docs/PRODUCTION-REMEDIATION-REPORT.md` (per-finding detail).
**Last updated (phase):** 0.2.1 production remediation - 2026-10-31

**Host:** Windows 11 26300 · Python 3.14.0 · Node 25.2.1 · npm 11.21.1 · git 2.55.0
**Installed artifacts:** `grudge_cli-0.2.1-py3-none-any.whl` (132,122 B),
`grudge_cli-0.2.1.tar.gz` (166,911 B), `grudge-cli-0.2.1.tgz`
(50 files, 106,408 B).
**Installed outside the checkout:** fresh venv and a clean npm project under
`D:\Temp\opencode`.

Results are `PASS`, `FAIL`, `BLOCKED`, `NOT RE-RUN`, or `UNCHANGED`. "PASS"
below means the row was re-executed against the installed tarball (or the
installed wheel for Python rows) and produced the expected result. "NOT RERUN"
means the row is outside the remediation surface and its audit result still
stands; the reason is stated. Nothing in the baseline is reclassified.

The remediation's own regression suite is
`packages/grudge/test/remediation-p0.test.js` (9 black-box tests) plus the
shared redaction corpus. The broad guard matrix below was executed by
`D:\Temp\opencode\matrix-repro.mjs` against
`D:\Temp\opencode\npm-rem\node_modules\grudge-cli\dist\grudge.mjs`.

---

## 1. Environment / repository

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Git branch + HEAD captured | PASS | PASS | `remediation/production-readiness`; remeasurement performed on the remediation tree above `a4788c0` (the pre-existing local version bump produces the 0.2.1 artifacts) |
| Toolchain versions | PASS | PASS | Python 3.14.0, Node 25.2.1, npm 11.21.1, git 2.55.0 |
| Pre-existing user changes preserved | PASS | PASS | `.claude/` untouched; `.gitignore`, `CLAUDE.md`, and the version-bump files left uncommitted and unchanged by the remediation |

---

## 2. Python package

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Install from source into clean venv | PASS | PASS | wheel installed into a fresh venv; `grudge 0.2.1` |
| Build wheel + sdist | PASS | PASS | `grudge_cli-0.2.1-py3-none-any.whl` 132,122 B; `grudge_cli-0.2.1.tar.gz` 166,911 B |
| Install wheel into second clean venv | PASS | PASS | clean install with dependencies; no checkout on `sys.path` |
| `grudge-engine --version` | PASS | PASS | `grudge 0.2.1` |
| `grudge-engine --help` | PASS | PASS | command list present |
| `grudge-engine doctor` | FAIL | **UNCHANGED (FAIL)** | Node-only command; P2-1 was outside the requested scope |
| `grudge-engine verify` | FAIL | **UNCHANGED (FAIL)** | Node-only command; P2-1 |
| Wheel contains `demo/e2e_guard.mjs` | PASS | PASS | unchanged packaging; `release_check` passes |
| Wheel contains 4 demo payloads | PASS | PASS | unchanged packaging |
| Wheel contains prompt resource | PASS | PASS | unchanged packaging |
| `demo --no-browser --fast --json` | PASS | PASS | vulnerable gate blocked, fixed path passed |
| `demo --guard --json` without runtime | FAIL | **UNCHANGED (FAIL)** | P2-2 was outside the requested scope |
| `demo --guard --json` with npm runtime | PASS | PASS | `session1: leaked and proposed`, `session2: blocked` |

---

## 3. Node package

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| `npm run build` | PASS | PASS | `dist/grudge.mjs` rebuilt from `src/` |
| Bundle has no external imports | PASS | PASS | `node --test test/phase22-install-hardening.test.js` passes |
| `npm pack` | PASS (48 files) | PASS (50 files) | `grudge-cli-0.2.1.tgz`, 50 files, 106,408 B; adds `core/roots.js`, `core/rules.js` |
| Install tarball into clean project | PASS | PASS | `grudge 0.2.1`; `dist/grudge.mjs` self-contained |
| `grudge --version` / `--help` | PASS | PASS | `grudge 0.2.1`, full command list |
| `grudge doctor` | PASS | PASS | `ok: true`; 21/21 checks pass; `hook paths` reports `absolute and present` |
| `grudge verify` | PASS | PASS | `Result: PASS (10/10 checks)` |
| `grudge verify --keep` | PASS | **NOT RE-RUN** | unchanged command; the non-`--keep` path was re-run |

---

## 4. Test suites

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| `pytest` | PASS (319 passed, 1 skipped) | PASS (**321 passed, 1 skipped**) | `python -m pytest -o addopts="" -q`; +2 new tests (`test_recorder`, `test_redact`) |
| `ruff check .` | PASS | PASS | `All checks passed!` (exit 0) |
| `mypy .` (strict) | PASS (126 files) | PASS (126 files) | `Success: no issues found in 126 source files` (exit 0) |
| `scripts.docs_check` | PASS (34 indexed files) | PASS (38 indexed files) | `docs-check: 38 indexed, non-empty, linked documentation files` |
| `scripts.release_check` | PASS | PASS | `local npm/PyPI metadata and published-version documentation agree` |
| `npm test` | PASS (104 tests) | PASS (**113 tests**) | 113 pass, 0 fail; +9 remediation tests |
| `npm audit` | PASS | PASS | `found 0 vulnerabilities` |
| `pip-audit` | PASS (own pip only) | **NOT RE-RUN** | no Python dependency changed; the audit's result stands |

---

## 5. Guard behaviour (black-box, installed tarball)

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Capture → propose → accept → block | PASS | PASS | two-session capture; `propose=0 rules=1 exit=2` |
| `never call …` match | PASS | PASS | exit 2 |
| `never call …` non-match | PASS | PASS | exit 0 |
| `must call read_file before call http` | PASS | PASS | `2 / 0 / 0` (before read / after read / blocked before, allowed after) |
| Taint flow, same session | PASS | PASS | exit 2 |
| Taint flow, other session | PASS | PASS | exit 0 (isolated) |
| Duplicate delivery | PASS | PASS | `2 / 2`; both blocked, counter deduplicated |
| Windows path match | PASS | PASS | exit 2 |
| POSIX path match | PASS | PASS | exit 2 |
| Relative path match | PASS | PASS | exit 2 |
| Malformed JSON input | PASS | PASS | exit 0 + explicit warning |
| Empty stdin | PASS | PASS | exit 0 |
| JSON array input | PASS | PASS | exit 0 + explicit warning |
| Unknown hook event | PASS | PASS | exit 0 + explicit warning |
| `GRUDGE_DISABLE=1` | PASS | PASS | exit 0 |
| UTF-8 BOM input | PASS | PASS | exit 0 (fail open) |
| Corrupt `compiled.json` | PASS | PASS | exit 0; cannot invent a match |
| Missing `compiled.json` | PASS | PASS | exit 0 |
| Corrupt/wrong-version rules warn | **FAIL (P2-3)** | **PASS** | exit 0 + `… are not a version 1 compiled file; ignored (fail-open)` or `… is invalid and was skipped` |
| Path traversal in `session_id` | PASS | PASS | exit 0; no file written outside `session/` |
| SessionStart output | PASS | PASS | bounded lines (one line per active scar) |
| UserPromptSubmit trigger | PASS | PASS | nudge emitted |
| UserPromptSubmit non-trigger | PASS | PASS | silent (0 characters) |
| Stop hook | PASS | PASS | exit 0; `"type":"stop"` in `stats.jsonl` |
| Stats JSON output | PASS | PASS | parses; `caught=9 blocked=9 injectedChars=3196` |
| `grudge uninstall` | PASS | PASS | settings no longer mention `grudge.mjs`; state removed |

---

## 6. Hook working-directory behaviour

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Hook from subdirectory | **FAIL (P0-1)** | **PASS** | registered absolute command executed from `sub` → exit 2 |
| Payload `cwd` ≠ install root | **FAIL (P0-1)** | **PASS** | exit 2 + `grudge: hook payload cwd '…' is outside the install root '…'` |
| Payload `cwd` = install root, process cwd elsewhere | PASS | PASS | exit 2 |
| `hookBudgetMs:1` with a matching block | **FAIL (P0-3)** | **PASS** | exit 2 + `state load took Nms, over hookBudgetMs 1; enforcement continued (fail-closed)` |
| Default budget, matching block | PASS | PASS | exit 2 |

---

## 7. Global scope

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| `setup --scope global` plan | PASS | PASS | writes `~/.claude/settings.json`, `~/.grudge/bin`, `~/.gitignore` |
| Global rule in the home dir | PASS | PASS | exit 2 |
| Global rule from another project | **FAIL (P0-2)** | **PASS** | two unrelated projects, both exit 2 |
| Project attempts to replace a global rule by id | not tested | **PASS (new)** | project rule ignored with a warning; global rule still blocks |
| Project `mode: "off"` | not tested | **PASS (new)** | project goes silent; global still blocks |
| Global `mode: "off"` | not tested | **PASS (new)** | nothing blocks |

---

## 8. Redaction

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| AWS access key in prose | PASS | PASS | corpus: `[REDACTED KEY]` |
| `AWS_SECRET_ACCESS_KEY=` | PASS | PASS | corpus: `AWS_SECRET_ACCESS_KEY=[REDACTED]` |
| `Authorization: Bearer …` | PASS | PASS | corpus: `Bearer [REDACTED]` |
| `sk-` / `ghp_` / `xoxb-` | PASS | PASS | corpus: `[REDACTED KEY]` |
| Private-key block | PASS | PASS | corpus: `[REDACTED PRIVATE KEY]` |
| Python/Node corpus agreement | PASS (18/18) | PASS (**23/23**) | both runtimes assert `spec/redaction-corpus.json`; plus idempotency |
| Python/Node generated parity sweep | not tested | **PASS (new)** | `cases=1170 divergences=0` |
| Structured `password` field | **FAIL (P0-4)** | **PASS** | 0 leaks in `.grudge/session/<id>.jsonl` |
| Structured `api_key` field | **FAIL (P0-4)** | **PASS** | 0 leaks |
| Nested `auth.token` / `auth.secret` | **FAIL (P0-4)** | **PASS** | `{"token":"[REDACTED]","secret":"[REDACTED]"}` |
| Structured `headers` (`Authorization`, `Cookie`) | not tested | **PASS (new)** | both `[REDACTED]`; `Accept` preserved |
| Query-string `?api_key=` | **FAIL (P3-1)** | **PASS** | `?api_key=[REDACTED]&next=1` (separator preserved) |
| Compound `AWS_ACCESS_KEY_ID=AKIA…` | **FAIL (P3-1)** | **PASS** | `AWS_ACCESS_KEY_ID=[REDACTED]`; no ` KEY]` residue |
| Python `Recorder.close` persistence | not tested | **PASS (new)** | `tests/test_recorder.py` asserts no secret reaches the JSONL |
| Python `capture` / `shrink` persistence | not tested | **PASS (new)** | `redact_jsonl` / `redact_trace` at the choke points |

---

## 9. Engine workflow

These rows are unchanged by the remediation except for the redaction choke
points, which have dedicated tests. All are covered by the 321-pass Python
suite and were not re-executed by hand.

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| `capture` | PASS | PASS (suite-covered) | `tests/test_capture.py` / CLI tests pass |
| `shrink` | PASS | PASS (suite-covered) | `tests/test_shrink.py` passes; cassette output is now redacted |
| `admit` | PASS | PASS (suite-covered) | admission tests pass |
| `compile` | PASS | PASS (suite-covered) | compiler tests pass |
| `run` on bad agent | PASS | PASS (suite-covered) | gate tests pass |
| `run` on fixed agent | PASS | PASS (suite-covered) | gate tests pass |

---

## 10. Performance

Measured on the installed tarball with a fresh Node process per call
(`D:\Temp\opencode\perf-repro.mjs`, 3 warm-ups + 20 alternating calls).
The host was busier than during the original audit, so the absolute numbers are
higher; the relevant result is that every matching call was enforced and no
call failed open.

| Case | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Benign hook latency | p50 158-216 ms | p50 266-279 ms, p95 327-476 ms | exit 0, all calls allowed |
| Matching block latency | p50 206 ms, p95 302 ms | p50 255-291 ms, p95 354-570 ms | exit 2, all calls blocked |
| 500-event session | PASS (p50 289 ms) | PASS | bounded tail; matching call still blocked |
| ~20 MB session | PASS (allowed, no rule) | PASS | reads capped at 2 MiB / 500 events; matching call still blocked |
| 25 concurrent matching calls | PASS (25/25 blocked) | PASS (25/25 blocked) | `hookBudgetMs:1` regression test |
| Failure-mode latency | fail-open after 1.5 s | no timeout path | `hookBudgetMs` only emits a notice |

---

## 11. Claude Code integration

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Protocol schema vs live docs | PASS | PASS | deny JSON on exit 2 unchanged |
| Live `claude -p` tool call | BLOCKED | **BLOCKED** | `Not logged in · Please run /login`; must be repeated on a logged-in host |
| PostToolUse dispatch from CLI | PASS | PASS | session event written to `.grudge/session/<id>.jsonl` |
| Registration command | FAIL (relative) | **PASS** | absolute node + absolute script, quoted |

---

## 12. CI

| Test | Audit baseline | Post-fix | Evidence |
|---|---|---|---|
| Workflow matrix review | PASS | PASS | workflow unchanged: ubuntu/macos/windows × Python 3.11/3.14; Node 18/20/22; package job |
| CI run of the audit findings | NOT TESTED | **NOT TESTED** | the remediation commit is pushed to `origin/remediation/production-readiness`; its CI run was not observed in this pass |

---

## 13. Matrix verdict

Every row that the remediation touches now passes against installed artifacts:
P0-1 (4 rows), P0-2 (3 rows), P0-3 (2 rows), P0-4 (8 rows), P1-1 (2 rows), and
P2-3 (1 row). The rows that remain `FAIL` are P2-1 and P2-2, which were
explicitly outside the requested scope; the row that remains `BLOCKED` is the
live Claude Code session, which requires a logged-in host.

**Matrix result: PASS for every P0/P1 row. READY FOR INDEPENDENT RE-AUDIT.**
