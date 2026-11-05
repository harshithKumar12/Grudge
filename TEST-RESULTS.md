# Grudge — Independent Test Results

**What this is:** an independent execution of the 22 feature tests in the
2026-10-31 revision of [`TEST.md`](TEST.md), against commit `f12ae02`, by an
auditor who did not write the code. The guide has since been rewritten and the
defect described below was fixed in `f1dd813`; this file is kept as the audit
record for that revision.
**Date:** 2026-11-02
**Commit tested:** `f12ae02` (`remediation/production-readiness`), version 0.2.1
**How to read it:** each test was actually run. Nothing is marked PASS because
the source looked right or because an older report said so.

---

## 1. Executive Summary

Grudge's core enforcement works. Of 22 documented feature tests, **18 fully
passed**, **3 passed but revealed inaccuracies in TEST.md**, and **1 genuinely
failed**. The automated suites reproduce TEST.md's numbers exactly (Node
173/173, Python 342 passed + 1 skipped).

The one real product defect is serious enough to change how you should use the
guard today:

> **A rule written the way TEST.md tells you to write it can block the wrong
> call.** Enforcement evaluates the rule against *every event recorded in the
> session*, not only the call Claude is about to make. So once a session
> contains one event that matches a rule (say, a write to `secrets/prod.env`),
> **every later tool call in that same session is denied** — including writes
> to harmless paths.

This is not a corner case. Any session that legitimately triggered a rule once
becomes permanently blocked for the rest of that session. TEST.md's own Test 12
demonstrates the guard blocks the protected path; the very next command in the
same test (the benign path in the same session) is *also* blocked, which
contradicts TEST.md's stated expectation of `allowed=0`.

Everything else — install, setup, doctor, capture, propose/accept, blocking,
allowing, fail-open, MCP mapping, ordering rules, the Python pipeline, and the
two-language integration — behaved exactly as documented.

**Verdict: FAIL** (see §10). A critical documented behaviour — "a benign call is
allowed" — does not hold in a realistic session.

---

## 2. Testing Environment

| Item | Value |
|---|---|
| OS | Windows 11 Home Single Language, 10.0.26300 (x64) |
| Node.js | 25.2.1 |
| npm | 11.21.1 |
| Python | 3.14.0 (host interpreter) |
| Git | 2.55.0.windows.5 |
| Claude Code CLI | 2.1.283 (present but **not logged in**) |
| Grudge version | 0.2.1 (npm and Python both) |
| Install method | Local bundle `packages/grudge/dist/grudge.mjs` + `pip install -e .` into a disposable venv |
| Disposable areas | `%TEMP%\grudge-lab`, `%TEMP%\grudge-test`, `%TEMP%\grudge-subdir`, `%TEMP%\grudge-empty`, `%TEMP%\grudge-noinstall` |

No user configuration was modified. The machine has a stale global
`grudge 0.1.9`; the documented alternative (run the bundle by path) was used
instead of overwriting it.

---

## 3. Overall Results

