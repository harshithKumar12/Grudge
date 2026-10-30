# Production-readiness audit — 2026-10-30

**Purpose:** Evidence-based assessment of whether Grudge is production ready, with a remediation plan.
**Audience:** Repository owner and release engineer.
**Status:** original audit preserved below; the remediation record is appended as §13 (2026-10-30).
**Last updated (phase):** audit after Phase 25 / source version `0.2.0` — 2026-10-30

## 1. Executive verdict

**NOT READY.** The engine is in good shape: 308 Python tests pass, the documented
capture → shrink → admit → gate workflow reproduces the README numbers exactly,
the gate is deterministic, and the installer preserves and restores unrelated
user content. The Guard has defects that break the product's central promise:

- under a burst of concurrent hook calls, **10 of 25 matching calls were allowed**
  (fail-open on the hook budget while waiting on a global stats lock);
- a documented rule form, `must call <tool> where …`, is compiled **inverted** and
  blocks the call it is supposed to require;
- every hook invocation pays **~1.5 s** of avoidable latency because the budget
  timer is never released;
- the wheel is missing `scripts/e2e_guard.mjs`, so the documented
  `grudge-engine demo --guard` fails on a clean install;
- the Node recorder persists AWS keys and `Authorization: Bearer …` values.

Additionally, the two commits being released (`c0e63b2`, `481872e`) are **not
pushed**, so the last green CI run (`0d6227d`) does not cover the code that would
be published.

## 2. Baseline

| Item | Value |
|---|---|
| Branch / HEAD | `master` @ `481872e` ("chore: release 0.2.0") |
| Working tree | clean before and after the audit |
| Divergence | `master...origin/master [ahead 2]` |
| Source version | npm `0.2.0`, PyPI `0.2.0` (unpublished; registries still serve `0.1.9`) |
| Python | 3.14.0 (repo supports `>=3.11,<3.15`; 3.11 not installed on this host) |
| Node / npm | Node 25.2.1 / npm 11.21.1 (CI pins Node 20) |
| OS | Windows 11 26100 (Windows PowerShell 5.1; no `pwsh`) |
| Project instructions | `AGENTS.md`, `CLAUDE.md`, `TEST.md`, `docs/INDEX.md` read |

## 3. Checks actually executed

All commands were run from the repository root unless noted. `-o addopts=""` is
required for pytest to print its summary, because `pyproject.toml` already sets
`addopts = "-q"` and a second `-q` suppresses the summary line.

| # | Command | Exit | Evidence |
|---:|---|---:|---|
| 1 | `python -m pytest -o addopts="" -q` | 0 | 308 passed, 1 skipped (28.33 s) |
| 2 | `npm test --prefix packages/grudge` | 0 | `tests 88`, `pass 88`, `fail 0`, `skipped 0` (59.9 s) |
| 3 | `ruff check .` | 0 | All checks passed |
| 4 | `mypy .` | 0 | 125 source files, no issues |
| 5 | `python -m scripts.docs_check` | 0 | 33 indexed, non-empty, linked files |
| 6 | `python -m scripts.release_check` | 0 | npm/PyPI metadata and README agree |
| 7 | `python -m build --outdir %TEMP%\grudge-audit-dist` | 0 | `grudge_cli-0.2.0.tar.gz`, `-py3-none-any.whl` |
| 8 | `python -m twine check <dist>\*` | 0 | both artifacts PASSED |
| 9 | `npm pack --dry-run` (in `packages/grudge`) | 0 | `grudge-cli-0.2.0.tgz`, 48 files, 84.4 kB |
| 10 | `node packages/grudge/dist/grudge.mjs verify --json` | 0 | `ok: true`, 10 checks |
| 11 | `git -c core.whitespace=cr-at-eol diff --check` | 0 | no whitespace errors |

Artifact install simulation: wheel installed with `pip --no-deps` into a venv
(`grudge 0.2.0`), tarball installed with `npm install` into a scratch project
(`grudge 0.2.0`). Every Guard probe below ran through the **installed tarball
runtime**, not the source tree.

CI evidence (GitHub API, public repo): latest run `40882037578`, triggered by
`workflow_dispatch`, **6/6 jobs success** (ubuntu/macos/windows × Python
3.11/3.14). Its `head_sha` is `0d6227d` — two commits behind HEAD. All four
recorded runs are `workflow_dispatch`; no `push` run exists.

## 4. Engine workflow (clean wheel install, empty scratch directory)

| Step | Command | Exit | Result |
|---|---|---:|---|
| Demo | `grudge-engine demo --no-browser --fast --json` | 0 | vulnerable gate BLOCKED, fixed gate passed |
| Guard demo | `grudge-engine demo --guard --json` | **2** | **`MODULE_NOT_FOUND …site-packages\scripts\e2e_guard.mjs`** |
| Capture | `grudge-engine capture examples.leaky_agent.agent --out failure.jsonl --json` | 0 | 71 steps, `run_id: leaky-agent-run` |
| Shrink | `grudge-engine shrink failure.jsonl --failure 'never flow read_file to send_http field body' --agent examples.leaky_agent.agent --out cassette.json --json` | 0 | entries 23 → 23, bytes 11 854 → 2 081, 1 254 oracle calls |
| Admit | `grudge-engine admit cassette.json --bad examples.leaky_agent.agent --good examples.leaky_agent.agent_fixed --out admitted --json` | 0 | 3 bad violations, 3 good + 2 controls clean |
| Gate (bad) | `grudge-engine run --scars admitted --agent examples.leaky_agent.agent --json` | **1** | 0/20 runs, "Value flow from read_file to send_http was detected" |
| Gate (good) | `grudge-engine run --scars admitted --agent examples.leaky_agent.agent_fixed --json` | 0 | 20/20 runs, pass rate 1.0 |
| Determinism | same bad command twice, `Compare-Object` | 1, 1 | **byte-identical output** |
| Guard demo (checkout) | `python -m grudge demo --guard --json` | 0 | session 1 leaked+proposed, session 2 blocked |

Conclusions: capture/record, shrink, admission with controls, gate threshold, and
offline determinism all behave as documented, and the README benchmark is
reproducible on this host. The single engine failure is packaging, not logic.

## 5. Guard probes (installed tarball runtime)

Setup: `node … setup --yes --agents claude-code --scope repo` → exit 0, 5 files.
Rule armed through the documented path (`PostToolUse` capture → `propose` →
`accept`) and enforced with real `PreToolUse` payloads on stdin.

