# Production remediation report — Grudge 0.2.1

**Purpose:** Record the remediation of the four P0 findings and P1-1 from `docs/INDEPENDENT-PRODUCTION-AUDIT.md`, with the original reproduction, root cause, files changed, fix, regression test, executed command, actual result, and remaining limitations for each finding.
**Audience:** Repository owner, release engineer, and the independent re-auditor.
**Status:** Implementation and validation complete; awaiting independent re-audit.
**Last updated (phase):** 0.2.1 production remediation - 2026-10-31

**Branch:** `remediation/production-readiness`
**Base commit audited:** `a4788c0` (`chore: release 0.2.1`, tag `v0.2.1`)
**Host:** Windows 11 26300 · Python 3.14.0 · Node 25.2.1 · npm 11.21.1 · git 2.55.0

A finding is counted as fixed only when **its original reproduction passes
against the installed packages** (the built wheel and the packed npm tarball),
not just against the checkout. Every result below was produced that way.

---

## 1. Result summary

| ID | Audit finding | Status | Original reproduction after fix | Installed-package evidence |
|---|---|---|---|---|
| P0-1 | Hook path is CWD-relative; enforcement is off from any subdirectory or after `cd` | **Fixed** | exit 2 (blocked) from a nested directory, with an absolute registered command | §13 repro rows 1–3, all PASS |
| P0-2 | `--scope global` rules are written to `~/.grudge` but never consulted | **Fixed** | exit 2 (blocked) in two unrelated projects; project cannot replace a global rule | §13 repro row 4, PASS |
| P0-3 | `hookBudgetMs` timeout converts a matching block into an allow | **Fixed** | exit 2 with `enforcement continued (fail-closed)` | §13 repro row 5, PASS |
| P0-4 | Structured secrets persisted in cleartext; string redaction leaves residue and corrupts URLs | **Fixed** | 0 secret values in the stored session file; separator preserved | §13 repro row 6, PASS |
| P1-1 | A `cwd` mismatch silently disables enforcement; `stop.js` writes the legacy stats file | **Fixed** | invalid/external `cwd` warns on stderr and enforcement continues; Stop writes `stats.jsonl` | §13 repro row 7, PASS |
| P2-3 | Corrupt / wrong-version `compiled.json` silently disables rules | **Fixed incidentally** | stderr warning, exit 0 (rules cannot invent a match) | `rules-warn.mjs`, 3/3 warned |
| P3-1 | Redaction injects `: ` into query strings and leaves ` KEY]` | **Fixed as part of P0-4** | separator preserved; no residue | corpus + §13 repro row 6 |

