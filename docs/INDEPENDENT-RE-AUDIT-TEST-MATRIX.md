# Independent re-audit — test matrix

**Purpose:** Record every test this re-audit executed against commit `0e06293`, with the exact command, expected result, actual result, status, and evidence.
**Audience:** Repository owner, release engineer, and reviewers verifying the P0/P1 remediation.
**Status:** final — 105 independent cases plus the repository suites; one cross-cutting failure (R-1).
**Last updated (phase):** 0.2.1 re-audit of `remediation/production-readiness` — 2026-10-31

## Scope

- Audited commit: `0e062935add8bf8e2986e17e19e30a2e97cbbec1` (exported with `git archive` to `D:\Temp\opencode\rea\src`).
- Installed npm artifact: `grudge-cli-0.2.0.tgz` (105,979 B, 50 files) in `D:\Temp\opencode\rea\npmproj`.
- Installed Python artifact: `grudge_cli-0.2.1-py3-none-any.whl` (133,162 B) in `D:\Temp\opencode\rea\venv`.
- Environment: Windows 11 10.0.26300.0, Node v25.2.1, npm 11.21.1, Python 3.14.0, Claude Code 2.1.283.
- Verdict and analysis: [`docs/INDEPENDENT-RE-AUDIT.md`](INDEPENDENT-RE-AUDIT.md).

The export and installed environments were deleted after the run to leave the machine clean. The
probe scripts, `results-*.json` files, built artifacts, and captured outputs remain in
`D:\Temp\opencode\rea`, so every row below can be re-derived.

## How to read the command column

Each section names the probe script that was executed, verbatim. Rows inside a section are
assertions made by that script. The helpers behind the rows are:

- `CLI` = `D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli\dist\grudge.mjs` (installed tarball).
- `PY` = `D:\Temp\opencode\rea\venv\Scripts\python.exe` (installed wheel); `grudge-engine` = the wheel's console script.
- `H(ev, cwd, cmd, sid)` = `node "<proj>/.grudge/bin/grudge.mjs" hook <ev>` with
  `{"session_id":sid,"cwd":cwd,"hook_event_name":"<ev>","tool_name":"Bash","tool_input":{"command":cmd}}`
  on stdin, run from the stated process cwd.
- `R(...)` = the same, but executing the exact command string parsed out of the registered
  `.claude/settings.json` (`"<node>" "<proj>/.grudge/bin/grudge.mjs" hook <ev>`).
- Repository-scope setup: `node "<CLI>" setup --yes --agents claude-code --scope repo --cwd "<proj>"`.
- Global-scope setup: `node "<CLI>" setup --yes --agents claude-code --scope global --cwd "<proj>"` with `HOME`/`USERPROFILE` pointed at a throwaway home.
- Rules were installed by writing `{"version":1,"rules":[…]}` to `<proj>/.grudge/compiled.json`; config by merging into `<proj>/.grudge/config.json`.
- Probe runs used a throwaway `HOME`/`USERPROFILE` so no real Grudge state could be read or written; the live section is the only exception and used an explicit `--settings` file with the real home untouched.

Every probe writes `results-<area>.json` next to the scripts containing the same rows plus the
full (untruncated) evidence strings. Exit codes are recorded below.

## Repository suites on the exported commit

| Check | Command | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| Node test suite | `npm test` in `packages/grudge` | all pass | 113 tests / 113 pass / 0 fail | PASS | exit 0, includes a fresh `build` |
| Python test suite | `python -m pytest -o addopts= -q` in the export root | all pass | 1 failed, 320 passed, 1 skipped (49.4 s; 36.8 s with `-rs`) | **FAIL** | `tests/test_release_check.py::test_release_metadata_is_consistent` — see R-1 |
| Python skip reason | `python -m pytest -o addopts= -q -rs` | recorded | `test_admission_court.py:390` — symlink privilege | PASS | environmental skip, not a defect |
| Lint | `python -m ruff check .` | clean | All checks passed | PASS | exit 0 |
| Types | `python -m mypy .` | clean | no issues in 126 source files | PASS | exit 0 |
| Docs index | `python scripts/docs_check.py` | clean | 38 indexed docs | PASS | exit 0 |
| Release metadata | `python scripts/release_check.py` | exit 0 | exit 1, two findings | **FAIL** | R-1 |
| CI config parity | read `.github/workflows/grudge-guard.yml` | tests run on push/PR | pytest + docs_check + release_check on 6 matrix jobs | — | the commit cannot go green |