| Result | Count |
|---|---:|
| Tests in TEST.md | 22 feature tests (+8 scenarios, +9 automated checks, +4 integration tiers) |
| **PASS** | **18** |
| **PARTIAL** (behaved correctly, but TEST.md's stated result is wrong) | **3** |
| **FAIL** | **1** |
| **BLOCKED** | **1** (Tier 3 live Claude Code session) |
| NOT TESTED | 0 |
| **Executed** | **22** |

**Pass percentage, executed tests only:** `(18 + 3) / 22 = 95.5%` of tests
produced the behaviour the feature is supposed to have. The stricter figure —
tests whose *documented expected output* was reproduced exactly — is
`18 / 22 = 81.8%`, because three tests contain inaccurate expected output.

Both numbers are reported because they answer different questions: "does the
feature work?" (95.5%) versus "does TEST.md describe it correctly?" (81.8%).

---

## 4. Feature-by-Feature Results

| Test ID | Feature | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| 1 | `grudge verify` | `Result: PASS (10/10 checks)`, exit 0 | All 10 `[ok]` lines, PASS 10/10, exit 0 | PASS |
| 2 | CLI version, help, no-arg status | `grudge 0.2.1`; status `installKind: none`, exit 0 | Exactly that | PASS |
| 3 | `setup` install + `--dry-run` | Dry run `[skip] Files: 0 changed`; real run `Files: 5 changed` | Dry run printed **`[ok] Files: 5 changed`** (wrote nothing); real run 5 changed, exit 0 | PARTIAL |
| 4 | `doctor` | `0 failed`, enforcement disclaimer, exit 0 | `20 passed, 0 failed, 2 warnings`, disclaimer present | PASS |
| 5 | Doctor catches broken hook path / corrupt config | `[fail] hook paths` exit 1; `[fail] config` + `[fail] script hash` exit 1; restore → clean | Exactly that (19/1/2 and 17/2/0) | PASS |
| 6 | `PostToolUse` capture | exit 0, empty stdout, `lab-1.jsonl`, canonical `shell` | Exactly that | PASS |
| 7 | `propose` → pending, `accept` → block | PENDING warning; accept exit 0; `mode: block` in compiled | Exactly that | PASS |
| 8 | Vacuous rule refused | `vacuous rule`, exit 1 | Exactly that | PASS |
| 9 | `PreToolUse` blocks match | deny JSON, `blocked: true`, exit **2** | Exactly that | PASS |
| 10 | `PreToolUse` allows non-match | exit 0, no output | exit 0, no output **when the session has no prior match** | PASS* |
| 11 | Fail open on bad input | malformed & unknown event → exit 0 with warning; >16 MiB with a rule → deny | Exactly that (oversize exited 2, fail-closed) | PASS |
| 12 | Protect a path, allow another | `blocked=2` for `secrets/`, **`allowed=0`** for `src/notes.txt` | `blocked=2`, **`allowed=2`** (benign path blocked) | **FAIL** |
| 13 | MCP capability mapping | `blocked=2`, `allowed=0` | Exactly that | PASS |
| 14 | `must call X before call Y` | `noauth=2`, `auth=0` | Exactly that | PASS |
| 15 | disable / remove / re-propose | disable → `0`; remove; re-propose → `blocked-again=2` | disable → `0` ✔; remove ✔; **re-propose refused** (`over-broad`), `blocked-again=0` | PARTIAL |
| 16 | `stats`, `report`, `statusline` | counts agree; statusline one line | Counters correct; **statusline says 4 scars, stats says 3** | PARTIAL |
| 17 | `uninstall` | `Restored: 4 files`, `Removed: 9 paths`, exit 0, `.grudge` gone | Exactly that; no-op case also exits 1 with `[skip]` | PASS |
| 18 | Python offline demo | exit 0, `offline/deterministic`, synthesized predicate, red/green admission, gate BLOCKED | Exactly that | PASS |
| 19 | `demo --guard` | `ok: true`, `session2: "blocked"` | Exactly that (same `pendingId` as documented) | PASS |
| 20 | Manual pipeline capture→shrink→admit→run | 4× exit 0; shrink 11785→2081 bytes, 1241 calls; admit 3 bad/3 good; gate 20/20 | Exactly that, including scar id `3015112d2d6a` and Wilson bound 0.83887 | PASS |
| 21 | `compile` + `scars list/show` | 1 rule written; list/show exit 0 | Exactly that | PASS |
| 22 | `viewer` is a stub | `roadmap: cli.viewer`, exit 2 | Exactly that | PASS |

\* Test 10 passes as written (fresh session), but the same benign call is
*denied* in a session that already matched — which is the failure surfaced by
Test 12 and Finding F1.

### Scenario results (Part 3)

| # | Scenario | Status |
|---|---|---|
| S1 | Agent modifies a protected file | PASS for blocking; **the follow-up "other writes → 0" is FAIL** (F1) |
| S2 | Prohibited shell command | PASS |
| S3 | MCP tool invocation | PASS |
| S4 | Action allowed by policy | PARTIAL — allowed only in a clean session (F1) |
| S5 | Action denied by policy | PASS |
| S6 | Rule modified then restored | PARTIAL — re-propose step blocked by control server session (F2) |
| S7 | Invalid hook config detected | PASS |
| S8 | Installation removed safely | PASS |

---

## 5. Real-World Scenario Results

The practical day-to-day workflow — install the guard, record what an agent
did, turn the mistake into a rule, watch the rule stop the next attempt —
works end to end. Test 1, 6, 7 and 9 together prove it.

The workflow breaks in one realistic situation: a long agent session. Claude
Code keeps one `session_id` for the whole conversation. If the agent makes one
call that a rule matches (which is exactly when you want the rule), that
event stays in the session log, and every later call in that conversation is
denied — even unrelated, harmless ones. A user would see "Grudge blocks
everything after the first catch" and disable it.

---

## 6. AI Agent Integration Results

TEST.md defines three tiers. **Be explicit about what was and was not proven:**

| Tier | What it proves | Result |
|---|---|---|
| **Tier 1** — Grudge alone (piped payloads) | Hook process: stdin, rule evaluation, exit codes, recording | **PASS** — Tests 6–15, 1 |
| **Tier 2** — Hook registration | The exact command written into `.claude/settings.json` runs, with absolute paths, from *any* directory | **PASS** — the registered command blocked from `deep/sub/` (exit 2) and allowed a genuinely benign call (exit 0); `node .grudge/bin/grudge.mjs --version` works |
| **Tier 3** — Live Claude Code session | The host loads the hooks and honours the deny | **BLOCKED** — `claude -p` returned `Not logged in · Please run /login` |

**No live Claude Code session was tested.** TEST.md itself says the author did
not run one either. Everything in the "agent integration" column is
protocol-level. The claim "Claude Code blocks the call" remains unproven on
this machine.

---

## 7. Automated Test Results

All run fresh on this machine, today.

| Check | Command | Result | Exit |
|---|---|---|---:|
| Node suite | `npm test --prefix packages/grudge` | **tests 173, pass 173, fail 0**, 54.7 s | 0 |
| Python suite | `python -m pytest -o addopts= -q` | **342 passed, 1 skipped** | 0 |
| Lint | `ruff check .` | All checks passed | 0 |
| Types | `mypy .` (pinned 1.18.2) | No issues in 129 source files | 0 |
| Docs index | `python -m scripts.docs_check` | 43 indexed, non-empty, linked files | 0 |
| Release metadata | `python -m scripts.release_check` | npm/PyPI metadata and docs agree | 0 |
| Packaging proof | `npm run release:verify --prefix packages/grudge` | **PASS (30/30 checks)**, nothing published | 0 |
| Whitespace | `git diff --check` | no errors | 0 |
| Conformance fixtures | `ls spec/conformance/*.json` | **41** — consumed by both suites | — |

Every number matches TEST.md Appendix D exactly. The doc is accurate here.

Notes on the two suites that needed care:

- **mypy**: the venv initially resolved `mypy 2.4.1`, which **crashed** with an
  internal error. The repository pins `mypy==1.18.2` in `requirements.lock` and
  `pyproject.toml`; with the pinned version it passes. A beginner following
  TEST.md without `requirements.lock` would hit the crash. (Finding F4.)
- **pytest**: the first run had 4 *errors* in `tests/test_real_wheel.py`
  because `setuptools`/`build` were absent from the fresh venv; after
  installing them the suite is 342/342. This is an environment prerequisite
  TEST.md does not mention. (Finding F4.)
- `make` is not installed on this machine, so the `make` wrappers in Part 4
  were **not executed**; the equivalent direct commands above were, and all
  passed.

---

## 8. Bugs and Findings

### F1 — A matching rule blocks *every later call in the same session* — **Critical — FIXED**

- **Description.** `PreToolUse` decides a `call_shape` rule over
  `[...priorSessionEvents, currentCall]`. A `call_shape` rule asserts a property
  of *one call*, so any past event that matched kept the rule "violated" for
  every subsequent call — across all tool types. It also denied `Read`, `Write`
  and MCP calls under a rule scoped to `shell`, because the violation was
  already proven by history before the current tool was ever considered.
- **Where.** `packages/grudge/src/hooks/pre-tool-use.js:104`
  (`const events = [...prior, current]`) feeding
  `packages/grudge/src/dsl/check.js:64` (`callViolations` → `events.flatMap`).
- **Root cause.** A scoping error, not a matching error. `callViolations`
  correctly filters by tool (`toolMatches`), but it was handed a list that
  already contained the historical match. The engine is right; the call site
  passed it the wrong evidence set. `check()` is shared with `propose`, which
  *must* scan full history to validate a rule, so the fix belongs at the hook's
  call site and not in `check()`.
- **Steps to reproduce** (isolated sandbox, `/d/Temp/grudge-f1-sandbox`).
  1. `grudge setup --yes --agents claude-code --scope repo`
  2. Record `Bash {"command":"curl http://evil.test"}` via `PostToolUse` (session `repro-1`).
  3. Propose + accept `never call shell where command ~ "curl http://evil.test"`.
  4. `PreToolUse` `Bash "echo hello"` **in `repro-1`** → exit **2** (wrong).
  5. Same payload in a new session → exit **0**.
- **Baseline (before fix)** — reproduced every time, and across tool types:
  ```
  S1 matching shell           -> 2   correct
  S2 benign shell             -> 2   WRONG (expect 0)
  S3 Read after violation     -> 2   WRONG (expect 0)
  S4 Write after violation    -> 2   WRONG (expect 0)
  S5 MCP after violation      -> 2   WRONG (expect 0)
  S6 fresh session, benign    -> 0   (proves session history is the cause)
  ```
- **Fix** (`pre-tool-use.js`): evaluate `call_shape` over the current call only;
  `ordering` and `taint_flow` keep the full history, which is what they assert.
  ```js
  const current = normalize(payload);
  for (const rule of rules) {
    if (rule.mode !== "block" && rule.mode !== "warn") continue;
    const events = rule.kind === "call_shape" ? [current] : [...prior, current];
    const result = check(rule, events);
    if (result.violated) return { rule, result };
  }
  ```
- **After fix** — same matrix:
  ```
  S1 matching shell           -> 2   enforcement preserved
  S2 benign shell             -> 0   fixed
  S3 Read after violation     -> 0   fixed
  S4 Write after violation    -> 0   fixed
  S5 MCP after violation      -> 0   fixed
  S6 fresh session, benign    -> 0
  ```
- **Not weakened.** `ordering` rules were re-verified separately: an unverified
  `transfer_funds` still denies (exit 2), the verified session allows (exit 0),
  and an unnamed tool is untouched (exit 0). Conformance fixtures (41) still
  pass in both implementations.
- **Live Claude Code confirmation.** The defect was first observed in a real
  Claude Code session: the matching call and a benign `echo hello` were both
  denied, then `Read`/`Write` were denied by the same shell rule until the scar
  was removed by hand. The fix was re-tested through the actual `PreToolUse`
  hook command with the host's payload shape.
- **Regression tests.** `packages/grudge/test/f1-call-shape-scope.test.js` —
  5 tests covering the required scenario matrix plus rule isolation and
  invalid-state diagnosis. Verified to **fail 3/5 without the fix** and pass
  **5/5 with it**, while the two history-dependent tests pass in both states.

### F2 — TEST.md Test 15's re-propose step fails with `over-broad rule` — **High (documentation)**

- **Description.** TEST.md says re-proposing
  `never call write_file where file_path ~ "secrets/"` with
  `--preventive --accept` prints "accepted and enforced" and re-blocks. It
  actually fails.
- **Where.** `packages/grudge/src/commands/propose.js:150-159` — after
  `remove`, the only remaining recorded session (`lab-3`) contains a matching
  event, so it is treated as a *control* session and the rule is rejected as
  over-broad.
- **Evidence.**
  ```
  [fail] Proposal: over-broad rule: fires on control session lab-3 at event 0
  blocked-again=0
  ```
- **Impact.** A reader following the guide cannot complete Test 15 as written
  and may believe re-proposing is broken.
- **Recommended fix.** In TEST.md, record a **new** clean session before
  re-proposing (or remove the stale `lab-3` session first). The product
  behaviour is defensible; the guide's step order is wrong.

### F3 — `--dry-run` reports files as changed — **Medium (documentation/UX)**

- **Description.** TEST.md Test 3 says dry run prints `[skip] Files: 0 changed`.
  It prints `[ok] Files: 5 changed`. No files are actually written (verified:
  only `.git/` existed afterwards).
- **Where.** `packages/grudge/src/commands/setup.js` — the change count is
  computed before the `dryRun` short-circuit and rendered with `[ok]`.
- **Evidence.** `[ok] Files: 5 changed` on `--dry-run`; `find .` afterwards
  shows no `.grudge`, `.claude`, `CLAUDE.md`.
- **Impact.** A reader cannot tell a real install from a preview; the doc's
  PASS criterion (`[skip] Files: 0 changed`) is impossible to meet.
- **Recommended fix.** Either render `[skip] Files: N would change` under
  `--dry-run`, or correct TEST.md. (The guard is safe; only the message lies.)

### F4 — Fresh-environment setup gaps in TEST.md — **Medium (documentation)**

- **Description.** Following §1.4 verbatim (`pip install -e .`) installs no
  test tooling. `python -m pytest` then fails with `No module named pytest`;
  after installing pytest, four tests error on a missing `setuptools`/`build`;
  and an unpinned `mypy` crashes on this machine.
- **Evidence.**
  ```
  No module named pytest                       (exit 1)
  ERROR tests/test_real_wheel.py  (×4)  No module named 'setuptools' / build
  mypy 2.4.1 … internal error                  (exit 2)
  ```
  With `pytest`, `build`, `setuptools`, and `mypy==1.18.2` installed:
  `342 passed, 1 skipped`.
- **Recommended fix.** Add `pip install -e ".[dev]"` (or `-r requirements.lock`)
  to §1.4, or state the extra packages. Note the `mypy` pin.

### F5 — `statusline` and `stats` disagree on the scar count — **Low**

- **Description.** After removing one scar, `stats` reports `Scars: 3` while
  `statusline` prints `4 scars`.
- **Where.** `packages/grudge/src/commands/statusline.js:29-33` prefers
  `counters.accepted` (a lifetime tally that includes removed scars) over the
  live compiled-rule count that `stats.js:14` uses.
- **Evidence.** `stats` → `Scars: 3`; `statusline` → `4 scars`; `scars list`
  → 3.
- **Impact.** Cosmetic, but the status line is the number users glance at.
- **Recommended fix.** Count compiled rules (excluding `off`) in both places.

### F6 — `scars disable`/`remove` prints `[fail] Scar: not found` — **Low (acknowledged)**

- Confirmed exactly as TEST.md documents it, including exit `0` and the
  successful effect. Not a new finding; TEST.md is honest about it.
  (`packages/grudge/src/commands/scars.js` text renderer expects a `scars`
  array these actions omit.)

### F7 — A rule written with Claude Code's own tool names is silently vacuous — **High — FIXED**

- **Description.** Incoming events are normalized (`Read` → `read_file`,
  `Write`/`Edit` → `write_file`, `Bash` → `shell`, `WebFetch` → `http`), but a
  rule's tool name is stored verbatim. A rule written as
  `never call Read where file_path ~ "/secret/prod.env"` therefore compiles
  cleanly and never matches anything.
- **Where.** `packages/grudge/src/dsl/parse.js` (tool name taken as written) vs
  `packages/grudge/src/core/normalize.js` (tool name rewritten on ingest).
- **Steps to reproduce.**
  1. Record a `Read` of `/secret/prod.env`.
  2. Propose `never call Read where file_path ~ "/secret/prod.env"` → **`vacuous rule`**, exit 1.
  3. Propose `never call read_file where file_path ~ "/secret/prod.env"` → accepted; blocks correctly.
- **Evidence.**
  ```
  never call Read ...       -> [fail] Proposal: vacuous rule
  never call read_file ...  -> [ok] Status: accepted and enforced
  ```
- **Impact.** Claude Code presents exactly `Read`, `Write`, `Edit`, `Bash`,
  `WebFetch` — the names a user or an agent will naturally write. `propose`
  rejects them as vacuous, which is at least loud; but a rule accepted through
  any path that does not validate (or a hand-edited `compiled.json`) is
  silently inert. The documented rule vocabulary says `read_file`, so the two
  names silently disagree.
- **Fix.** Added `canonicalTool(name)` to `normalize.js` — the same alias table
  the event side already used — and applied it at the three places a tool name
  enters a rule:
  1. **Parser** (`parse.js`) via a `toolName()` helper, used in every
     tool-position site: `never call`, `must call`, `must call X before Y`, and
     both taint forms. Field names are untouched, so `where file_path ~ ...`
     still matches the recorded argument.
  2. **Compilation** (`scars.js` → `compiledRule`), so scars recorded before
     this fix resolve correctly on the next `accept`/`recompile`, including the
     two tool names inside `ordering` and the source/sink inside `taint`.
  3. **Python mirror** (`predicates/dsl.py` → `tool_name()`, and
     `guard/compile.py` → `_flatten`), so both compilers emit identical rules.
- **Deliberately not rewritten.** A qualified `mcp__server__tool` keeps its own
  name — the event already carries it in `tools`, and rewriting it would point
  the rule at a different tool. Unknown names keep the author's spelling
  rather than being guessed at.
- **After fix.** `never call Read where file_path ~ "/secret/prod.env"` is
  accepted (`Status: accepted and enforced`) and blocks the matching `Read`
  while allowing a benign one. The same holds for `Bash`, and for
  `must call Read before shell`, which now resolves its prerequisite.
- **Regression tests.** `packages/grudge/test/f7-tool-names.test.js` — 6 tests
  covering the alias table, idempotency, MCP/unknown preservation, all rule
  forms, compilation of pre-existing records, and equivalent spellings. They
  **fail 5/6 with canonicalization disabled** and pass 6/6 with it; the test
  that passes in both states is the one asserting MCP and unknown names are
  left alone.
- **Test fixture updated.** `tests/test_predicates_dsl.py` now round-trips
  `read_file`/`http` instead of the schema-level aliases `read`/`send`, because
  `parse(pretty_print(x)) == x` is only an invariant for canonical names now.

---

## 9. TEST.md Accuracy Review

**Accurate and useful:**

- Part 4 command table, the `pytest -q` suppression explanation, the 41-fixture
  conformance claim, the Appendix D numbers — all verified correct.
- The PowerShell `<` redirection warning and `$LASTEXITCODE` guidance are
  correct and genuinely prevent confusion.
- Appendix B (files created) and the uninstall description are accurate.
- TEST.md is **honest about its own limits** — it states Tier 3 was not executed
  and repeatedly says doctor does not prove blocking.

**Inaccurate or incomplete:**

| Location | Problem |
|---|---|
| Test 3 expected output | `[skip] Files: 0 changed` — actual is `[ok] Files: 5 changed` (F3) |
| Test 12 expected output | `allowed=0` — actual `allowed=2` (F1) |
| Test 15 step 3 | Re-propose fails as `over-broad` (F2) |
| Test 16 expected output | Does not mention the statusline/stats scar-count difference (F5) |
| §1.4 | Does not mention that test tooling must be installed separately; `mypy` must be pinned (F4) |
| Part 4 `make …` rows | `make` is absent on a default Windows machine; the guide presents it as a convenience wrapper without saying it may not exist |
| Appendix D timing | Python suite was documented at ~105 s; with the wheel-building tests it took **79 minutes** here on a slow disk. Not a defect, but a beginner will think it hung |

**Not found (worth noting as missing coverage):**

- No test covers **two different rules in one session** or rule interaction.
- No test covers the guard's behaviour when the session log is large (only the
  16 MiB *input* limit is tested).