| Probe | Expected | Actual | Verdict |
|---|---:|---:|---|
| Block on matching `Bash` call | 2 | 2 | pass |
| Benign call | 0 | 0 | pass |
| Retry with new `tool_use_id` | 2 | 2 | pass |
| Retry with **no** `tool_use_id` (first) | 2 | 2 | pass |
| Retry with **no** `tool_use_id` (second, identical) | 2 | **0** | **defect P2-1** |
| Byte-identical replay (same `tool_use_id`) | 0 | 0 | dedupe by design, undocumented |
| Malformed JSON / empty stdin | 0 | 0 | pass (fail open) |
| Oversized input (> 1 MiB) | 0 | 0 | pass (documented) |
| `GRUDGE_DISABLE=1` | 0 | 0 | pass |
| `config.mode = "off"` | 0 | 0 | pass |
| Corrupt `compiled.json` | 0 | 0 | pass (fail open) |
| Missing `compiled.json` | 0 | 0 | pass (fail open) |
| `PowerShell` tool name maps to `shell` | 2 | 2 | pass |
| `mcp__srv__tool` passthrough | 0 | 0 | pass |
| `session_id: "../../../Windows/win.ini"` | no crash | 2 (rule matched) | no crash; see P2-2 |
| `$under "C:/AUDIT"` with `C:/AUDIT/x` | 2 | 2 | pass |
| `$under "C:/AUDIT"` with `c:/audit/x` | 2 | **0** | **defect P1-5** |
| `$under "C:/AUDIT"` with `C:\AUDIT\x` | 2 | 2 | pass |
| sibling prefix `C:/AUDIT2/x` | 0 | 0 | pass |
| `must call shell where command ~ …` on a call that matches | 0 | **2** | **defect P1-1** |

Concurrency (25 simultaneous unique `PreToolUse` payloads, all matching):
`codes {"0": 10, "2": 15}` — **10 calls allowed**, each with
`grudge: hook time budget exceeded; allowed (fail-open)` on stderr. No log
corruption, no duplicate `seq`. The same test with 10 calls gave 10/10 denies.

Latency (benign call, three runs): **1794 ms, 1714 ms, 1737 ms**.
`grudge --version` on the same machine: 144/150/153 ms. The difference is the
1 500 ms `hookBudgetMs` timer, which keeps the process alive after the handler
returns (P1-2).

Secrets persisted by `PostToolUse` (`redact.mjs` probe, installed runtime):

| Value | Stored as |
|---|---|
| `ghp_…`, `sk-live-…`, `PASSWORD=…`, PEM private key | redacted |
| `AKIAIOSFODNN7EXAMPLE` | **stored verbatim** (P1-4) |
| `Authorization: Bearer abcdef1234567890xyz` | **stored verbatim** (P1-4) |
| `plainsecretvalue` | stored (documented limitation) |

## 6. Installer, backups, and uninstall

Scratch project containing user `CLAUDE.md` prose, `.claude/settings.json`
(user hooks on `PreToolUse`/`Stop`, `permissions`, `env`, custom `statusLine`),
and a `.gitignore`:

| Check | Result |
|---|---|
| `setup` preserves `permissions`, `env`, user hooks, existing `statusLine` | pass |
| one Grudge hook per event, one managed block | pass |
| second `setup` is idempotent (no duplicates) | pass |
| `CLAUDE.md` prose and `.gitignore` lines preserved | pass |
| `doctor` human output says enforcement is unproven and points at `grudge verify` | pass |
| `doctor --json` carries that statement | **no** (P2-3) |
| `uninstall` restores `settings.json`, `CLAUDE.md`, `.gitignore` byte-for-byte | pass |
| `uninstall` removes `.grudge` | pass |
| invalid `settings.json` → setup exits 1, file untouched, no `.grudge` left | pass |

## 7. Findings

### P0-1 — Concurrent hooks silently allow matching calls

- **Where:** `packages/grudge/src/hooks/pre-tool-use.js:71-73`,
  `packages/grudge/src/core/stats.js:28-44,61-78`.
- **Repro:** arm a `block` rule, then fire 25 matching `PreToolUse` payloads
  simultaneously (unique `session_id`/`tool_use_id`), e.g.
  `Promise.all(Array.from({length:25}, spawn(…)))`.
- **Evidence:** `codes: {0: 10, 2: 15}`; every allowed call wrote
  `grudge: hook time budget exceeded; allowed (fail-open)`.
- **Impact:** enforcement degrades in proportion to concurrency. Parallel
  subagents, a fast tool loop, or two hook registrations can let the prohibited
  call through, even though a single call is blocked.
- **Root cause:** `evaluate()` takes a process-wide directory lock
  (`.grudge/stats.jsonl.lock`) via `claimHookEvent → appendEvent`, and
  `appendEvent` re-reads the **entire** log while holding it. With N hooks the
  lock is held N× longer, so the 1 500 ms `Promise.race` wins before the rule
  check completes, and its result is "allow".
- **Fix direction:** decide the rule first and record accounting afterwards
  (best effort, no lock on the enforcement path); replace `readEvents` in the
  claim path with an append-only key check or an in-memory-free atomic create;
  make the budget fail *closed* for a matched rule; `unref()` the timer.
- **Regression test:** 25 concurrent matching payloads must produce 25 × exit 2
  and 25 blocked events; assert no "time budget exceeded" on stderr.
- **Acceptance:** 0 fail-open results at 25-way concurrency on Windows and
  ubuntu CI, and the enforcement path performs no full-log read.

### P0-2 — The release commit has never run in CI

- **Where:** `master` ahead of `origin/master` by 2 (`c0e63b2`, `481872e`).
- **Evidence:** last green run `40882037578` is `head_sha 0d6227d`; the four
  recorded runs are all `workflow_dispatch`, none for the current HEAD.
- **Impact:** the artifacts about to be published were never built, tested, or
  type-checked on ubuntu-latest/macos-latest/windows-latest with Python 3.11.
- **Fix direction:** push both commits and dispatch
  `grudge-guard.yml` against HEAD; block publishing on a green run of that SHA.
- **Regression test:** release checklist step that compares
  `git rev-parse HEAD` with the `head_sha` of the latest successful run.
- **Acceptance:** a green 6/6 run whose `head_sha` equals the released commit.