## Independent probe results

### P0-1 — CWD-relative hook registration and state resolution

Probe command: `node D:\Temp\opencode\rea\probes\probe-p01.mjs D:\Temp\opencode\rea\results-p01.json`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| P0-1.1 | registered command is absolute and the script exists | absolute + present | true / true | PASS | "C:\Program Files\nodejs\node.exe" "D:\Temp\rea-pLm7Nb\p01\proj\.grudge\bin\grudge.mjs" hook PreToolUse |
| P0-1.2 | installed runtime loads outside the checkout | exit 0 | 0 | PASS | grudge 0.2.0 |
| P0-1.3 | registered hook blocks from the project root | exit 2 | 2 | PASS | grudge: blocked by p01: Never run P01_TOKEN. [scar p01]. Do not retry; change approach or ask the user. |
| P0-1.4 | registered hook blocks from a nested subdirectory | exit 2 | 2 | PASS | grudge: blocked by p01: Never run P01_TOKEN. [scar p01]. Do not retry; change approach or ask the user. |
| P0-1.5 | registered hook blocks when process cwd is elsewhere | exit 2 | 2 | PASS | grudge: blocked by p01: Never run P01_TOKEN. [scar p01]. Do not retry; change approach or ask the user. |
| P0-1.6 | payload cwd outside the install root warns and still enforces | exit 2 + warning | 2 / true | PASS | grudge: hook payload cwd 'D:\Temp\rea-pLm7Nb\p01\outside' is outside the install root 'D:\Temp\rea-pLm7Nb\p01\proj'; enforcing the rules installed at 'D:\Temp\rea-pLm7Nb\p01\proj' |
| P0-1.7 | no payload cwd still enforces (repo install) | exit 2 | 2 | PASS | grudge: blocked by p01: Never run P01_TOKEN. [scar p01]. Do not retry; change approach or ask the user. |
| P0-1.8 | non-existent payload cwd warns and still enforces | exit 2 + warning | 2 / true | PASS | grudge: hook payload cwd 'D:\Temp\rea-pLm7Nb\p01\does-not-exist' is not an existing directory; ignored |
| P0-1.9 | non-string payload cwd warns and still enforces | exit 2 + warning | 2 / true | PASS | grudge: hook payload cwd is not a path; ignored |
| P0-1.10 | non-matching call is allowed | exit 0 | 0 | PASS | (no stderr) |
| P0-1.11 | relative .grudge/bin path from a subdirectory fails (why the registered path must be absolute) | non-zero | 1 | PASS | node:internal/modules/cjs/loader:1423 |
| P0-1.12 | corrupt compiled.json is reported, not silently ignored | exit 0 + stderr warning | 0 / true | PASS | grudge: project rules at 'D:\Temp\rea-pLm7Nb\p01\proj\.grudge\compiled.json' are not a version 1 compiled file; ignored (fail-open) |
| P0-1.13 | missing compiled.json allows (documented: no rules exist) | exit 0 | 0 | PASS | (no stderr) |
| P0-1.14 | registered script file exists on disk | true | true | PASS | 197675 bytes |
| P0-1.15 | installed doctor reports absolute hook paths | ok=true + absolute and present | ok=true detail=absolute and present | PASS | exit=0 |

### P0-2 — Global scope