- No test asserts that an *allowed* call is not counted as blocked after a
  prior match.

A beginner can follow the guide — the structure and explanations are good — but
they will hit F3 and F2 as written, and F1 will look like "the guard works" at
first glance because Test 12 only half-fails.

---

## 10. Final Verdict

**FAIL as tested at `f12ae02`; F1 is now fixed and re-verified.**

The critical defect — **a benign call denied once the session had previously
matched** (F1) — was confirmed, root-caused, fixed, and covered by regression
tests. The fix changes one line at the hook's decision point and leaves the
shared rule engine untouched, so `propose` validation and history-dependent
rules behave exactly as before.

F7 — the second correctness defect, where a rule written with Claude Code's own
tool names (`Read`, `Write`, `Bash`) silently never fired — is also fixed and
covered by tests, in both the Node and Python compilers.

One caveat remains: **neither fix has been re-tested in a live logged-in Claude
Code conversation.** Both were verified against the host's real hook command
and payload shape, and the F1 defect *was* observed live before the fix.
Closing that gap needs one logged-in session.

With F1 and F7 fixed, the central promise — "it blocks the call it names and
lets everything else through" — holds across every tested tool type, and a rule
can be written in the vocabulary the user actually sees.

---

## 11. Recommended Next Steps

1. ~~**Fix F1.**~~ Done — `pre-tool-use.js:104`, with
   `test/f1-call-shape-scope.test.js` (fails 3/5 without the fix).