### P1-1 — `must call <tool> where …` is enforced backwards

- **Where:** `packages/grudge/src/commands/scars.js:55-68`
  (`compiledRule` drops `polarity`), `grudge/guard/compile.py:141-185`
  (`_flatten` drops it as well), consumed by
  `packages/grudge/src/dsl/check.js:77`, which honours `polarity === "must"`.
- **Doc claim:** `docs/predicate-dsl.md:65` documents `must call verify_user`.
- **Repro:**
  ```powershell
  <PostToolUse capture of "npm test" into session must-sess>
  node .grudge/bin/grudge.mjs propose --rule 'must call shell where command ~ npm' --why "audit" --preventive --accept
  <PreToolUse payload: Bash "npm test">
  ```
- **Evidence:** compiled rule has `"kind":"call_shape"` and no `polarity`; the
  hook answers with
  `permissionDecisionReason: "Must call shell with the specified arguments. …"` and
  **exit 2**, blocking exactly the required call.
- **Impact:** a documented rule form blocks the behaviour it mandates; users who
  write it get the opposite of what they asked for.
- **Root cause:** neither compiler writes `polarity`, so the evaluator's `must`
  branch is unreachable from any compiled artifact. Shared conformance fixtures
  contain no polarity case, so both implementations agree while being wrong.
- **Fix direction:** emit `polarity` in both compilers (or refuse
  `must call <tool> where` in `propose` and `admit` until it is supported), and
  document which forms the Node runtime enforces.
- **Regression test:** a `must call` scar compiled by Python **and** by Node must
  (a) block a non-matching call, (b) allow the matching call; plus conformance
  fixtures with `polarity: "must"`.
- **Acceptance:** the repro above allows `npm test` and denies a different call,
  in both compilers.

### P1-2 — Every hook invocation costs ~1.5 s of dead time

- **Where:** `packages/grudge/src/hooks/pre-tool-use.js:72`.
- **Evidence:** benign hook 1 714–1 794 ms; `--version` 144–153 ms; 25-way burst
  reached 3 444 ms; `docs/hooks.md:88-90` claims p50 1.80 ms in-process.
- **Impact:** every tool call in Claude Code is delayed by the full budget; the
  documented timing is off by roughly three orders of magnitude at process
  level; this is also what makes P0-1 reachable.
- **Root cause:** the `setTimeout` used for the budget race is never cleared or
  `unref()`ed, so Node keeps the event loop alive until it fires.
- **Fix direction:** `timer.unref()` (and `clearTimeout` on the winning path).
- **Regression test:** spawn the hook as a child process on a benign payload and
  assert wall time < 1 000 ms.
- **Acceptance:** process-level p95 < 300 ms on CI for all three OSes.

### P1-3 — `grudge-engine demo --guard` is broken in the published wheel

- **Where:** `grudge/cli/demo.py:48` resolves
  `<package>.parents[2]/scripts/e2e_guard.mjs`; the wheel has no `scripts/`.
- **Evidence:** clean-wheel run exits 2 with
  `Cannot find module …site-packages\scripts\e2e_guard.mjs`; the same command
  exits 0 in the source checkout.
- **Doc claim:** `README.md:301` and the CLI reference list
  `grudge-engine demo --guard`.
- **Fix direction:** ship the script as package data (or move the demo into the
  package), and fail with a readable message rather than a Node stack trace.
- **Regression test:** build the wheel, install it in a clean venv, run
  `demo --guard --json`, assert exit 0 (extend `tests/test_packaging.py`, which
  already checks other shipped data).
- **Acceptance:** the command passes from an installed wheel on CI.

### P1-4 — Node redaction misses AWS keys and `Authorization: Bearer` values

- **Where:** `packages/grudge/src/core/redact.js:8-12`. The Python rules in
  `grudge/recorder/redact.py:28-40` include `(?:AKIA|ASIA)[A-Z0-9]{16}`; the Node
  set does not, and neither implementation matches `Authorization: Bearer <token>`
  because the labelled-value rule forbids spaces in the value.
- **Evidence:** stored session event contains `AKIAIOSFODNN7EXAMPLE` and
  `Authorization: Bearer abcdef1234567890xyz` verbatim.
- **Impact:** credentials are written to `.grudge/session/*.jsonl` on the machine;
  the file is gitignored, but the trust model promises these classes are masked.
- **Fix direction:** port the Python provider-key rules to Node, add
  `Bearer\s+\S+` handling, and add a parity test that runs the same corpus
  through both redactors.
- **Regression test:** one shared corpus file; both implementations must mask
  every entry.
- **Acceptance:** no AKIA/ASIA/`Bearer` value survives `PostToolUse` in either
  runtime.

### P1-5 — Path rules are bypassable by letter case on Windows

- **Where:** `packages/grudge/src/dsl/check.js:3-7` (`under` lower-cases nothing)
  and the mirror in `grudge/guard/compile.py:52-57`.
- **Repro:** block rule `path under "C:/AUDIT"`; `PreToolUse` with
  `{"path":"c:/audit/x.txt"}`.
- **Evidence:** `C:/AUDIT/x.txt` → exit 2, `C:\AUDIT\x.txt` → exit 2,
  `c:/audit/x.txt` → **exit 0**.
- **Impact:** on the documented Windows platform the same file is both blocked and
  allowed depending on spelling; an agent that normalizes case escapes the rule.
- **Fix direction:** compare with `path.win32`-aware normalization (lower-case
  drive and segments when `process.platform === "win32"`), or resolve both sides
  through a canonicalizer. Keep Linux/macOS case-sensitive.
- **Regression test:** table-driven test with mixed case, mixed separators, `..`,
  sibling-prefix, and UNC paths on win32 and posix expectations.
- **Acceptance:** the case-variant payload blocks on Windows and remains allowed
  on Linux for a genuinely different path.

### P2-1 — Identical repeated payloads are allowed (undocumented dedupe)

- **Where:** `packages/grudge/src/core/stats.js:72-78`; used at
  `pre-tool-use.js:41`.
- **Evidence:** two identical `PreToolUse` payloads with the same `session_id`
  and no `tool_use_id` → 2 then 0; a byte-identical replay of an already-denied
  payload → 0. A retry carrying a new `tool_use_id` still blocks (verified), and
  Claude Code does send `tool_use_id`, which limits exposure.
- **Impact:** hosts or payload shapes without a per-call identifier lose
  enforcement on the second delivery; nothing documents this.