Probe command: `node D:\Temp\opencode\rea\probes\probe-p02.mjs D:\Temp\opencode\rea\results-p02.json`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| P0-2.1 | global setup registers an absolute command | absolute + present | true / true | PASS | "C:\Program Files\nodejs\node.exe" "D:\Temp\rea-S75L58\p02\home\.grudge\bin\grudge.mjs" hook PreToolUse |
| P0-2.2 | global rule blocks inside project A | exit 2 | 2 | PASS | grudge: blocked by global-shared: Never run GLOBAL_TOKEN. [scar global-shared]. Do not retry; change approach or ask the user. |
| P0-2.3 | global rule blocks inside unrelated project B | exit 2 | 2 | PASS | grudge: blocked by global-shared: Never run GLOBAL_TOKEN. [scar global-shared]. Do not retry; change approach or ask the user. |
| P0-2.4 | unrelated call in project B is allowed | exit 0 | 0 | PASS | (no stderr) |
| P0-2.5 | project A rule applies in project A | exit 2 | 2 | PASS | grudge: blocked by a-only: Never run A_ONLY. [scar a-only]. Do not retry; change approach or ask the user. |
| P0-2.6 | project A rule does not leak into project B | exit 0 | 0 | PASS | (no stderr) |
| P0-2.7 | project rule with a global id cannot replace the global rule | exit 0 + ignored warning | 0 / true | PASS | grudge: project rule 'global-shared' is ignored; the rule with that id from the other installation takes precedence |
| P0-2.8 | global rule still blocks after the project conflict attempt | exit 2 | 2 | PASS | grudge: project rule 'global-shared' is ignored; the rule with that id from the other installation takes precedence |
| P0-2.9 | project mode off does not disable global rules | exit 2 | 2 | PASS | grudge: blocked by global-shared: Never run GLOBAL_TOKEN. [scar global-shared]. Do not retry; change approach or ask the user. |
| P0-2.10 | project mode off disables that project's own rule | exit 0 | 0 | PASS | (no stderr) |
| P0-2.11 | global mode off disables the global rule | exit 0 | 0 | PASS | (no stderr) |
| P0-2.12 | global mode off does not disable an explicit project rule | exit 2 | 2 | PASS | grudge: blocked by a-only: Never run A_ONLY. [scar a-only]. Do not retry; change approach or ask the user. |
| P0-2.13 | session events stay in their own project | separate files with own events | A=true B=true | PASS | A=D:\Temp\rea-S75L58\p02\projA\.grudge\session\shared.jsonl B=D:\Temp\rea-S75L58\p02\projB\.grudge\session\shared.jsonl |
| P0-2.14 | repo install still enforces its own rule | exit 2 | 2 | PASS | grudge: blocked by c-only: Never run C_ONLY. [scar c-only]. Do not retry; change approach or ask the user. |
| P0-2.15 | repo install also consumes the global rule | exit 2 | 2 | PASS | grudge: blocked by global-shared: Never run GLOBAL_TOKEN. [scar global-shared]. Do not retry; change approach or ask the user. |

### P0-3 — Budget cannot turn a block into an allow

Probe command: `node D:\Temp\opencode\rea\probes\probe-p03.mjs D:\Temp\opencode\rea\results-p03.json`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| P0-3.1 | default budget blocks a matching call | exit 2 | 2 | PASS | grudge: blocked by p03: Never run BUDGET_TOKEN. [scar p03]. Do not retry; change approach or ask the user. |
| P0-3.2 | hookBudgetMs=1 still blocks | exit 2 | 2 | PASS | grudge: state load took 6ms, over hookBudgetMs 1; enforcement continued (fail-closed) |
| P0-3.3 | budget overrun is reported as fail-closed | stderr says enforcement continued | grudge: state load took 6ms, over hookBudgetMs 1; enforcement continued (fail-closed) grud… | PASS | grudge: state load took 6ms, over hookBudgetMs 1; enforcement continued (fail-closed) |
| P0-3.4 | no old fail-open budget message exists | absent | false | PASS | searched stderr |
| P0-3.5 | installed bundle has no budget race | no withBudget / budget exceeded | withBudget=false exceeded=false | PASS | dist=D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli\dist\grudge.mjs |
| P0-3.6 | 20 concurrent calls under hookBudgetMs=1 all block | 20 denied | 20/20 | PASS | codes=2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2 |
| P0-3.7 | 6 MiB session history still blocks | exit 2 | 2 | PASS | grudge: state load took 25ms, over hookBudgetMs 1; enforcement continued (fail-closed) (session=6294020 bytes) |
| P0-3.8 | stale stats lock does not change the verdict | exit 2 | 2 | PASS | grudge: state load took 6ms, over hookBudgetMs 1; enforcement continued (fail-closed) |
| P0-3.9 | held stats lock does not change the verdict | exit 2 | 2 | PASS | grudge: state load took 7ms, over hookBudgetMs 1; enforcement continued (fail-closed) |
| P0-3.10[0] | invalid hookBudgetMs warns and blocks | exit 2 + invalid warning | 2 / true | PASS | grudge: hookBudgetMs 0 is invalid; using 1500. Enforcement is not affected. |
| P0-3.10[-5] | invalid hookBudgetMs warns and blocks | exit 2 + invalid warning | 2 / true | PASS | grudge: hookBudgetMs -5 is invalid; using 1500. Enforcement is not affected. |
| P0-3.10["abc"] | invalid hookBudgetMs warns and blocks | exit 2 + invalid warning | 2 / true | PASS | grudge: hookBudgetMs "abc" is invalid; using 1500. Enforcement is not affected. |
| P0-3.11 | every timed call returns the block verdict | 5/5 exit 2 | 5/5 | PASS | ms=293,294,323,295,290 |

