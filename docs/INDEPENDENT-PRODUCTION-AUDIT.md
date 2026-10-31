# Independent production audit — Grudge 0.2.1

**Purpose:** Independent, evidence-driven assessment of whether an ordinary developer can install Grudge, connect it to Claude Code, and trust its enforcement.
**Audience:** Repository owner, release engineer.
**Status:** Audit only. No production source was modified.
**Last updated (phase):** audit - 2026-10-31
**Date:** 2026-10-31
**Commit audited:** `a4788c0` (`chore: release 0.2.1`) on `remediation/production-readiness`, plus 5 uncommitted version-bump files.

---

## 1. Executive summary

**Verdict: NOT READY.**

Both packages install cleanly and every checked-in test passes. The Python
engine end-to-end workflow (capture → shrink → admit → compile → gate) works
from an installed wheel in an empty directory, and the Node Guard blocks,
allows, isolates sessions, and holds up under 25 concurrent matching calls.

Four defects break the product's central promise — *a rule you install stops
the tool call it names*:

1. **Enforcement silently switches itself off whenever the process working
   directory is not the install root.** Claude Code runs command hooks from the
   *current* directory, which follows `cd` and drifts into subdirectories
   (documented upstream issues anthropics/claude-code#32361, #50960). Grudge
   loads state from `payload.cwd || process.cwd()` and installs a bare-relative
   `node .grudge/bin/grudge.mjs`. From a subdirectory the module is not found
   and the hook exits **1**, which Claude Code treats as a non-blocking error:
   the tool call proceeds. If the module is found but the directory differs,
   the hook exits **0** and enforces nothing. No warning is emitted in either
   case.

2. **Global installs do not work at all.** `setup --scope global` writes rules
   to `~/.grudge/compiled.json` but registers hooks that resolve state against
   the *project* directory. Every hook in every project loads no rules — not an
   error, not a warning, just an exit 0 allow. The README advertises
   `--scope global` as "Claude Code for every project on this machine".

3. **A configurable budget can turn a known block into an allow.**
   `hookBudgetMs` races the *whole* state load, including the session history a
   taint rule needs. Setting it low (or having a large session log under a low
   budget) produces `hook time budget exceeded; allowed (fail-open)`, exit 0,
   for a call that matches a `block` rule. `docs/hooks.md` explicitly claims
   "A matching prohibited call can therefore never be turned into an allow by
   contention, a stale lock, a timeout". That claim is false.

4. **The recorder persists unstructured and structured secrets.** The
   documented redaction is a text scanner over *string values*. Raw string
   shapes have two reproducible holes (`AWS_SECRET_ACCESS_KEY=…`, `URL?api_key=…`),
   and structured secret fields (`"password": "…"`, `"api_key": "…"`,
   `"token": "…"`, nested `"auth": {"secret": "…"}`) are written to
   `.grudge/session/*.jsonl` **completely unredacted**. Redaction runs before
   persistence, so this is a durable local file with cleartext credentials.

Separately, `must call … before <tool>` cannot be typed as the README
documents: `must call read_file before http` is rejected by the parser and
needs `before call http`.

### What is solid

- Wheel, sdist, and npm tarball all build and install from scratch.
- The wheel contains all package data (`demo/e2e_guard.mjs`, 4 payloads,
  prompt resource, `scars/`, `examples/`); the installed CLI runs from an empty
  directory with zero dependence on the checkout.
- The npm tarball installs into a clean project and its CLI works; its bundle
  has no runtime npm imports (single self-contained `dist/grudge.mjs`).
- Cross-package integration works: the installed Python `demo --guard` uses the
  installed npm runtime and blocks the second session.
- 319 Python tests and 104 Node tests pass, matching the documented counts.
- All 25 concurrent matching PreToolUse calls were blocked (25/25).
- The hook JSON protocol (`hookSpecificOutput.permissionDecision: "deny"` on
  exit 2) matches the current published Claude Code hooks reference.
- Corrupt `compiled.json` cannot invent a match; it fails open with no block.
- `uninstall` restores `settings.json`/`CLAUDE.md` and removes all state.

---

## 2. Environment

| Item | Value |
|---|---|
| OS | Windows 11 Home Single Language, 10.0.26300 (x64) |
| Python | 3.14.0 (`>=3.11,<3.15` supported) |
| Node / npm | 25.2.1 / 11.21.1 (CI pins 18/20/22) |
| Git | 2.55.0.windows.5 |
| Claude Code | 2.1.283 (`C:\Users\kotes\AppData\Roaming\npm\claude`) |
| Branch / HEAD | `remediation/production-readiness` @ `a4788c0` |
| Working tree at start | 5 modified files (version bump 0.2.0 → 0.2.1 in npm `package.json`, `version.js`, `package-lock.json`, `README.md`, one test) |
| Isolated envs | 2 venvs + 1 npm project under `%TEMP%\grudge-audit` |
| Live Claude Code run | **BLOCKED** — `claude -p` returns `Not logged in · Please run /login` (custom `ANTHROPIC_BASE_URL`, no interactive session) |

Audit artifacts were confined to `%TEMP%\grudge-audit`. No repository source
file was edited by the audit.

---

## 3. Installation results

| Step | Command | Exit | Result |
|---|---|---:|---|
| Clean venv from source | `python -m pip install <repo>` | 0 | built + installed `grudge-cli 0.2.1`, 20 deps resolved |
| Build artifacts | `python -m build --outdir …` | 0 | `grudge_cli-0.2.1.tar.gz`, `-py3-none-any.whl` (130 KB) |
| Second venv | `pip install dist/*.whl` | 0 | clean install with deps |
| Installed CLI | `grudge-engine --version` | 0 | `grudge 0.2.1` |
| Installed CLI | `grudge-engine --help` | 0 | 8 commands listed |
| Installed CLI | `grudge-engine doctor` | **2** | `No such command 'doctor'` — see P2-1 |
| Installed CLI | `grudge-engine verify` | **2** | `No such command 'verify'` — see P2-1 |
| Installed demo | `grudge-engine demo --no-browser --fast --json` | 0 | vulnerable gate BLOCKED, fixed gate passed, runs outside the repo |
| Installed demo | `grudge-engine demo --guard --json` | **2** | fails without a Node runtime — README documents the env var, but the bare command in Quick start does not work standalone (P2-2) |
| Node build | `npm run build` | 0 | `dist/grudge.mjs` (169 KB), 0 external imports |
| npm pack | `npm pack` | 0 | `grudge-cli-0.2.1.tgz`, 48 files, 93.2 KB |
| npm install (clean) | `npm install <tgz>` | 0 | 1 package, `0 vulnerabilities` |
| Installed npm CLI | `grudge --version` / `--help` | 0 | `grudge 0.2.1`, full command list |
| Installed npm CLI | `grudge doctor` | 0 | `1 passed, 0 failed, 0 warnings` |
| Installed npm CLI | `grudge verify` | 0 | **PASS (10/10)** |
| Cross-package | `GRUDGE_NODE_RUNTIME=<installed npm> grudge-engine demo --guard --json` | 0 | `ok: true`, `session2: "blocked"` |

**Wheel contents (verified from the zip):** `grudge/demo/e2e_guard.mjs`, four
`grudge/demo/payloads/leak-session/*.json`, `grudge/predicates/prompts/synthesize.md`,
`scars/sample_leak.scar.json`, `examples/leaky_agent/**`. Nothing resolves to
the checkout.

---

## 4. Functional test results

| Suite | Command | Result |
|---|---|---|
| Python | `python -m pytest` | **319 passed, 1 skipped**, exit 0 (30.9 s) |
| Ruff | `python -m ruff check .` | All checks passed, exit 0 |
| mypy (strict) | `python -m mypy .` | 126 files, no issues, exit 0 |
| Docs check | `python -m scripts.docs_check` | 34 indexed files, exit 0 |
| Release check | `python -m scripts.release_check` | metadata agree, exit 0 |
| Node | `npm test` | **104 tests, 104 pass, 0 fail**, exit 0 (74 s) |
| npm audit | `npm audit` | 0 vulnerabilities |
| pip-audit | `pip-audit` in package venv | only the venv's own bundled `pip 25.2` (6 advisories); none of Grudge's 20 declared dependencies |

The counts match `Progress.md` (319 → 104). No stale test-count claim found.

---

## 5. Guard behaviour (black-box)

All probes used the **installed npm package's** runtime inside temporary
projects under `%TEMP%`, with real Claude Code payload shapes.

| Behaviour | Probe | Result |
|---|---|---|
| Capture + propose + accept + block | full two-session leak flow | PASS — PreToolUse exit 2, deny JSON, reason on stderr |
| `never call …` call_shape | `rm -rf` rule | PASS — match exit 2, non-match exit 0 |
| `must call … before call …` ordering | ordering rule | PASS — no prior read exit 2; after read exit 0 |
| Taint flow + session isolation | read → http in same session / another session | PASS — blocked in same session (2), allowed in a fresh session (0) |
| Duplicate delivery | same payload twice back-to-back | PASS — both exit 2 |
| Path matching | Windows `C:\…\secret.txt`, POSIX `/home/…`, relative | PASS — all blocked |
| Malformed / empty / array / unknown-event input | stdin variants | PASS — fail open, exit 0, warning on stderr |
| `GRUDGE_DISABLE=1` | env kill-switch | PASS — exit 0 |
| Corrupt `compiled.json` | `not-json` | PASS (safe) — exit 0, cannot invent a match |
| Missing `compiled.json` | renamed | PASS — exit 0 |
| Corrupt / wrong-version rules silently disable enforcement | `version: 99` or unknown `kind` | **FAIL** — exit 0, no stderr warning (P2-3) |
| Session isolation of the state file | hostile `session_id` `../../../etc/passwd-test` | PASS — skipped, nothing written |
| Uninstall | `grudge uninstall` | PASS — settings/CLAUDE.md restored, `.grudge/` removed |
| **Subdirectory execution** | `cd sub && node .grudge/bin/grudge.mjs hook PreToolUse` | **FAIL** — `Cannot find module`, exit **1** (Claude Code: non-blocking → allowed) (P0-1) |
| **Payload cwd ≠ install root** | rules in `bb1`, payload `cwd` elsewhere | **FAIL** — exit 0, rules skipped silently (P0-1) |
| **Global scope** | `--scope global`, then hook from another project | **FAIL** — exit 0; rules in `~/.grudge` are never consulted (P0-2) |
| **Budget forces allow** | `hookBudgetMs: 1` with a matching block rule | **FAIL** — `budget exceeded; allowed`, exit 0 (P0-3) |

---

## 6. Claude Code integration

**Protocol-level: PASS.** Verified against the live hooks reference
(<https://code.claude.com/docs/en/hooks>, fetched during this audit):

- PreToolUse deny is emitted as `hookSpecificOutput.permissionDecision: "deny"`
  with a reason and exit **2** — matches the documented contract exactly.
- Exit 2 blocks even when stdout JSON cannot be parsed, which is what the
  reference states; the JSON is used for the reason.
- `matcher: "*"` matches all tools. `timeout` is not set, so the Claude Code
  default (600 s for command hooks) applies — acceptable.
- Stop uses the documented top-level `systemMessage`.
- SessionStart / UserPromptSubmit outputs are valid.

**Live end-to-end: BLOCKED.** `claude -p` in a prepared temp project returned
`Not logged in · Please run /login`. No live tool call was executed. Do not
read the PASS above as proof of live integration.

**Registration-level: PASS except for the hook path (P0-1).**

- `setup` registers all five events; `hook PostToolUse` resolves through the
  alias table to `post-tool-use` and correctly captures a real payload into
  `.grudge/session/<id>.jsonl` (verified: run from the repo-relative install,
  the event and its redacted result were written).
- Session capture → `propose` works. A proposal that would fire on the
  control session is correctly refused as over-broad; that is the safety check
  working, not a defect.
- The only integration-level failure is P0-1 (hook path), below.

---

## 7. Security findings

### P0-3 — A configured budget can convert a known block into an allow

- **Files:** `packages/grudge/src/hooks/pre-tool-use.js:115-135` (`withBudget` over `loadState`), `packages/grudge/src/core/config.js` (`hookBudgetMs`).
- **Repro:** install, add a block rule, set `.grudge/config.json` `"hookBudgetMs": 1`, send a matching PreToolUse payload.
- **Actual:** `grudge: hook time budget exceeded; allowed (fail-open)`, exit 0.
- **Expected (per `docs/hooks.md`):** deny cannot be produced by a timeout.
- **Why it happens:** the budget wraps reading session history — unbounded file reads that a taint rule needs. With the 500-call cap and 4 KiB result cap that is ~20 MB worst case, well beyond a low budget.
- **Blocks release:** yes, until either the budget is raised above worst case, or the budget only covers opening the files (not the read), or a matching call is re-checked synchronously after a timeout.

### P0-4 — Secrets persisted in cleartext (redaction scope holes)

- **Files:** `packages/grudge/src/core/redact.js`, `grudge/recorder/redact.py`, consumed by `packages/grudge/src/hooks/post-tool-use.js:43-45`.
- **Repro A (structured secrets, no regex needed):**
  ```json
  {"session_id":"s","tool_name":"mcp__db__query","tool_input":
   {"sql":"select 1","password":"hunter2hunter2","api_key":"plainvalue12345",
    "auth":{"token":"abcd1234efgh5678","secret":"zzzz9999yyyy8888"}}}
  ```
  The stored `.grudge/session/s.jsonl` contains every value in cleartext.
- **Repro B (string shapes):**
  - `AWS_SECRET_ACCESS_KEY=abcdefghijklmnop1234` → `AWS_SECRET_ACCESS_KEY=[REDACTED]`
    (the value is correctly redacted, but the mangling below shows the rule is
    brittle).
  - `echo AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE` → `…=[REDACTED] KEY]` — the
    env rule fires before the cloud-key rule and leaves ` KEY]` behind.
  - `https://x.invalid/?api_key=supersecretvalue123&next=1` →
    `…?api_key: [REDACTED]&next=1` — the replacement injects `: ` into a URL
    query string. This is both a leak (the key is replaced, good) and a
    corruption of the recorded value. Python and Node produce identical output,
    so the shared corpus proves *agreement*, not *correctness*.
- **Impact:** `.grudge/session/` lives in the working tree (gitignored, not
  encrypted). Any tool that records a password/token inside structured args
  writes it to disk. This contradicts `docs/trust-model.md` ("recursively
  redacted before persistence").
- **Blocks release:** yes for the structured case. The string-shape issues are
  P2 quality defects; the structured case is a P1/P0 leak.

### Filesystem

- Path traversal via `session_id` is blocked (returns no events / skips write).
- Writes are atomic where it matters (`writeJsonAtomic` via temp + rename).
- `uninstall` restores user files it changed and removes only its own state.
- No unsafe permissions, no shell-command construction from user input found.

### Dependency supply chain

- Node: `npm audit` 0 vulnerabilities in the installed tarball.
- Python: the declared dependencies are clean; `pip-audit` flags only the
  bootstrap `pip` inside the test venv (not a Grudge dependency).
- No network, telemetry, or model call in capture (confirmed by inspection).

---

## 8. Performance

Measured on this host (Windows 11, Node 25.2.1). End-to-end = a fresh
`node grudge.mjs hook PreToolUse` process per call, timed with
`performance.now()` around `spawnSync`.

| Case | p50 | p95 | max | Exit |
|---|---:|---:|---:|---:|
| Empty rules (installed runtime) | 164–216 ms | 218–252 ms | — | 0 |
| Matching block rule | 206 ms | 302 ms | 302 ms | 2 |
| Non-matching call | 158 ms | 210 ms | 210 ms | 0 |
| 500-event session history | 289 ms | — | 487 ms | 2 |
| ~20 MB session log (40 × 500 KB) | 435 ms | — | 620 ms | 0 |
| 25 concurrent matching calls | 993 ms | 1 299 ms | 1 329 ms | 25×2 |

The 0.2.0 → 0.2.1 remediation is real: ~1.8 s per call became ~160–210 ms.
The 25-concurrent case is slower in wall-clock because 25 Node processes start
at once on this machine; **all 25 were still blocked**. No fail-open was
observed under concurrency, but a low configured budget reintroduces it
deterministically (P0-3).

---

## 9. Cross-platform compatibility

- Path matching (case, separators, POSIX/Windows/relative) is correct on this
  Windows host and covered by shared conformance fixtures.
- CI matrix covers ubuntu/macos/windows × Python 3.11/3.14 and Node 18/20/22,
  plus a package job that installs wheel + tarball outside the checkout and
  proves `demo --guard` blocks. This matches what I reproduced locally.
- Hook path resolution (P0-1) is a cross-platform failure: it depends on CWD
  semantics, not OS, so it affects all three platforms.

---

## 10. Documentation review

| Claim | Location | Status |
|---|---|---|
| `--scope global` protects every project | README §Choose agents | **FALSE** (P0-2) |
| "A matching prohibited call can never be turned into an allow by … a timeout" | `docs/hooks.md` §Enforcement failure policy | **FALSE** (P0-3) |
| Values are "recursively redacted before persistence" | `docs/trust-model.md` | **FALSE** for structured secret fields (P0-4) |
| `must call <tool> before <tool>` | README §What Grudge writes / managed block | **MISLEADING** — parser requires `before call <tool>` (P2-4) |
| `grudge doctor` / `grudge verify` exist on the Python CLI | README Quick start ambiguity | The Node CLI has them; the Python `grudge-engine` does not (P2-1) |
| PostToolUse captured; Stop "updates legacy stop bookkeeping" | `docs/hooks.md` | Capture works; Stop reads the legacy `stats.json` path (P1-1, low impact) |
| Test counts 319 / 104 | `Progress.md` | Accurate |
| `demo --guard` works from the wheel | README §3 | Requires `GRUDGE_NODE_RUNTIME` / `--node-runtime`; works when set |

---

## 11. CI assessment

`.github/workflows/grudge-guard.yml`:

- Runs `pytest`, `ruff`, `mypy`, docs/release checks, `npm ci && npm test`,
  and `npm pack --dry-run` on ubuntu/macos/windows × Python 3.11/3.14.
- A separate Node matrix runs the Node suite on 18/20/22.
- A `package` job builds the wheel, installs it into a clean venv, packs and
  installs the npm tarball, and asserts `demo --guard` blocks from the
  installed packages (including `import grudge; pathlib…/e2e_guard.mjs`).
- CI does **not** exercise a real Claude Code hook run, nor the subdirectory /
  payload-cwd / global-scope cases that this audit found broken.

No CI change was made.

---

## 12. Prioritized findings

| ID | Severity | Finding | Blocks release |
|---|---|---|---|
| P0-1 | Critical | Hook path is CWD-relative; from any subdirectory (or after `cd`) enforcement is off — exit 1 (missing module) or exit 0 (wrong root), no warning | Yes |
| P0-2 | Critical | `--scope global` installs rules to `~/.grudge` but hooks never read them from projects; global protection is a no-op | Yes |
| P0-3 | Critical | `hookBudgetMs` timeout on a matching `block` rule yields "allowed (fail-open)" — a configured budget can disable enforcement | Yes |
| P0-4 | Critical | Structured secret fields persisted in cleartext; string-shape redaction leaves residue and corrupts URLs | Yes (structured case) |
| P1-1 | High | Hook enforcement is disabled on any `cwd` mismatch without a warning — operators cannot tell it is off (same root cause as P0-1, separate remediation: warn/exit 2). `stop.js` also reads the legacy `.grudge/stats.json` rather than `stats.jsonl` | Yes |
| P2-1 | Medium | `grudge-engine doctor` / `verify` do not exist; README Quick start implies they do | No |
| P2-2 | Medium | `demo --guard` needs `GRUDGE_NODE_RUNTIME` outside a checkout; README's bare command fails | No |
| P2-3 | Medium | Corrupt / wrong-version `compiled.json` silently disables all rules with no stderr warning | No |
| P2-4 | Medium | `must call <tool> before <tool>` in README/managed block does not parse; needs `before call <tool>` | No |
| P3-1 | Low | Redaction replacement injects `: ` into query strings (`?api_key: [REDACTED]`) and leaves ` KEY]`; cosmetic but makes logs harder to read | No |

**P0 count: 4. P1 count: 1.**

---

## 13. Reproduction commands

Run from a temp directory outside the repository.

```bash
# Python install + artifacts
python -m venv venv && ./venv/Scripts/python -m pip install C:/path/to/Grudge
./venv/Scripts/python -m build --outdir dist
./venv/Scripts/python -m pip install dist/grudge_cli-0.2.1-py3-none-any.whl

# Node install
npm --prefix packages/grudge run build && npm --prefix packages/grudge pack
mkdir project && cd project && npm init -y && npm install <tgz>
./node_modules/.bin/grudge verify

# P0-1: subdirectory
cd project/sub && echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}' \
  | node ../.grudge/bin/grudge.mjs hook PreToolUse ; echo "exit=$?"   # 1

# P0-2: global
HOME=$TMP/fakehome node dist/grudge.mjs setup --yes --agents claude-code --scope global
cd $TMP/otherproj && echo '{...}' | node $TMP/fakehome/.grudge/bin/grudge.mjs hook PreToolUse
# exit 0 — global rules not consulted

# P0-3: budget
python -c "import json;c=json.load(open('.grudge/config.json'));c['hookBudgetMs']=1;json.dump(c,open('.grudge/config.json','w'))"
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}' | node .grudge/bin/grudge.mjs hook PreToolUse
# "hook time budget exceeded; allowed (fail-open)" exit 0

# P0-4: structured secrets
echo '{"session_id":"s","tool_name":"mcp__db__query","tool_input":{"password":"hunter2hunter2","api_key":"plainvalue12345","auth":{"token":"abcd1234efgh5678"}}}' \
  | node .grudge/bin/grudge.mjs hook PostToolUse
cat .grudge/session/s.jsonl   # values in cleartext

# P1-1: silent cwd-mismatch allow
# (same fix surface as P0-1; add a warning/exit 2 when the install root differs)
```

---

## 14. Release blockers

1. **P0-1** — register hooks with an absolute or `${CLAUDE_PROJECT_DIR}`-based
   path, and resolve state from the install root (or the payload `cwd` only
   after confirming it is inside the install root).
2. **P0-2** — either make global scope layer `~/.grudge/compiled.json` under
   the project state, or remove the global-scope claim and the option.
3. **P0-3** — never let the budget wrap a read that can determine a block; or
   re-evaluate synchronously after a timeout; or document a hard minimum.
4. **P0-4** — redact by key name in addition to by value, and fix the
   env-vs-cloud ordering and the `: ` injection in query strings.
5. **P1-1** — when the install root differs from the resolved state root,
   warn on stderr instead of allowing silently; repoint `stop.js` at
   `stats.jsonl`.

---

## 15. Recommended next steps

1. Fix P0-1 first — it is the difference between "Guard installed" and "Guard
   actually enforcing" for any developer who ever `cd`s.
2. Add an integration test that runs the *installed* hook from a subdirectory
   and from a payload-cwd outside the repo, and one that asserts a global
   install blocks in a second project.
3. Make every fail-open path print a distinguishable warning and, for a
   configured budget, treat it as an operator error rather than a silent allow.
4. Extend redaction to structured secret keys and add corpus cases for
   `AWS_SECRET_ACCESS_KEY=`, query-string `api_key=`, nested `token`, and
   URL-with-`: `-injected output.
5. Re-run this audit's black-box matrix against a live Claude Code login before
   calling the integration "verified".

---

## 16. Final verdict

**NOT READY.**

The packages install and the tests pass, but the four P0 findings each defeat
the enforcement guarantee in an ordinary workflow: any `cd`, a global install,
a low budget, or a secret in a structured argument. Until P0-1 and P0-2 are
fixed, a developer cannot trust that an installed rule is actually consulted;
until P0-3 and P0-4 are fixed, "deterministic enforcement" and "redaction before
persistence" are both false in measurable ways. A CONDITIONALLY READY verdict
would require at minimum a working live-integration proof, which this audit
could not perform because the host was not logged in.