- **Fix direction:** dedupe on an explicit host call id only (fall back to
  "never dedupe" for enforcement), or move dedupe to accounting only.
- **Acceptance:** dedupe can never change a deny into an allow; a test asserts
  repeated identical payloads are both blocked when no call id is present.

### P2-2 — `session.read()` accepts unvalidated ids

- **Where:** `packages/grudge/src/core/session.js:25-43` (no validation) versus
  `append()` at `:16-18` (validates).
- **Impact:** `pre-tool-use` reads `.grudge/session/<session_id>.jsonl`; a payload
  with `../` reads an arbitrary `.jsonl` file into rule evaluation. Local-only, no
  exfiltration, but it can inject fake prior events and cause spurious denies.
- **Fix:** reuse the `append` validation (or a shared `safeSessionId`).
- **Acceptance:** traversal ids are rejected/ignored and the hook still exits 0.

### P2-3 — `doctor --json` omits the enforcement statement

- **Where:** the sentence lives in `packages/grudge/src/output.js:60` and
  `commands/doctor.js:139` (human path only).
- **Evidence:** `doctor` prints `Enforcement: not proven by file checks. Run
  grudge verify …`; `doctor --json` does not contain "verify".
- **Impact:** scripted/agent consumers of the JSON cannot see that file checks do
  not prove blocking.
- **Fix:** add a stable field (for example `enforcement: {proven:false,
  next:"grudge verify"}`) to the doctor result object.

### P2-4 — Exact-version dependency pins conflict with common tooling

- **Where:** `pyproject.toml` `dependencies` pins `rich==13.9.4`,
  `httpx==0.28.1`, `typer==0.15.1`, `click==8.1.8`, `pydantic==2.12.5`;
  `requirements.lock` pins `pytest==8.3.4`.
- **Evidence:** `python -m pip check` →
  `twine 7.0.0 has requirement rich>=14.3.3, but you have rich 13.9.4` and
  `pytest-asyncio 1.4.0 has requirement pytest<10,>=8.4, but you have pytest 8.3.4`.
- **Impact:** users installing `grudge-cli` alongside other tools get resolver
  failures or forced downgrades.
- **Fix:** use compatible-release bounds in runtime dependencies; keep exact pins
  only in `requirements.lock`.

### P2-5 — Documented hook timing does not describe the shipped process

- **Where:** `docs/hooks.md:83-94` reports p50 1.80 ms / p95 4.86 ms for the
  in-process handler and explicitly excludes process startup — but it does not
  disclose the 1 500 ms timer (P1-2), so a reader reasonably assumes per-call
  cost near that figure.
- **Fix:** after fixing P1-2, publish process-level p50/p95 for a real hook spawn.

### P2-6 — Misleading control-check message for `must` rules

- **Evidence:** proposing a `must call …` rule while any other session exists
  returns `over-broad rule: fires on control session sess-arm at event undefined`
  (`propose.js:92-95` indexes `atEvents[0]` of an empty list).
- **Impact:** the message is unactionable and hides the inverted-semantics bug.
- **Fix:** handle the `must` case explicitly, or reject the form with a clear
  message until P1-1 lands.

### P2-7 — PowerShell quote stripping silently broadens rules

- **Evidence:** `--rule 'must call shell where command ~ "npm test"'` reached the
  CLI as `… ~ npm`; the rule compiled to `$contains: "npm"` with no warning.
- **Impact:** a rule can silently match far more than intended on the primary
  Windows shell. `--rule-stdin` exists and is documented, but nothing detects the
  loss.
- **Fix:** detect an unbalanced `"` in `--rule` and refuse with a hint to use
  `--rule-stdin`; add the same hint to `propose --help`.

### P3 findings

- **P3-1** Redaction ordering leaves a stray bracket: `PASSWORD=hunter2password`
  is stored as `PASSWORD: [REDACTED]]` (Node) and ` =[REDACTED]` (Python) —
  cosmetic, but it shows `ENV_VALUE` and `LABELED_VALUE` fighting over the same
  text.
- **P3-2** The legacy `.grudge/stats.json` increment in `pre-tool-use.js:19-31` is
  an unlocked read-modify-write; the JSONL log is authoritative, so this only
  skews the legacy counters.
- **P3-3** `uninstall` removes `.grudge` wholesale (`commands/uninstall.js:29`);
  any user file placed there is lost without a prompt.
- **P3-4** The release doc's `npm pack|publish --prefix packages/grudge` runs from
  the repo root and fails with `ENOENT … Grudge\package.json`; npm reads
  `package.json` from the current directory for these two commands. Use
  `Push-Location packages/grudge`.
- **P3-5** No live Claude Code session was exercised in this audit (known issue
  3). `grudge verify` proves the hook contract, not the interactive host.
- **P3-6** `doctor` reports this machine's `~/.claude/settings.json` pointing at a
  missing status-line helper; it is preserved and reported, not repaired (by
  design).

## 8. Missing coverage (tests that would have caught the findings)

| Area | Gap | Would catch |
|---|---|---|
| Concurrency | no parallel hook test | P0-1 |
| Process latency | timings measured in-process only | P1-2 |
| Installed artifact | `test_packaging.py` checks scar/example data, not `scripts/` | P1-3 |
| Redaction parity | per-language unit tests, no shared corpus | P1-4 |
| Path matching | no win32 case-variant fixture | P1-5 |
| Dedupe | dedupe tested for accounting, not for enforcement | P2-1 |
| Session ids | `append` validated in tests, `read` not | P2-2 |
| Polarity | 27 conformance fixtures, none with `polarity` | P1-1 |

## 9. Design risks accepted (not defects)

- **Fail-open everywhere** is documented and deliberate; it is only a problem
  where it can be triggered silently (P0-1).
- **`payload.cwd` is authoritative** — the hook trusts the host's working
  directory for config, session, and stats. Local-only; correct for the contract.
- **Taint is substring-based** and can be evaded by encoding; documented.
- **The replay sandbox monkey-patches builtins/sockets in-process** — a replay
  agent that spawns a thread or process bypasses the guards; acceptable for the
  shipped demo agents, worth stating in the docs.
- **Advisory agents do not block** — documented and repeated in the README.
- **No network at runtime** — confirmed by inspection (`httpx` only behind
  `GRUDGE_LLM_URL`/`GRUDGE_LLM_API_KEY`, offline by default) and by running the
  full engine workflow with no network access needed.