2. ~~**Fix F7.**~~ Done — `canonicalTool` in `normalize.js`, applied in the
   Node parser, the Node compiler, and the Python mirror, with
   `test/f7-tool-names.test.js` (fails 5/6 without the fix).
3. **Rebuild deployed guards.** Both fixes are in `packages/grudge/dist/`; any
   installed `.grudge/bin/grudge.mjs` predating them still runs the old logic
   and must be replaced.
4. **Fix TEST.md Test 15's step order** (record a clean session before
   re-proposing) so the guide can be followed start to finish.
5. **Fix the `--dry-run` message** (or correct TEST.md) so a preview is
   distinguishable from an install.
6. **Add the dev-install and `mypy` pinning step** to §1.4.
7. **Reconcile the scar count** between `statusline` and `stats`.
8. **Re-run Tier 3 in a live session** with the fix installed, to confirm the
   host honours the narrowed deny and allows the followed-up benign call.

---

## 12. Evidence

Raw artifacts are in the disposable temp folders
(`%TEMP%\grudge-test`, `%TEMP%\grudge-lab`, `%TEMP%\grudge-subdir`); nothing
was written into the repository except this file. Key captures:

```text
# Test 1
Result: PASS (10/10 checks)

# Test 12  (the failure)
blocked=2                      # secrets/prod.env  (correct)
allowed=2                      # src/notes.txt    (documented: allowed=0)

# Isolation of F1
fresh session, same benign call            -> EXIT=0
session that already matched, same call    -> EXIT=2

# Test 15 re-propose
[fail] Proposal: over-broad rule: fires on control session lab-3 at event 0

# Test 3 dry run
[ok] Files: 5 changed          (documented: [skip] Files: 0 changed)

# Test 16
stats     -> Scars: 3
statusline-> grudge: 4 scars, 5 blocked, ~7.5k tokens saved (est.)

# Suites
Node:    tests 173, pass 173, fail 0        (exit 0)
Python:  342 passed, 1 skipped              (exit 0)
ruff:    All checks passed                  (exit 0)
mypy:    Success: no issues found in 129 source files   (exit 0, pinned 1.18.2)
docs:    43 indexed files                   (exit 0)
release: metadata agree                     (exit 0)
release:verify: PASS (30/30 checks)         (exit 0)
```