P0 count after remediation: **0 open**. P1 count after remediation: **0 open**.
P2-1, P2-2 and P2-4 were outside the requested scope and are unchanged; see
[§9](#9-findings-outside-this-remediation).

---

## 2. What changed in the enforcement model

Three invariants now hold on every hook invocation and are the backbone of the
fixes below.

1. **The install root is derived from the running script, never from the process
   CWD.** `packages/grudge/src/core/roots.js:56` walks
   `<root>/.grudge/bin/grudge.mjs` upward and returns `<root>`. No hook reads
   state relative to `process.cwd()`.
2. **The payload `cwd` is validated, not trusted.** It must be an existing
   directory. For a repository/local install it must also be inside the install
   root; an outside path produces a stderr warning and the install root keeps
   enforcing. A missing or non-string `cwd` also warns.
3. **A verdict is never raced against a timer.** State reads are bounded by
   fixed size caps, `hookBudgetMs` is an observability threshold, and
   accounting runs after the verdict with its own 1 s bound.

The installation scope is recorded in `.grudge/config.json`
(`scope` and `runtimeCommand`) by `setup`, so `doctor` can report what was
installed instead of inferring it.

---

## 3. P0-1 — Hook path is CWD-relative

### Original reproduction

From a temporary project with a matching block rule installed:

```bash
cd project/sub
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}' \
  | node ../.grudge/bin/grudge.mjs hook PreToolUse ; echo "exit=$?"
```

Registered command (before):

```text
node .grudge/bin/grudge.mjs hook PreToolUse
```

Observed before the fix:

- `cd sub && node .grudge/bin/grudge.mjs hook PreToolUse` → `Cannot find module
  '…\sub\.grudge\bin\grudge.mjs'`, exit **1**. Claude Code treats a non-zero
  command hook without a deny decision as "allowed".
- `cd sub && node ../.grudge/bin/grudge.mjs hook PreToolUse` → the module loads
  but the old handler resolved `.grudge` from `process.cwd()` (`sub`), found no
  rules, and exited **0**.
- A payload `cwd` pointing at another project redirected state resolution and
  silently skipped the installed rules.

### Root cause

`setup` registered a path relative to the project root, but Claude Code runs a
command hook from the session's current directory, which follows `cd`. In
addition, every handler derived its root from `payload.cwd || process.cwd()`
without checking that the payload path belonged to the installation, so a
mismatch was indistinguishable from "no rules installed".

### Files changed

- `packages/grudge/src/commands/setup.js` — builds
  `"<node executable>" "<install root>/.grudge/bin/grudge.mjs"`, quotes both
  tokens unconditionally, and records `scope` / `runtimeCommand` in
  `.grudge/config.json`.
- `packages/grudge/src/installer/adapters/claude-code.js` — unchanged: it already
  accepted a `runtimeCommand`, and `setup` now passes the absolute value instead
  of relying on the adapter's relative default.
- `packages/grudge/src/core/roots.js` — **new**. `installRootFromScript`,
  `withinRoot`, `resolveRoots`; validates payload `cwd` and emits warnings.
- `packages/grudge/src/commands/hook.js` — resolves roots once per invocation
  and prefixes every resolution warning to stderr.
- `packages/grudge/src/hooks/pre-tool-use.js`, `session-start.js`,
  `post-tool-use.js`, `stop.js` — consume `options.roots.projectRoot`; no
  `process.cwd()` fallback on the installed path.
- `packages/grudge/src/commands/doctor.js` — new `hook paths` check
  (`absolute and present`), plus a splitter that reads the path out of a quoted
  command.

### Fix

The registered command is absolute, so a `cd` cannot break it. The handler
anchors state to the install root of the running script. For a global install
the install root is the home directory, so the project root comes from the
validated payload `cwd`. A payload outside a repository install warns and does
not redirect enforcement.

### Regression test

`packages/grudge/test/remediation-p0.test.js`:

- `P0-1: an installed hook blocks from a nested directory and after a simulated cd`
  (subdirectory payload, payload pointing at the project while the process CWD is
  elsewhere, no payload `cwd`, and a benign call).
- `P0-1: a payload cwd outside the install root warns and never redirects enforcement`.

Both drive the real bundled runtime in a child process after a real
`grudge setup`.

### Command and actual result

```text
node D:\Temp\opencode\audit-repro.mjs D:\Temp\opencode\final-npm-proj\node_modules\grudge-cli\dist\grudge.mjs

PASS  P0-1 relative ../.grudge/bin/grudge.mjs from sub    exit=2  grudge: blocked by p0-1: Never run rm -rf. …
PASS  P0-1 registered absolute command from sub           exit=2  grudge: blocked by p0-1: Never run rm -rf. …
PASS  P0-1 payload cwd outside install root              exit=2  grudge: hook payload cwd '…\other' is outside the install root '…'
```

`grudge doctor --json` on an installed project reports `ok: true` with 21/21
checks passing, including `PASS  hook paths  absolute and present`. The
registered command is:

```text
"C:\Program Files\nodejs\node.exe" "D:\Temp\opencode\final-verified\.grudge\bin\grudge.mjs" hook PreToolUse
```

### Remaining limitations

- The managed instruction block still tells the model to run
  `node .grudge/bin/grudge.mjs propose …`, which requires the process CWD to be
  the repository root. In a global install the block instructs the user to call
  the global `grudge propose` instead. This is documentation for the model, not
  the enforced hook path, and is called out in `README.md`.
- A global install binds state to the payload `cwd`; it does not walk upward to
  discover a repository root. A host that omits `cwd` falls back to the process
  CWD, with a warning.
- Launching the runtime through a symlink was not tested; `process.argv[1]` is
  used as the anchor and is resolved by Node, but a symlinked launcher could
  change the apparent path.

---

## 4. P0-2 — Global rules are never consulted

### Original reproduction

```bash
HOME=$TMP/fakehome node dist/grudge.mjs setup --yes --agents claude-code --scope global
cd $TMP/otherproj
echo '{…}' | node $TMP/fakehome/.grudge/bin/grudge.mjs hook PreToolUse ; echo "exit=$?"
```

Observed before the fix: exit **0**. The rule in
`$TMP/fakehome/.grudge/compiled.json` was never read; only
`$TMP/otherproj/.grudge/compiled.json` was.

### Root cause

`setup --scope global` wrote state under the home directory, but every handler
read `<project>/.grudge/compiled.json` only. There was no merge layer, so the
global scope was effectively a no-op. `mode: "off"` was also treated as a
single global switch rather than a per-installation setting.

### Files changed

- `packages/grudge/src/core/rules.js` — **new**. `readCompiled` (4 MiB cap,
  explicit warnings for invalid or wrong-version files), `mergeRules`
  (global-first, id and body dedupe, conflict warning), `loadRules`.
- `packages/grudge/src/core/config.js` — `loadEffectiveConfig` returns
  `projectActive` and `globalActive` separately, with `hookBudgetMs` resolution.
- `packages/grudge/src/core/roots.js` — exposes both `globalDir`
  (`<home>/.grudge`, for rules) and `globalRoot` (`<home>`, for config), and
  only reports a global installation that actually exists.
- `packages/grudge/src/hooks/pre-tool-use.js`, `session-start.js`, `stop.js`,
  `post-tool-use.js` — load the layered rule set.
- `packages/grudge/src/commands/doctor.js` — reports the declared scope and
  state path.

### Fix

Precedence is deterministic and documented in `docs/hooks.md`:

1. Global rules load first and are authoritative.
2. Project rules add protections.
3. A project rule whose `id` matches a global rule is ignored with a stderr
   warning; it cannot replace or disable the global rule.
4. Identical rule bodies are evaluated once.
5. `mode: "off"` is per installation: a project off never disables the global
   installation, and a global off never disables an explicit project install.

### Regression test

`packages/grudge/test/remediation-p0.test.js`:

- `P0-2: a global install blocks in two unrelated projects`
- `P0-2: project rules stay local, and a project cannot disable or replace a
  global rule` (includes the conflict warning and both `mode: "off"` directions).

### Command and actual result

```text
PASS  P0-2 global rule from another project   exit=2  grudge: blocked by global-repro: Never run rm -rf. …
```

The installed-package Node suite also passes the two-project and
conflict/`off` cases (9/9, see [§8](#8-cross-cutting-validation)).

### Remaining limitations

- There are exactly two layers. There is no per-directory inheritance beyond
  "global + the one project that owns the payload `cwd`".
- `--scope local` and `--scope repo` both count as the project layer; only the
  settings filename differs.
- A global install is only consulted when `~/.grudge/config.json` exists, so an
  unrelated machine is never made to read the real home directory.

---

## 5. P0-3 — A configured budget can convert a block into an allow

### Original reproduction

Install a block rule, set `.grudge/config.json` to `"hookBudgetMs": 1`, then
send a matching PreToolUse payload:

```bash
python -c "import json;c=json.load(open('.grudge/config.json'));c['hookBudgetMs']=1;json.dump(c,open('.grudge/config.json','w'))"
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}' \
  | node .grudge/bin/grudge.mjs hook PreToolUse ; echo "exit=$?"
```

Observed before the fix:
`grudge: hook time budget exceeded; allowed (fail-open)`, exit **0**.

### Root cause

`withBudget` raced `loadState` against `hookBudgetMs`. `loadState` read the
compiled rules and the entire session history; the audit measured that history
at up to ~20 MB with the 500-event / 4 KiB-result caps. A low budget therefore
fired deterministically, and the timeout path returned an allow *after* the
rules had been loaded but before they were evaluated.

### Files changed

- `packages/grudge/src/hooks/pre-tool-use.js` — removed the race; `loadState` is
  plain bounded I/O, `decide` is pure CPU, the verdict is produced before
  accounting starts. `hookBudgetMs` now emits
  `grudge: state load took <n>ms, over hookBudgetMs <n>; enforcement continued
  (fail-closed)` and does not change the result.
- `packages/grudge/src/core/session.js` — `readTail` reads at most the last
  2 MiB / 500 events; `read` remains unlimited for maintenance callers.
- `packages/grudge/src/core/rules.js` — refuses a compiled file larger than
  4 MiB instead of parsing it.
- `packages/grudge/src/core/config.js` — invalid budgets warn and fall back to
  the default; they are not a timeout.

### Fix

There is no longer a timeout on the enforcement path. Reads are bounded by
fixed caps; a matching call is always evaluated. Accounting is bounded to 1 s
and uses an `unref()`ed timer, so a slow disk can drop a counter but can never
delay or change the verdict. Stale or held `.grudge/stats.jsonl.lock` files are
irrelevant because the enforcement path takes no lock.

### Regression test

`packages/grudge/test/remediation-p0.test.js`:

- `P0-3: hookBudgetMs never converts a matching block into an allow` — 25
  concurrent matching calls with `hookBudgetMs: 1`; every call must exit 2.
- `P0-3: a large session history, a stale lock, and a held lock still block` —
  a >4 MiB session log, a 10-minute-old lock directory, and a freshly held lock.

### Command and actual result

```text
PASS  P0-3 hookBudgetMs=1 (414ms)  exit=2
      stderr: grudge: state load took 4ms, over hookBudgetMs 1; enforcement continued (fail-closed)
              grudge: blocked by p0-3: Never run rm -rf. [scar p0-3]. Do not retry; change approach or ask the user.
```

25/25 concurrent matching calls blocked. The 4 MiB session case is covered by
the installed-package test run (9/9).

### Remaining limitations

- A session tail beyond 2 MiB / 500 events means taint rules only see that
  bounded tail. This is a deliberate memory/latency bound and is documented.
- A compiled file above 4 MiB is ignored with a warning (fail-open, because an
  unreadable rule set cannot prove a prohibition).
- `hookBudgetMs` is not a performance SLA; it only drives the stderr notice.

---

## 6. P0-4 — Secrets persisted in cleartext

### Original reproduction A (structured fields)

```bash
echo '{"session_id":"s","tool_name":"mcp__db__query","tool_input":
 {"sql":"select 1","password":"hunter2hunter2","api_key":"plainvalue12345",
  "auth":{"token":"abcd1234efgh5678","secret":"zzzz9999yyyy8888"}}}' \
  | node .grudge/bin/grudge.mjs hook PostToolUse
cat .grudge/session/s.jsonl
```

Observed before the fix: every value appeared in cleartext in the stored JSONL.

### Original reproduction B (string shapes)

- `echo AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE` → `…=[REDACTED] KEY]` (the env
  rule fired first and left residue).
- `https://x.invalid/?api_key=supersecretvalue123&next=1` →
  `…?api_key: [REDACTED]&next=1` (the replacement injected `: ` and dropped the
  `=` separator).

### Root cause

`redactValue` recursed into objects but only transformed **string** values by
shape. A password or token stored under a credential-shaped key has no label in
its value, so it matched nothing. The labelled-value rule rewrote the separator
to `": "`, and rule order let the bare env rule run after the cloud-key rule had
already inserted a bracketed marker.

### Files changed

- `packages/grudge/src/core/redact.js` — `normalizeKey`, `isSensitiveKey`, and a
  two-layer `redactValue`: sensitive keys replace the value wholesale at any
  depth, then strings are scanned. Separator captured and re-emitted; labelled
  rule runs before the env rule.
- `grudge/recorder/redact.py` — the same two layers, plus `redact_jsonl`.
- `grudge/recorder/recorder.py` — `Recorder.close` redacts each record.
- `grudge/cli/capture.py` — output passes through `redact_jsonl`.
- `grudge/cli/shrink.py` — the dumped cassette passes through `redact_trace`.
- `spec/redaction-corpus.json` — 23 shared cases, including the exact audit
  payloads and the ` KEY]` residue case.
- `tests/test_shared_corpora.py`, `packages/grudge/test/remediation-regressions.test.js`
  — both runtimes assert the corpus and idempotency
  (`redact(expected) === expected`).

### Fix

Two layers run on every write, in both runtimes:

1. **Key-aware:** a value under `password`, `passwd`, `secret`, `token`,
   `access_token`, `refresh_token`, `api_key`, `apikey`, `client_secret`,
   `authorization`, `cookie`, `set-cookie`, `access_key`, `secret_key`,
   `private_key`, `credential(s)` becomes `[REDACTED]` at any depth. Key
   normalization handles `camelCase`, dashes, dots, and spaces, and matches
   whole segments, so `keyboard`/`monkey` are untouched.
2. **Value scanning:** private-key blocks, `Bearer`, provider key shapes,
   labelled values, bare `UPPER_CASE=` assignments, and `FAKE_KEY_`. The
   original `:`/`=` separator is preserved, so assignments and query strings
   stay valid and `AWS_ACCESS_KEY_ID=AKIA…` becomes one clean assignment.

Redaction is applied at the persistence choke points, not only in CLI output:
Node PostToolUse, Python `Recorder.close`, `grudge capture`, and `grudge shrink`.

### Regression test

- `packages/grudge/test/remediation-p0.test.js`:
  `P0-4: structured secrets are redacted before the session event is stored`
  (nested `headers`/`auth`/`config`, the exact audit payload, and the
  `echo AWS_ACCESS_KEY_ID=…` residue case).
- `tests/test_recorder.py`: `test_recorder_redacts_secrets_before_writing_the_trace`.
- `tests/test_redact.py`: `redact_jsonl` and structured-key tests.
- Shared corpus: 23 cases, asserted by both runtimes, plus idempotency.

### Command and actual result

```text
PASS  P0-4 structured secrets in session file  leaks=0
{"tool":"mcp","args":{"server":"db","tool":"query","args":{"sql":"select 1",
 "password":"[REDACTED]","api_key":"[REDACTED]","auth":{"token":"[REDACTED]"…
```

Parity sweep (generated label × separator × value-shape matrix, run against both
implementations):

```text
cases=1170 divergences=0
```

### Remaining limitations

- A secret that is neither under a credential-shaped key nor in a recognized
  shape is stored in cleartext. Redaction is conservative, not a complete
  secret scanner.
- Labelled-value scanning requires at least eight characters and stops at
  whitespace; a value containing a space is not fully masked by the label rule
  (the env rule may still catch a `KEY=…` assignment).
- Redaction is lossy and irreversible by design.
- Cassette **replay reads** are not redacted: redacting on read would make a
  live call and its replay disagree about the arguments a tool received.

---

## 7. P1-1 — Silent `cwd` mismatch and the legacy Stop file

### Original reproduction

- Install in `project`, send a PreToolUse payload whose `cwd` is another
  directory: exit 0 with no diagnostic, indistinguishable from "no rule
  matched".
- Run `hook Stop` and inspect `.grudge/`: before the fix the counter went to the
  legacy `.grudge/stats.json`, while every other counter used
  `.grudge/stats.jsonl`.

### Root cause

The handlers used `payload.cwd || process.cwd()` without validating or
reporting a mismatch (the same root cause as P0-1, with a diagnostic
requirement). `stop.js` read and wrote `stats.json` through the legacy
`readStats`/`updateStats` path instead of the append-only event log.

### Files changed

- `packages/grudge/src/core/roots.js` — warning text for a non-existing,
  non-path, or outside-install-root `cwd`.
- `packages/grudge/src/commands/hook.js` — always prefixes resolution warnings.
- `packages/grudge/src/hooks/stop.js` — appends `{"type":"stop"}` to
  `stats.jsonl`; the duplicate cursor counts only `catch` / `proposal` /
  `accepted`, so a repeated delivery stays silent and does not append a second
  stop marker.
- `docs/hooks.md` — Stop contract updated.

### Fix

An invalid or external `cwd` now produces a distinguishable stderr warning and
enforcement continues against the install root. Stop is an event in the same
append-only log as everything else; `stats.json` remains readable for old
installs but is never written by Stop.

### Regression test

`packages/grudge/test/remediation-p0.test.js`:

- `P1-1: Stop writes the append-only event log and leaves the legacy file alone`
  (first Stop appends one `stop` event; second Stop is silent and does not
  duplicate it).
- `P1-1: an invalid payload cwd warns instead of silently disabling enforcement`
  (missing directory and a non-string `cwd`; both still exit 2).

`packages/grudge/test/phase17-hooks.test.js` also asserts the Stop event and
the absence of `stats.json`.

### Command and actual result

```text
PASS  P1-1 Stop writes stats.jsonl only  stopEvent=true  legacyStats=false
```

```text
PASS  P1-1 invalid payload cwd warns  exit=2
      stderr: grudge: hook payload cwd '…\does-not-exist' is not an existing directory; ignored
```

### Remaining limitations

- `stop.js` still treats reporting as best effort; `reportSinceLast` can wait up
  to 30 s on a fresh lock. That path is off the enforcement path and is bounded
  by the existing stats lock, but it is not instant.
- Legacy `stats.json` is still read by aggregation for installs created before
  0.2.1; it is not migrated or deleted.

---

## 8. Cross-cutting validation

All commands below were run on the stated host on 2026-10-31.

### Repository suites

| Command | Result |
|---|---|
| `npm test` (`packages/grudge`) | **113 tests, 113 pass, 0 fail** |
| `python -m pytest -o addopts="" -q` | **321 passed, 1 skipped** |
| `python -m ruff check .` | `All checks passed!` (exit 0) |
| `python -m mypy .` (strict, per `pyproject.toml`) | `Success: no issues found in 126 source files` (exit 0) |
| `python -m scripts.docs_check` | `docs-check: 38 indexed, non-empty, linked documentation files` (exit 0) |
| `python -m scripts.release_check` | `release-check: local npm/PyPI metadata and published-version documentation agree` (exit 0) |

The Python suite grew from 319 to 321 passing tests: one new recorder
persistence test and one new JSONL redaction-helper test. The skipped test is
unchanged.

### Installed packages (outside the checkout)

| Step | Result |
|---|---|
| `python -m build --outdir D:\Temp\opencode\final-dist` | `grudge_cli-0.2.1-py3-none-any.whl` (132,122 B) + sdist (166,911 B) |
| Install wheel into a fresh venv | `grudge 0.2.1`; `grudge-engine --version` → `grudge 0.2.1` |
| 15 copied Python tests against the installed wheel | **15 passed** |
| `npm pack` | 50 files, 106,408 bytes |
| Install tarball into a clean npm project | `grudge 0.2.1`; `dist/grudge.mjs` is self-contained |
| 9 P0/P1 regression tests against the installed tarball (`GRUDGE_TEST_CLI`) | **9 pass, 0 fail** |
| `grudge doctor --json` (installed) | `ok: true`; 21/21 checks PASS, including `hook paths  absolute and present` |
| `grudge verify` (installed) | `PASS (10/10 checks)` |
| `grudge-engine demo --no-browser --fast --json` | vulnerable gate blocked, fixed path passed |
| `grudge-engine demo --guard --json` | `session1: leaked and proposed`, `session2: blocked` |

The installed-package regression run matters: it proves the shipped bundle
enforces, not just `src/`.

### Literal audit §13 reproductions

Executed with `node D:\Temp\opencode\audit-repro.mjs D:\Temp\opencode\final-npm-proj\node_modules\grudge-cli\dist\grudge.mjs`:

```text
PASS  P0-1 relative ../.grudge/bin/grudge.mjs from sub   exit=2
PASS  P0-1 registered absolute command from sub          exit=2
PASS  P0-1 payload cwd outside install root              exit=2  (+ warning)
PASS  P0-2 global rule from another project              exit=2
PASS  P0-3 hookBudgetMs=1 (414ms)                        exit=2  (+ fail-closed notice)
PASS  P0-4 structured secrets in session file            leaks=0
PASS  P1-1 Stop writes stats.jsonl only                  stopEvent=true  legacyStats=false
```

### Parity

```text
python D:\Temp\opencode\parity_sweep.py
cases=1170 divergences=0
```

### P2-3 incidental

```text
not-json       exit=0  grudge: project rules … are not a version 1 compiled file; ignored (fail-open)
version-99     exit=0  grudge: project rules … are not a version 1 compiled file; ignored (fail-open)
unknown-kind   exit=0  grudge: project rule "x" is invalid and was skipped
```

---

## 9. Findings outside this remediation

These were **not** part of the requested P0/P1 scope and are unchanged. They do
not affect the four enforcement guarantees above.

| ID | Finding | State |
|---|---|---|
| P2-1 | `grudge-engine doctor` / `verify` do not exist; README Quick start could imply they do | Node-only commands, unchanged |
| P2-2 | `demo --guard` needs `GRUDGE_NODE_RUNTIME` outside a checkout | Unchanged; works when set |
| P2-4 | Managed block says `must call <tool> before <tool>`; the parser requires `before call <tool>` | Unchanged |

---

## 10. Documentation updated with the code

- `docs/hooks.md` — absolute registration, root-resolution table, precedence,
  budget semantics, Stop event, measured timings.
- `docs/trust-model.md` — two-layer redaction, persistence choke points, the
  23-case corpus, the 1,170-case parity result.
- `README.md` — absolute hook command and global layering.

The audit documents (`docs/INDEPENDENT-PRODUCTION-AUDIT.md`,
`docs/AUDIT-TEST-MATRIX.md`) are preserved verbatim apart from required
documentation metadata; their findings and baseline results are not rewritten.

---

## 11. Residual risk and verdict

### Residual risk

- **No live Claude Code run.** `claude -p` on this host still returns
  `Not logged in · Please run /login`, so the remediation proves the JSON
  protocol and the installed runtime, not a live host session. This was also
  `BLOCKED` in the original audit and must be repeated by the re-auditor on a
  logged-in host.
- **No CI run of these changes.** The fixes are validated locally and against
  installed artifacts; CI has not executed them.
- The remaining limitations listed per finding (bounded session tail, global
  install binding to payload `cwd`, conservative redaction, and the three P2
  items) are unchanged and documented where they apply.

### Verdict

**READY FOR INDEPENDENT RE-AUDIT**

Every P0 finding and P1-1 from `docs/INDEPENDENT-PRODUCTION-AUDIT.md` was
reproduced, fixed at the enforcement or persistence boundary, covered by a
regression test, and re-verified against the installed wheel and npm tarball.
The verdict is not "production ready": the live Claude Code integration remains
untested because the host is not logged in, and that is the first thing the
re-auditor should verify.