## 10. Prioritised remediation backlog

1. **P0-1 concurrency fail-open** (blocks everything else: the guard must block
   under load). Depends on: nothing.
2. **P1-2 timer unref** — one line, and it removes most of the lock-contention
   pressure behind P0-1. Do it with 1.
3. **P1-1 must-rule inversion** — compiler + conformance fixtures; also fixes
   P2-6's misleading message.
4. **P1-4 redaction parity** — shared corpus; independent.
5. **P1-5 Windows path casing** — independent.
6. **P1-3 wheel `demo --guard`** — packaging; independent.
7. **P0-2 push + CI dispatch** — must be green before any publish; run after 1-6.
8. **P2-1 dedupe**, **P2-2 session id**, **P2-3 doctor JSON**, **P2-4 pins**,
   **P2-5/P2-7 docs** — same milestone, lower risk.
9. **P3 items** — cleanup.

## 11. Release checklist after the fixes

```powershell
Set-Location C:\path\to\Grudge
function Assert-Ok([string]$s) { if ($LASTEXITCODE -ne 0) { throw "FAILED: $s" } }

python -m pytest -o addopts="" -q;  Assert-Ok 'pytest'      # expect 0 failed
npm test --prefix packages/grudge;  Assert-Ok 'node tests'
ruff check .;                        Assert-Ok 'ruff'
mypy .;                              Assert-Ok 'mypy'
python -m scripts.docs_check;        Assert-Ok 'docs'
python -m scripts.release_check;     Assert-Ok 'release metadata'
node packages/grudge/dist/grudge.mjs verify; Assert-Ok 'verify'   # PASS (10/10)

# new regression checks that must exist after remediation
node packages/grudge/test/phase26-concurrency.test.js   # 25/25 blocked, no fail-open
node packages/grudge/test/phase26-latency.test.js       # spawned hook < 1000 ms
python -m pytest tests/test_redaction_parity.py -q      # shared corpus, both runtimes
python -m pytest tests/test_packaging.py -q             # wheel contains scripts/

# artifact checks
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
python -m build --outdir dist;       Assert-Ok 'build'
python -m twine check dist/*;        Assert-Ok 'twine'
Push-Location packages/grudge; npm pack --dry-run; Pop-Location
```

Then, and only then: push, dispatch `grudge-guard.yml`, confirm 6/6 jobs green on
that SHA, publish with `npm publish` **from `packages/grudge`** and
`python -m twine upload dist/*`, then run `npx grudge-cli@latest verify` in a
scratch folder.

## 12. Not verified in this audit

- macOS and Linux execution (CI covers them at `0d6227d`; not at HEAD).
- Python 3.11 locally (only 3.14 installed; CI covers 3.11 at `0d6227d`).
- Node 18/20 locally (host runs 25.2.1; CI pins Node 20).
- A live Claude Code session (human step; `scripts/live-check.md`).
- Registry-side artifact behaviour for `0.2.0` (unpublished; simulated here from
  the local wheel and tarball).
- `npm audit` / `pip-audit` advisory data (not run; no runtime dependencies in
  the Node package, Python runtime deps are pinned).

## 13. Remediation record — 2026-10-30

Everything below was done on `remediation/production-readiness` (based on
`481872e`). Nothing was committed, pushed, tagged, or published; the working
tree is the deliverable. The original findings and evidence above are unchanged
so the two records can be compared.

### 13.1 Finding → fix → regression test