No secrets were printed; the demo's own placeholder value
(`DEMO_FILE_VALUE_ONLY…`) is the only credential-shaped string in any output.

---

## 13. F1 Remediation — Fresh Execution Report

Separate from the audit above: this section records the reproduction, fix, and
re-verification of F1. Everything ran in disposable directories, and no scar
was cleared to make anything pass.

### 13.1 Scenario matrix

Run through the real `PreToolUse` entry point with the host's payload shape.
"Before" is the code at `f12ae02`; "After" is the same tree with the one-line
change at `pre-tool-use.js:104`.

| # | Scenario | Expected | Before | After |
|---|---|---|---:|---:|
| S1 | Matching prohibited shell command | deny | 2 ✓ | 2 ✓ |
| S2 | Benign shell in the same session | allow | 2 ✗ | 0 ✓ |
| S3 | `Read` after a shell violation | allow | 2 ✗ | 0 ✓ |
| S4 | `Write` after a shell violation | allow | 2 ✗ | 0 ✓ |
| S5 | Unrelated MCP call after a violation | allow | 2 ✗ | 0 ✓ |
| S6 | Benign call in a fresh session | allow | 0 ✓ | 0 ✓ |
| S7 | Benign call with no `session_id` | allow | 0 ✓ | 0 ✓ |
| S8 | A second, independently prohibited call | deny | — | 2 ✓ |
| S9 | Two rules, two tool types, one session | each stays in scope | 2/2 ✗ | deny/deny ✓ |
| S10 | Corrupt/stale compiled rules | allow + diagnosed | 0 ✓ | 0 ✓ |