### P0-4 — Secrets persisted in cleartext (installed Node hook)

Probe command: `node D:\Temp\opencode\rea\probes\probe-p04.mjs D:\Temp\opencode\rea\results-p04.json`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| P0-4.1 | PostToolUse accepts the payload | exit 0 | 0 | PASS | — |
| P0-4.2 | session JSONL exists on disk | non-empty | 638 bytes | PASS | D:\Temp\rea-z3px1I\p04\proj\.grudge\session\p04.jsonl |
| P0-4.3 | no secret value reaches the stored JSONL | 0 leaks | 0 | PASS | — |
| P0-4.4[password] | structured field is replaced wholesale | "password":"[REDACTED]" | true | PASS | "password":"[REDACTED]" |
| P0-4.4[api_key] | structured field is replaced wholesale | "api_key":"[REDACTED]" | true | PASS | "api_key":"[REDACTED]" |
| P0-4.4[auth.token] | structured field is replaced wholesale | "token":"[REDACTED]" | true | PASS | "token":"[REDACTED]" |
| P0-4.4[auth.secret] | structured field is replaced wholesale | "secret":"[REDACTED]" | true | PASS | "secret":"[REDACTED]" |
| P0-4.4[refresh_token] | structured field is replaced wholesale | "refresh_token":"[REDACTED]" | true | PASS | "refresh_token":"[REDACTED]" |
| P0-4.4[client_secret] | structured field is replaced wholesale | "client_secret":"[REDACTED]" | true | PASS | "client_secret":"[REDACTED]" |
| P0-4.4[Authorization header] | structured field is replaced wholesale | "Authorization":"[REDACTED]" | true | PASS | "Authorization":"[REDACTED]" |
| P0-4.4[Cookie header] | structured field is replaced wholesale | "Cookie":"[REDACTED]" | true | PASS | "Cookie":"[REDACTED]" |
| P0-4.5 | query-string separator is preserved | api_key=[REDACTED]&next=1 | true | PASS | api_key=[REDACTED]&next=1\nAWS_ACCESS_KEY_ID=[REDACTED]\nquarterly owl report is ready |
| P0-4.6 | compound AWS assignment leaves no residue | AWS_ACCESS_KEY_ID=[REDACTED], no ' KEY]' | assign=true residue=false | PASS | AWS_ACCESS_KEY_ID=[REDACTED] |
| P0-4.7[sql] | non-sensitive content is preserved | select 1 | true | PASS | select 1 |
| P0-4.7[Accept] | non-sensitive content is preserved | text/plain | true | PASS | text/plain |
| P0-4.7[keyboard] | non-sensitive content is preserved | keep me | true | PASS | keep me |
| P0-4.7[monkey] | non-sensitive content is preserved | keep me too | true | PASS | keep me too |
| P0-4.7[prose] | non-sensitive content is preserved | quarterly owl report is ready | true | PASS | quarterly owl report is ready |
| P0-4.8 | bare provider key shape is redacted | AKIA value absent + [REDACTED KEY] | leak=false marker=true | PASS | — |
| P0-4.9 | Authorization header in text is redacted | bearer value absent | leak=false | PASS | — |

### P0-4 — Secrets persisted in cleartext (installed Python recorder)