| Finding | Root cause | Fix | Regression test |
|---|---|---|---|
| **P0-1** concurrent calls allowed | The handler wrote stats/session state *before* deciding, under a global `stats` lock. A slow or stale lock hit the 1,500 ms budget, which returned "allow" even though a rule matched. | Decision first, bookkeeping second. `appendEvent` is a lock-free `O_APPEND` write; `seq` is derived from the line number by readers; the dedupe scan is bounded to a tail window; accounting is capped at 1 s and its failure can never change the exit code. | `packages/grudge/test/concurrency-enforcement.test.js`: 25 real processes across 25 sessions and a duplicate-delivery case all blocked; a killed lock holder does not block a later call. |
| **P1-2** ~1.5 s per hook | `setTimeout` for the budget was referenced until it fired on the winning path, so every process waited out the full budget. | The timer is `unref()`ed **and** cleared when the decision settles; `decide()` is not raced against it. | Same file asserts a spawned hook finishes in < 1,000 ms (measured p50 164 ms). |
| **P1-1** `must call` inverted | The first pass added `polarity` to the schema and the Node compiler but left `grudge/guard/compile.py::_polarity` returning `never` for a bare `CallShape` — which is exactly what `must call <tool> where …` parses to — so Python-compiled `must` rules blocked the required call. | `_polarity` returns `must` for `CallShape` and `Ordering`, and `never` for `PredicateSet(kind="not")` and taint flows; `evaluate_rule` inverts only `must`: violation = no matching event, matching call allowed, `atEvents` empty. | `tests/test_guard_compile.py`: Python polarity for a bare call, a negated call, ordering, and both taint forms, plus `evaluate_rule`; and an end-to-end test that compiles an admitted `must call shell where command ~ "npm test"` Scar with **Python**, loads the result into the real Node guard, and asserts `npm test` → exit 0 and `ls -la` → exit 2. Node side: `call-must-{satisfied,missing,other-call}.json`, `call-never-explicit-polarity.json`, and the hook test in `remediation-regressions.test.js`. |
| **P1-3** wheel demo broken | The demo script lived in `scripts/`, which the wheel does not include, and the path was repository-relative. | Script + 4 payloads moved to `grudge/demo/e2e_guard.mjs` and `grudge/demo/payloads/leak-session/`, declared in `[tool.setuptools.package-data]`, resolved package-relatively, with runtime lookup `--node-runtime` → `GRUDGE_NODE_RUNTIME` → checkout → `node_modules`. | `tests/test_packaging.py` (wheel contents) and `tests/test_e2e_guard.mjs`; plus the clean-install run in 13.3. |
| **P1-4 / P3-1** redaction drift | Node and Python had independently written rule lists with different ordering and coverage (Node missed AWS/Bearer, Python missed prefixed keys). | One ordered rule list implemented twice, covering private-key blocks, Bearer, AWS `AKIA`/`ASIA`, `sk-`/`pk-`/`rk-`, GitHub, Slack, labelled values, `UPPER_CASE=` env values, and `FAKE_KEY_`; the labelled-value pattern is character-for-character equivalent in both runtimes (see §13.10). | `spec/redaction-corpus.json` (18 cases incl. pass-through prose, quoted values, trailing punctuation, and query separators) asserted by `tests/test_shared_corpora.py` and `remediation-regressions.test.js`. |
| **P1-5** Windows path casing | Python compared raw strings; Node canonicalized drive letter and separators. | Python gained `_canonical_path`/`_under`/`_DRIVE_RE` mirroring Node's `canonicalPath`/`under`. | `path-case-windows.json`, `path-case-posix.json`, `path-dotdot-escape.json`, `path-sibling-prefix.json`, `path-normalized-remain.json` shared fixtures. |
| **P2-1** duplicate deliveries allowed | Dedupe was enforced by aborting *before* rule evaluation, and the counter was not specific to the claim. | Dedupe no longer gates the decision; catch events carry `<dedupeKey>:catch`, and duplicate counters collapse at read time. | Same concurrency file: 10/10 same-session deliveries blocked. |
| **P2-2** hostile session ids | `session.read()` joined the raw id into a path. | Shared `validId()` validates the id; invalid ids read as `[]`. | `remediation-regressions.test.js` ("hostile session id"). |
| **P2-3** doctor implied enforcement | JSON had file checks only, no statement about blocking. | `doctor --json` adds `enforcement: {proven: false, command: "grudge verify", detail: …}`. | `installer.test.js` ("doctor JSON states that enforcement is not proven"). |
| **P2-4** pin conflicts | `rich==13.9.4` and `pytest==8.3.4` were too old for `twine` and `pytest-asyncio` in a shared env. | `rich>=13.9.4,<15`, dev `pytest>=9.0.3,<10`; lock regenerated with uv (rich 14.3.4, pytest 9.2.0) and re-install-verified. | Full suite runs from the lock (§13.3). |
| **P2-5 / P3-4** docs | Timing text described in-process only; `npm pack --prefix` does not work. | `docs/hooks.md` gained a before/after end-to-end table and the failure policy; README uses `(cd packages/grudge && npm pack)`. | `docs_check`; the corrected command was executed. |
| **P2-6** misleading `must` message | The control text was written for `never` rules. | `propose.js` emits the requirement form for `must` rules. | `phase18-propose.test.js`. |
| **P2-7** quote stripping | `propose --rule '… ~ "$var"'` let PowerShell drop the quote and broaden the rule. | Tokenizer-based check rejects an unquoted value after `~`/`under` and points at `--rule-stdin`; unbalanced double quotes are rejected. | `phase18-propose.test.js`. |
| **P3-3** uninstall deleted user files in `.grudge` | The whole directory was removed when Grudge thought it owned it. | Only managed names are deleted; anything else is preserved and reported (`preserved`). | Two `installer.test.js` cases. |
| **P0-2** release commit never ran in CI | Local-only problem: the commits were not pushed. | Not fixable from the working tree. `.github/workflows/grudge-guard.yml` gained Node 18/20/22 and clean-artifact jobs so the first run proves more. | **Still open — see 13.7.** |

### 13.2 Enforcement failure policy (now documented and enforced)

The budget covers **state loading only**; rule evaluation is pure CPU over
loaded data and is never raced; accounting runs after the verdict and is
bounded. Therefore:

| Situation | Result |
|---|---|
| Rule matches a prohibited call | Deny, exit 2, before accounting starts |
| State load exceeds `hookBudgetMs` | Allow + explicit stderr warning |
| `compiled.json` missing/corrupt | Allow with no rules |
| Malformed/oversized input | Allow + explicit stderr warning |
| Accounting failure | Decision unchanged |
| Duplicate delivery | Still denied; only the counter deduplicates |

This is not blanket fail-closed: every allow case is an infrastructure or input
failure where nothing proves the call is prohibited.

### 13.3 Commands executed (exit codes)

Environment for the Python rows: Windows 11, Python 3.14.0, fresh venv from
`requirements.lock` with `pip install --no-deps -e .`. Node rows: Windows 11,
Node 25.2.1.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `python -m pip install -r requirements.lock` | 0 | all pins installed, incl. `pytest 9.2.0`, `rich 14.3.4` |
| 2 | `python -m pytest -o addopts="" -q` | 0 | **314 passed, 1 skipped** (28.24 s); **319 passed** after the second pass (§13.10) |
| 3 | `npm test` (in `packages/grudge`) | 0 | **104 tests, 104 pass, 0 fail, 0 skipped** |
| 4 | `node packages/grudge/dist/grudge.mjs verify` | 0 | `Result: PASS (10/10 checks)` |
| 5 | `ruff check .` | 0 | All checks passed |
| 6 | `mypy .` | 0 | no issues in 126 source files |
| 7 | `python -m scripts.docs_check` | 0 | 34 indexed docs |
| 8 | `python -m scripts.release_check` | 0 | metadata agrees |
| 9 | `git diff --check` | 0 | no whitespace errors (CRLF warnings only) |
| 10 | `python -m build --outdir %TEMP%\rel-dist` | 0 | wheel + sdist |
| 11 | `python -m twine check %TEMP%\rel-dist\*` | 0 | both `PASSED` |
| 12 | `npm pack` (in `packages/grudge`) | 0 | 48 files, `grudge-cli-0.2.0.tgz` |
| 13 | `npm pack --dry-run` | 0 | same file list |
| 14 | wheel install into fresh venv | 0 | `grudge/demo/e2e_guard.mjs` present |
| 15 | `npm install <tarball>` in empty dir | 0 | `node_modules/grudge-cli/dist/grudge.mjs` present |
| 16 | `grudge-engine demo --guard --json` (outside the checkout, `GRUDGE_NODE_RUNTIME` → installed tarball) | 0 | `ok: true`, `session1: "leaked and proposed"`, `session2: "blocked"` |
| 17 | `pip-audit -r requirements.lock` | 0 | **No known vulnerabilities found** (was 7 in 2 packages) |
| 18 | `npm audit` (all deps) | 0 | 0 vulnerabilities |
| 19 | `npm audit --omit=dev` | 0 | 0 vulnerabilities |

### 13.4 Before/after measurements

Hook cost is measured by spawning the real runtime once per call (Windows 11,
Node 25.2.1, 15 sequential calls per case). Baseline is `481872e` built in a
worktree, fixed build is this tree.