S9 detail: with `shell`- and `read_file`-scoped rules both active in one
session, the matching shell call returns `scar f1-shell`, the matching read
returns `scar f1-read`, and a benign shell call is allowed — neither rule
reaches the other's tool.

### 13.2 Automated verification

| Check | Result | Exit |
|---|---|---:|
| `node --test test/f1-call-shape-scope.test.js` (with fix) | 5 pass, 0 fail | 0 |
| Same file, fix reverted | **3 fail** (the three F1 tests), 2 pass | 1 |
| Full Node suite | 178/178 pass | 0 |
| Python suite | 342 passed, 1 skipped | 0 |
| Conformance fixtures (41, both languages) | 8/8 pass | 0 |
| `ruff check .` | All checks passed | 0 |
| `mypy --strict grudge` | Success: no issues in 77 source files | 0 |
| `npm run release:verify` | PASS (30/30 checks) | 0 |

The Python totals match the pre-fix baseline exactly (342 passed, 1 skipped),
which is the expected result: the fix is confined to the Node hook's call site
and leaves the shared engine — and therefore the Python mirror and `propose`
validation — untouched.

The revert check is the important one: the regression tests fail on exactly the
three scenarios that describe F1 and continue to pass on the guard scenarios,
which is the evidence that the fix narrows scope without weakening enforcement.