Probe command: `D:\Temp\opencode\rea\venv\Scripts\python.exe D:\Temp\opencode\rea\probes\probe-p04.py D:\Temp\opencode\rea\recorder-p04.jsonl` (exit 0)

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| P0-4.py.1 | trace file exists and is non-empty | non-empty | 787 bytes | PASS | recorder-p04.jsonl |
| P0-4.py.2 | no seeded secret value appears in the trace file | 0 leaks | 0 | PASS | string search over the artifact |
| P0-4.py.3 | `password` field | "[REDACTED]" | "[REDACTED]" | PASS | parsed Trace.tool_calls()[0].args.body.password |
| P0-4.py.4 | `api_key` field | "[REDACTED]" | "[REDACTED]" | PASS | args.body.api_key |
| P0-4.py.5 | `auth.token` field | "[REDACTED]" | "[REDACTED]" | PASS | args.body.auth.token |
| P0-4.py.6 | `auth.secret` field | "[REDACTED]" | "[REDACTED]" | PASS | args.body.auth.secret |
| P0-4.py.7 | `client_secret` field | "[REDACTED]" | "[REDACTED]" | PASS | args.body.config.client_secret |
| P0-4.py.8 | `refresh_token` inside a list element | "[REDACTED]" | "[REDACTED]" | PASS | args.body.list[0].refresh_token |
| P0-4.py.9 | `Authorization` header | "[REDACTED]" | "[REDACTED]" | PASS | args.headers.Authorization |
| P0-4.py.10 | `Cookie` header | "[REDACTED]" | "[REDACTED]" | PASS | args.headers.Cookie |
| P0-4.py.11 | URL query credential keeps its separator | `https://x.invalid/?api_key=[REDACTED]&next=1` | exact match | PASS | args.url |
| P0-4.py.12 | non-sensitive header preserved | `text/plain` | `text/plain` | PASS | args.headers.Accept |
| P0-4.py.13 | non-sensitive SQL preserved | `select 1` | `select 1` | PASS | args.sql |
| P0-4.py.14 | word containing a sensitive substring preserved | `keep me` | `keep me` | PASS | args.body.config.keyboard |
| P0-4.py.15 | ordinary prose preserved | contains `quarterly owl report` | contains | PASS | args.note |
| P0-4.py.16 | redaction leaves no truncated label residue | no `' KEY]'` | absent | PASS | string search over the artifact |

### P1-1 — CWD mismatch diagnostics and Stop stats