| Case | Before p50 / p95 | After p50 / p95 |
|---|---|---|
| No rules | 1,778 ms / 2,460 ms | 164 ms / 218 ms |
| Matching block rule (`exit 2`) | 1,790 ms / 2,153 ms | 157 ms / 299 ms |
| Non-matching call (`exit 0`) | 1,720 ms / 1,820 ms | 187 ms / 248 ms |

Concurrency, 25 simultaneously spawned hook processes with a matching rule:

| Case | Before | After |
|---|---|---|
| 25 distinct sessions | 23/25 blocked (2 allowed) | **25/25 blocked** |
| 10 duplicate deliveries, one session | 1/10 blocked | **10/10 blocked** |

### 13.5 Dependency and security audit

- `pip-audit` initially reported 7 advisories in 2 packages from the lock:
  `setuptools 75.8.0` (PYSEC-2025-49, PYSEC-2026-3447, GHSA-xmj3-9gf7-h52w) and
  `pytest 8.4.2` (PYSEC-2026-1845). Both are development/build-time only. The
  lock now pins `setuptools 84.2.1` and `pytest 9.2.0`; the suite was run on
  `pytest 9.2.0` before the pin changed and again from the regenerated lock
  (314 passed; 319 after the second pass, §13.10). Re-audit: clean.
- `npm audit` reports 0 vulnerabilities; the runtime bundle has no runtime npm
  dependencies, so the published tarball carries no third-party code.
- No dependency version was loosened without a test run; `pytest<10` is the only
  broadened range and is bounded by `pytest-asyncio`'s own `<10` requirement.

### 13.6 Packaging and install verification

The wheel built from this tree contains `grudge/demo/e2e_guard.mjs` and the four
`payloads/leak-session/*.json` files. Installed into a fresh venv, with the npm
tarball installed into an unrelated empty directory, `demo --guard` resolved the
runtime from the installed tarball and passed. This is the exact failure P1-3
described, now proven fixed outside the checkout.

### 13.7 Remaining risks and what is NOT VERIFIED

| Item | Status | Why / what would verify it |
|---|---|---|
| **P0-2** release commit in CI | **NOT VERIFIED — open** | `c0e63b2`/`481872e` are still unpushed; nothing here can run GitHub Actions. Push, dispatch `grudge-guard.yml`, and require green on the resulting SHA before publishing. |
| New CI jobs (Node 18/20/22, clean artifacts) | **NOT VERIFIED** | Added on a Windows-only machine; the commands inside them pass locally, but runner configuration (Ubuntu paths, npm cache, heredoc) is untested. The first dispatch is their first execution. |
| macOS / Linux | **NOT VERIFIED** | No local access. CI covers them only after the push. |
| Python 3.11 | **NOT VERIFIED locally** | Only 3.14 installed; the lock is universal and CI pins 3.11. |
| Node 18/20/22 | **NOT VERIFIED locally** | Host runs 25.2.1; the concurrency suite uses only stable `node:test`/`spawn` APIs, but only 25.2.1 executed it. |
| Live Claude Code session | **NOT VERIFIED** | Human step; `scripts/live-check.md`. |
| Registry behaviour for 0.2.0 | **NOT VERIFIED** | Unpublished. `npm view grudge-cli version` still reports 0.1.9. |
| Redaction completeness | Accepted risk | Rule-based and conservative; the shared corpus pins parity, not total secret detection. |
| Fail-open on input/state failure | Accepted design | Documented in §13.2 and `docs/hooks.md`; `grudge verify` is the stronger proof. |
| `npm` package name `grudge` | Accepted risk | Belongs to a different project; all docs use `grudge-cli`. |

### 13.8 Modified and added files

Modified:

- `.github/workflows/grudge-guard.yml`
- `CHANGELOG.md`, `Progress.md`, `README.md`
- `docs/INDEX.md`, `docs/guard-contract.md`, `docs/hooks.md`, `docs/trust-model.md`
- `grudge/cli/demo.py`, `grudge/guard/compile.py`, `grudge/recorder/redact.py`
- `packages/grudge/src/cli.js`, `src/commands/doctor.js`, `src/commands/propose.js`,
  `src/commands/scars.js`, `src/commands/uninstall.js`
- `packages/grudge/src/core/redact.js`, `src/core/session.js`, `src/core/stats.js`
- `packages/grudge/src/dsl/check.js`, `src/hooks/pre-tool-use.js`
- `packages/grudge/test/installer.test.js`, `phase17-hooks.test.js`,
  `phase18-propose.test.js`, `phase21-e2e.test.js`
- `pyproject.toml`, `requirements.lock`, `spec/compiled-predicates.schema.json`
- `tests/test_e2e_guard.mjs`, `tests/test_guard_compile.py`, `tests/test_packaging.py`,
  `tests/test_redact.py`
- deleted: `scripts/e2e_guard.mjs`

Added:

- `docs/production-readiness-audit-2026-10-30.md` (this file)
- `grudge/demo/e2e_guard.mjs`, `grudge/demo/payloads/leak-session/*.json` (4)
- `packages/grudge/test/concurrency-enforcement.test.js`
- `packages/grudge/test/remediation-regressions.test.js`
- `spec/redaction-corpus.json`
- `spec/conformance/call-must-missing.json`, `call-must-satisfied.json`,
  `call-must-other-call.json`, `call-never-explicit-polarity.json`,
  `path-case-windows.json`, `path-case-posix.json`, `path-dotdot-escape.json`,
  `path-sibling-prefix.json`, `path-normalized-remain.json`
- `tests/test_shared_corpora.py`

### 13.9 Exact release steps (human, after review)

```bash
# 1. Review and commit the working tree on the remediation branch.
git add -A
git commit -m "fix(guard): enforce before accounting; release-blocking audit fixes"
git push -u origin remediation/production-readiness

# 2. Open a PR into master, or merge locally after CI is green.
#    Dispatch CI for the resulting SHA and require ALL jobs green:
#      gh workflow run grudge-guard.yml --ref <branch-or-sha>
#      gh run watch
#    This is what closes P0-2. Do not skip it.

# 3. Rebuild artifacts from the tagged commit and re-run the local gates.
python -m pytest -o addopts="" -q
npm test --prefix packages/grudge
ruff check . && mypy .
python -m build --outdir release-dist
python -m twine check release-dist/*

# 4. Tag and publish (only from the verified SHA).
git tag v0.2.0 && git push origin v0.2.0
(cd packages/grudge && npm publish --access public)
python -m twine upload release-dist/*

# 5. Prove the published artifacts.
npx grudge-cli@latest verify          # expect PASS (10/10)
```