**The installed bundle also had to be replaced.** The repo's own guard at
`.grudge/bin/grudge.mjs` was still the pre-fix build (dated before the source
edit) and still evaluated `[...prior, normalize(payload)]`. It was rebuilt from
`packages/grudge/dist/grudge.mjs` and re-tested; the installed copy now carries
the fix. **Anything already deployed elsewhere needs the same rebuild** — a
source fix alone does not change a guard that ships as a bundled artifact.

**Known flake, not caused by this change.** `P0-3: hookBudgetMs never converts
a matching block into an allow` intermittently fails during a *full* suite run
with `EBUSY: resource busy or locked, rmdir ...\grudge-p0-*\sub` — a Windows
temp-directory cleanup race, not an assertion failure. It passed 6/6 in
isolation on both the pre-fix and post-fix code, and the full suite passed 5/5
consecutively with the fix. Reported here so it is not mistaken for a
regression.

### 13.3 Live Claude Code verification

This is the boundary that matters, so it is stated plainly.

**What was verified live.** The defect itself was observed in a real Claude
Code session before the fix: a matching `Bash` call was denied, a benign
`echo hello` was denied, and then `Read` and `Write` were denied under the same
shell-scoped scar until the rule was removed by hand outside the session. That
is the reported symptom, and it is real.