Probe command: `node D:\Temp\opencode\rea\probes\probe-p11.mjs D:\Temp\opencode\rea\results-p11.json`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| P1-1.1 | project/cwd mismatch is diagnosed and still blocks | exit 2 + outside-the-install-root warning | 2 / true | PASS | grudge: hook payload cwd 'D:\Temp\rea-7LIDB5\p11\otherproj' is outside the install root 'D:\Temp\rea-7LIDB5\p11\proj'; enforcing the rules installed at 'D:\Temp\rea-7LIDB5\p11\proj' |
| P1-1.2 | matching call is blocked before Stop | exit 2 | 2 | PASS | grudge: blocked by p11: Never run P11_TOKEN. [scar p11]. Do not retry; change approach or ask the user. |
| P1-1.3 | Stop exits cleanly | exit 0 | 0 | PASS | (no stderr) |
| P1-1.4 | Stop appends a canonical stop event | 1 stop event | 1 | PASS | stats=D:\Temp\rea-7LIDB5\p11\proj\.grudge\stats.jsonl |
| P1-1.5 | legacy stats.json is not written | absent | false | PASS | D:\Temp\rea-7LIDB5\p11\proj\.grudge\stats.json |
| P1-1.6 | duplicate Stop is deduplicated | still 1 stop event | 1 events, stdout="" | PASS | (silent) |
| P1-1.7 | stats command parses and sees the blocked call | caught>=1 blocked>=1 | caught=2 blocked=2 stops=n/a | PASS | {"blocks":0,"warnings":0,"proposals":0,"acceptedScars":0,"perScar":{},"caught":2,"blocked":2,"warned":0,"accepted":0,"injectedChars":624,"injectedTokens":156,"netSavingsTokens":2844,"scars":1,"estimat |
| P1-1.8 | stats JSON exposes the expected counters | keys present | blocks,warnings,proposals,acceptedScars,perScar,caught,blocked,warned,accepted,injectedCha… | PASS | {"blocks":0,"warnings":0,"proposals":0,"acceptedScars":0,"perScar":{},"caught":2,"blocked":2,"warned":0,"accepted":0,"injectedChars":624,"injectedTokens":156,"netSavingsTokens":2844,"scars":1,"estimatedTokensSa… |

### Cross-cutting checks (artifacts, CLI, versions)

Probe command: `node D:\Temp\opencode\rea\probes\probe-extra.mjs D:\Temp\opencode\rea\results-extra.json`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| X.1 | wrong-version compiled.json warns and fails open | exit 0 + warning | 0 / true | PASS | grudge: project rules at 'D:\Temp\rea-mTuWWA\extra\proj\.grudge\compiled.json' are not a version 1 compiled file; ignored (fail-open) |
| X.2 | invalid rule is skipped with a warning | exit 0 + invalid-rule warning | 0 / true | PASS | grudge: project rule "bad" is invalid and was skipped |
| X.3 | compiled.json over 4 MiB is refused with a warning | exit 0 + byte-limit warning | 0 / true | PASS | grudge: project rules at 'D:\Temp\rea-mTuWWA\extra\proj\.grudge\compiled.json' are 5243135 bytes, over the 4194304-byte limit; ignored |
| X.4 | installed doctor passes with no failing checks | ok=true, 0 failed | ok=true failed=0 | PASS | 19 checks |
| X.5 | installed verify passes | PASS (10/10 checks) | Result: PASS (10/10 checks) | PASS | [ok] report: grudge report shows 1 caught, 1 blocked \| Result: PASS (10/10 checks) \| Temp project removed (use --keep to inspect it) |
| X.6[src/core/roots.js] | npm tarball contains the enforcement module | present | true | PASS | D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli\src\core\roots.js |
| X.6[src/core/rules.js] | npm tarball contains the enforcement module | present | true | PASS | D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli\src\core\rules.js |
| X.6[src/core/redact.js] | npm tarball contains the enforcement module | present | true | PASS | D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli\src\core\redact.js |
| X.6[dist/grudge.mjs] | npm tarball contains the enforcement module | present | true | PASS | D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli\dist\grudge.mjs |
| X.7 | shipped bundle has no relative imports | 0 | 0 | PASS | dist text length 197,631 characters (197,675 bytes on disk) |
| X.8 | installed npm version matches the committed package.json | 0.2.0 | grudge 0.2.0 | PASS | package.json=0.2.0 |
| X.9 | npm and Python artifacts report the same version | same version | npm=grudge 0.2.0 python=grudge 0.2.1 | FAIL | npm package.json=0.2.0 |

### Live Claude Code integration (authenticated session, 2.1.283)

Probe command: `node D:\Temp\opencode\rea\probes\live3.mjs`

| ID | Case | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| LIVE.1 | repo setup writes project settings | exit 0 | 0 | PASS | Grudge setup v0.2.0 [ok] Scope: repo [ok] Agents: claude-code [ok] Files: 5 changed 3 passed, 0 failed, 0 warnings Next: grudge doctor |
| LIVE.2 | live Claude Code session finished | exit 0 (agent finished, not a crash) | 0 | PASS | The command was blocked by a "grudge" hook (a learned rule that prevents certain commands). The system indicates there's a scar/rule that says "Never run this exact command." I should not retry it. What were yo… |
| LIVE.3 | live session recorded a PreToolUse hook event | PreToolUse present | true | PASS | {"type":"hook","hookEvent":"SessionStart","sessionId":"77a9e6a6-f523-4b6d-8a66-3be2acf62530","dedupeKey":"SessionStart:77a9e6a6-f523-4b6d-8a66-3be2acf62530:347eac1309d004bad0bd7e02f40aeec40346f52132b2aae4ba4be5… |
| LIVE.4 | the blocked call is visible in the live transcript | mentions grudge/blocked | true | PASS | The command was blocked by a "grudge" hook (a learned rule that prevents certain commands). The system indicates there's a scar/rule that says "Never run this exact command." I should not retry it. What were yo… |
| LIVE.5 | stats command sees the live block | caught>=1 and blocked>=1 | caught=1 blocked=1 | PASS | {"blocks":0,"warnings":0,"proposals":0,"acceptedScars":0,"perScar":{},"caught":1,"blocked":1,"warned":0,"accepted":0,"injectedChars":381,"injectedTokens":96,"netSavingsTokens":1404,"scars":1,"estimatedTokensSav… |
| LIVE.6 | benign command runs in the same live project | exit 0 + REA_LIVE_OK in output | allowed and executed | PASS | Session 6edac40e-d958-4b20-888d-89309062da7e.jsonl: `echo REA_LIVE_OK` -> stdout `REA_LIVE_OK`; stats has PreToolUse+PostToolUse for it and no catch/blocked event. A later re-prompt was abandoned by the assista… |

## Direct reproductions

These are the shortest literal commands behind the headline results, for a reviewer who wants to
see each behaviour with their own eyes. Substitute `<install>` for
`D:\Temp\opencode\rea\npmproj\node_modules\grudge-cli` and `<proj>` for a throwaway project.

| What | Command |
|---|---|
| Install a repo-scope guard | `node "<install>\dist\grudge.mjs" setup --yes --agents claude-code --scope repo --cwd "<proj>"` |
| Registered command is absolute | inspect `"<proj>\.claude\settings.json"` → `hooks.PreToolUse[0].hooks[0].command` |
| Block from root / sub / foreign cwd | `node "<proj>\.grudge\bin\grudge.mjs" hook PreToolUse` with the payload cwd set to the project, a nested dir, then an unrelated dir |
| Budget cannot fail open | set `"hookBudgetMs": 1` in `"<proj>\.grudge\config.json"`, re-run the block; expect exit 2 and `enforcement continued (fail-closed)` |
| Corrupt rules | `Set-Content "<proj>\.grudge\compiled.json" "{ not json"`; re-run; expect exit 0 and `not a version 1 compiled file; ignored (fail-open)` |
| Global rule reaches another project | `setup --scope global` into a throwaway `HOME`, write a rule to `"<home>\.grudge\compiled.json"`, run the hook from two unrelated project dirs; both exit 2 |
| Secrets on disk | send a `PostToolUse` payload containing `password`, `api_key`, `auth.token`, `AWS_ACCESS_KEY_ID=…`, and a query credential; read `"<proj>\.grudge\session\<id>.jsonl"` |
| Stop stats | send `Stop`; read `"<proj>\.grudge\stats.jsonl"`; then `node "<install>\dist\grudge.mjs" stats --json --cwd "<proj>"` |
| Version mismatch (R-1) | `node "<install>\dist\grudge.mjs" --version` → `grudge 0.2.0`; `D:\Temp\opencode\rea\venv\Scripts\grudge-engine.exe --version` → `grudge 0.2.1` |
| Release gate (R-1) | in the commit export: `python scripts/release_check.py` → exit 1; `python -m pytest -o addopts= -q tests/test_release_check.py` → 1 failed |
| Redaction parity | `node probes\parity.mjs` → `cases=596 text=586 traces=10 divergences=0`, `idempotent: node=true python=true` |

## Status notes

- **LIVE.6** is marked PASS on the recorded enforcement evidence: in session
  `6edac40e-d958-4b20-888d-89309062da7e` the benign `echo REA_LIVE_OK` produced a PreToolUse and a
  PostToolUse record, and the stored stdout is `REA_LIVE_OK`, while the block rule for a different
  command was installed. The probe runner's own second invocation returned a null exit status
  (spawn/TTY artefact) and was completed manually; see limitation L-4 in the report.
- **X.9** is the only failing independent assertion and is the same defect as R-1: the npm artifact
  reports `grudge 0.2.0`, the Python artifact reports `grudge 0.2.1` from the same commit.
- P0-4 rows `P0-4.4[*]` assert whole-field replacement (`"password":"[REDACTED]"`) rather than a
  prefix match, so a partial redaction such as `[REDACTED]xyz` would not pass.
- P0-3 timings are wall-clock on this machine; the assertion is the exit code, not the duration.
  The `hookBudgetMs: 1` overrun diagnostics show the budget is checked but never allowed to
  short-circuit the verdict.
- “PASS” in this matrix means the asserted behaviour was reproduced in this environment. It is not
  a production-readiness claim: the release gate fails for R-1, and the live model is
  non-deterministic.

## Cross-references

- Verdict, method, environment, findings, and limitations: [`docs/INDEPENDENT-RE-AUDIT.md`](INDEPENDENT-RE-AUDIT.md).
- Prior independent audit (claims compared against, not trusted): [`docs/INDEPENDENT-PRODUCTION-AUDIT.md`](INDEPENDENT-PRODUCTION-AUDIT.md) and [`docs/AUDIT-TEST-MATRIX.md`](AUDIT-TEST-MATRIX.md).
- Remediation claims re-tested here: [`docs/PRODUCTION-REMEDIATION-REPORT.md`](PRODUCTION-REMEDIATION-REPORT.md) and [`docs/PRODUCTION-REMEDIATION-TEST-MATRIX.md`](PRODUCTION-REMEDIATION-TEST-MATRIX.md).
- Hook and trust contracts exercised: [`docs/hooks.md`](hooks.md), [`docs/trust-model.md`](trust-model.md), [`docs/interfaces.md`](interfaces.md).