`npm publish` must run from `packages/grudge`; `--prefix` is ignored by
`npm publish`/`npm pack`. Publishing is out of scope for this session and was
not performed.

### 13.10 Second pass — D1 compiler polarity and D2 redaction parity

Independent verification of the working tree described in 13.1–13.9 found that
the P1-1 row claimed a fix the Python compiler did not implement, and that the
two redaction implementations still disagreed on five input classes. Both are
corrected here; the rows above are annotated rather than rewritten so the
history stays visible.

#### D1 — the Python compiler emitted `never` for a required call (blocking)

- **Root cause.** `grudge/guard/compile.py::_polarity` returned `must` only for
  `Ordering`. `must call <tool> [where …]` parses to a bare `CallShape`
  (`grudge/predicates/dsl.py:205-211`), which fell through to `never`;
  `never call …` is `PredicateSet(kind="not")` and was already correct. The two
  compilers therefore *agreed* on the wrong direction, and no Python test
  asserted `polarity` at all — the conformance fixtures hand-write
  `polarity: "must"`, so they only exercised `evaluate_rule`, never the compiler.
- **Fix.** `if isinstance(predicate, (Ordering, CallShape)): return "must"`.
  Negated sets and both taint forms still return `never`.
- **Before/after with the built wheel + the real Node guard** (one Scar:
  `must call shell where command ~ "npm test"`; the pre-fix function was restored
  in memory for the comparison, no file was edited):

  | Compiler | `polarity` | Bash `npm test` | Bash `ls -la` |
  |---|---|---|---|
  | pre-fix `_polarity` | `never` | **exit 2, blocked** | exit 0 |
  | fixed `_polarity` (this tree) | `must` | exit 0 | **exit 2, deny JSON** |
  | Node compiler, same Scar | `must` | exit 0 | exit 2 |

- **Tests added** (`tests/test_guard_compile.py`): a bare `CallShape` compiles to
  `must`; a negated `CallShape` to `never`; `Ordering` stays `must`; `TaintFlow`
  and `FilteredTaintFlow` stay `never`; `evaluate_rule` allows the satisfying call
  and violates on its absence; and an end-to-end test compiles the Scar with
  **Python**, writes `.grudge/compiled.json`, and drives the real Node guard
  (`packages/grudge/src/cli.js`, or `dist/grudge.mjs` when built) over stdin —
  `npm test` → 0, `ls -la` → 2 with `blocked: true`.

#### D2 — Python and Node redaction disagreed (latent)

The labelled-value rule was not equivalent: Python required an unquoted value
from `[A-Za-z0-9_./+=-]`, Node allowed any non-space run including quotes and
punctuation. Five classes differed (28-input set from the verification report,
reproduced here on 41 inputs):

| Input | Node (before) | Python (before) | Both (after) |
|---|---|---|---|
| `api key: abcd1234efgh` | `api key: [REDACTED]` | unchanged | `api key: [REDACTED]` |
| `Password: "hunter2!!"` | `Password: [REDACTED]` | unchanged | `Password: [REDACTED]` |
| `password: hunter2-long!` | `password: [REDACTED]` | `password: [REDACTED]!` | `password: [REDACTED]` |
| `api_key = abcd1234efgh!!` | `api_key: [REDACTED]` | `api_key: [REDACTED]!!` | `api_key: [REDACTED]` |
| `token=abcdefgh&next=1` | `token: [REDACTED]` (over-masked) | `token: [REDACTED]&next=1` | `token: [REDACTED]&next=1` |

- **Fix.** Both runtimes now use the same pattern:
  label `api[key]`/`access[key|token]`/`secret`/`token`/`password`/`passwd`/
  `authorization`, an optional matching quote (`\2` backreference), a value of
  eight or more characters, and `&`/`?` added to the delimiters so a following
  query parameter is not swallowed. Node lost the over-mask; Python gained
  quoted values, space-separated labels, and trailing punctuation.
- **Verification.** `spec/redaction-corpus.json` grew from 12 to 18 cases (the
  five classes above plus `token=abcdefgh?next=1`), asserted byte-for-byte by
  `tests/test_shared_corpora.py` and `remediation-regressions.test.js`. A
  separate 779-case generated sweep (12 labels × 4 separators × 16 value shapes,
  plus prose, Bearer, private key, AWS, GitHub, Slack, prefix, and mixed lines)
  produced **0 divergences** and **0 corpus mismatches** across the two runtimes;
  the only unmasked cases are ordinary prose, values shorter than eight
  characters, and values containing a space — the documented policy, identical
  in both runtimes. Python `redact_text`/`redact_trace` remain an opt-in helper
  and are still not called by a shipped capture path; the recorder's behaviour is
  unchanged apart from these value shapes.

#### Second-pass gate results (Windows 11, Python 3.14.0, Node 25.2.1)

| Command | Result |
|---|---|
| `python -m pytest -o addopts="" -q` | exit 0 — **319 passed, 1 skipped** |
| `npm test --prefix packages/grudge` | exit 0 — **104/104** (includes 25-process and duplicate-delivery concurrency cases) |
| `python -m ruff check .` | exit 0 |
| `python -m mypy .` | exit 0 — 126 files |
| `python -m scripts.docs_check` / `release_check` | exit 0 (34 docs) |
| `python -m build` + `twine check` | exit 0 — wheel 130,825 B, sdist 164,005 B, both PASSED |
| wheel in a clean venv (`pip check`) | exit 0, `grudge 0.2.0` |
| wheel `grudge compile` on a `must call` Scar | exit 0, `polarity: "must"` |
| installed tarball guard, same compiled file | `npm test` → 0, `ls -la` → 2 |
| installed tarball `grudge verify` outside the checkout | **PASS (10/10)** |
| `grudge-engine demo --guard --json` (wheel + tarball) | exit 0, `ok: true`, `session2: "blocked"` |
| `git diff --check` | exit 0 |

`npm pack --dry-run --prefix packages/grudge` still fails (npm ignores
`--prefix` for `pack`); `(cd packages/grudge && npm pack --dry-run)` exits 0
with 48 files, as documented in P2-5.