**What was verified after the fix.** The registered hook command — the exact
string in `.claude/settings.json`, `node .grudge/bin/grudge.mjs hook
PreToolUse` — was executed with the host's real payload shape from a nested
working directory against a freshly installed sandbox. All ten scenarios
behaved correctly: the prohibited call denied (exit 2) and the benign shell,
`Read`, `Write`, MCP, fresh-session, and no-session-id calls all allowed
(exit 0).

**What was NOT verified.** No logged-in Claude Code conversation was run with
the fixed build. `claude -p` in this environment returns
`Not logged in · Please run /login`, and the host's credential is broker-managed
(`ANTHROPIC_AUTH_TOKEN` is not exported to child processes), so a spawned
session cannot authenticate. **The fix is therefore confirmed at the hook
protocol level, not end-to-end inside a live conversation.** Because Claude Code
honours the hook's exit code rather than re-deriving it, this is strong
evidence — but it is not the same as watching a real session behave, and one
logged-in session would close it properly.

### 13.4 Scope discipline

- One source file changed: `packages/grudge/src/hooks/pre-tool-use.js`.
- One test file added: `packages/grudge/test/f1-call-shape-scope.test.js`.
- `check.js` and `compile.py` untouched, so the shared engine, `propose`
  validation, and both languages stay in agreement.
- No scar was cleared, no rule disabled, `GRUDGE_DISABLE` not set, no test
  weakened. F7 was found during this work and deliberately **not** fixed, to
  keep the change reviewable and to keep rule-authoring semantics out of a
  narrow bug fix.
