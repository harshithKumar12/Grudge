# Production readiness: final remediation report

**Purpose:** Record the remediation of the 0.2.1 release tree — four workstreams
(A–D) plus the evidence this report delivers: what each workstream changed, the
evidence that proves it, the disposition of every audit finding, the full
validation run, and the resulting verdict.
**Audience:** Maintainers cutting the next `grudge-cli` release, reviewers
checking the remediation claims, and future agents picking up the remaining
release actions.
**Status:** final
**Last updated (phase):** 6 - independent review closure - 2026-11-01

## 1. Bottom line

**Verdict: CONDITIONALLY READY.**

The committed tree passes every gate locally — Python tests, lint, types,
documentation index, release metadata, Node suites, the npm artifact gate, and
the wheel artifact gate — and each workstream below is backed by an executed
check rather than a code change alone. Three conditions keep this from being an
unconditional PRODUCTION READY:

1. **Nothing here has run in CI.** The work is now committed locally on
   `remediation/production-readiness` (§13), but no commit has been pushed. The
   last green CI runs (`41286611099`, `41286614224`) cover commit `6047112`,
   which predates every change in this report. CI must run on the commits that
   carry this work before the tree can be called production ready.
2. **The registries still serve the pre-fix artifact.** `grudge-cli@0.2.1` on
   npm was published from a stale bundle; the version was deliberately not
   bumped, and publishing is out of scope for this remediation. The tree is
   publishable, the registry is not yet corrected.
3. **One machine-local condition is unresolved by design.** This checkout's
   untracked `.claude/settings.json` registers hooks with relative commands, so
   `grudge doctor` at the repository root reports
   `[fail] hook paths ... (relative path)`. That is an environment fact about
   this workstation, not a product defect. The file is not matched by the
   repository `.gitignore`, so it was excluded by staging explicit paths only
   (see §9).

Five commits carried the work to Phase 5. **Phase 6 (§14) then closed the seven
findings §7 had deferred and thirteen findings from a second review**, including
one regression this remediation had introduced in `doctor`. Seven commits now
carry the tree locally (§13). Nothing was pushed, tagged, published, or merged.
The version was not bumped beyond `0.2.1`, whose metadata `6047112` already
synchronised, and the three conditions above are unchanged: they are about CI and
the registry, not about code.

## 2. Method

The remediation ran in a fixed phase order and no phase was skipped:

| Phase | Content | Gate to leave the phase |
|---|---|---|
| 0 | Baseline capture | Branch, HEAD, origin, index state, and both test suites recorded |
| 1 | Statistics accounting | Persisted event semantics proven, not a displayed counter |
| 2 | Release pipeline | Artifact gates that build, inspect, install, and drive the artifact |
| 3 | Claude Code nested settings | Host behaviour measured; limitation surfaced by the product |
| 4 | Audit closure | Every finding gets FIXED, ACCEPTED, DEFERRED, OPEN, or INVALID |
| 5 | Full validation | Every gate re-run on the final tree, then this report |
| 6 | Independent review closure | Every finding either fixed with a test that fails without the fix, or documented as a limitation (§14) |

Three rules shaped the work:

- A finding is FIXED only when a named check proves the old behaviour is gone.
  A code edit alone is not evidence, and no severity was lowered.
- No test was weakened or skipped to make a gate green. Where a test encoded
  the old behaviour as correct (the DSL error case in §7), the assertion was
  replaced with the behaviour the finding asked for, not deleted.
- Local commits were created per workstream with hooks enabled; push, tag,
  publish, and merge were left to the maintainer. This report never claims a CI
  result it did not observe.

## 3. Phase 0 — baseline

Recorded before any change:

| Item | Value |
|---|---|
| Branch | `remediation/production-readiness` |
| HEAD = origin | `60471124256735716c02bba0baeac12ec4bfe829` |
| Index | clean |
| `python -m pytest` | 326 passed, 1 skipped |
| `npm test` (packages/grudge) | 123 passed |

The baseline fixes the state before any change: it is what the later claims are
measured against, and the flake noted in §9 was not pre-existing. These are the
**pre-change** totals; §8 records the final results on the committed tree.

## 4. Workstream A — statistics accounting

### Problem

`grudge stats` and the status line could disagree with the enforcement the user
actually experienced. The displayed block count was derived from a legacy
`stats.json` counter that hooks no longer maintained, so a user could be blocked
repeatedly and still see a stale total.

### What changed

`.grudge/stats.jsonl` is the only canonical source. Every counter is derived
from it at read time:

| Record | Contribution |
|---|---|
| `catch` with `outcome: "warned"` | `caught` + `warned` |
| `catch` with any other outcome | `caught` + `blocked` |
| `proposal` | `proposals` |
| `accepted` | `acceptedScars` |
| `stop` | `stops`, `lastStopAt` |
| `injection` | `injectedChars` |
| `hook` | nothing — a claim is not an outcome |

Deliveries are de-duplicated by `dedupeKey` inside `readEvents`, so a replayed
hook delivery collapses to one event and a duplicate scope cannot double-count.
`stats` and `report` expose `stops` and `lastStopAt`, and `stats` folds a legacy
`stats.json` in when no events were ever appended, so an old installation does
not silently read as zero.

Two constraints were deliberately honoured:

- **No `allowed` counter was invented.** An allowed call appends only a `hook`
  claim, and the test suite proves that claim increments nothing.
- **The human contract is unchanged.** `stats` still prints four status lines
  (`Blocks`, `Warnings`, `Scars`, `Estimated savings`). `stops` and `lastStopAt`
  appear in `stats --json` and `report --json` only.

### Evidence

`packages/grudge/test/stats-consistency.test.js` — 14 tests covering the
required matrix: blocked, allowed, caught, multiple events in one log, duplicate
and replayed delivery, malformed records, a missing installation, concurrent
writers, `stats`/status line consistency, `reportSinceLast` reset behaviour, and
legacy counters including legacy stop counts. Two of the tests compare the built
CLI's `stats` and `report` output against each other rather than against a
constant.

Independent CLI evidence at `D:\Temp\ph1-cli-verify.txt` shows a single blocked
call producing `blocks: 1`, `caught: 2`, `stops: 1`, and a concrete
`lastStopAt` in JSON while the human output keeps its four lines.

## 5. Workstream B — release pipeline

### Problem

A green source tree proved nothing about either installable artifact. The
published npm tarball had been built from a stale bundle, and no gate inspected
what a user actually downloads.

### What changed

| Surface | Gate | What it proves |
|---|---|---|
| npm package | `packages/grudge/scripts/verify-release.mjs` (30 checks) | Packs the real tarball, asserts the bundle is rebuilt from current source and byte-identical to the tarball, installs it, and drives the installed runtime: setup, doctor, a blocked call, stats, and the absolute-hook fix |
| npm publish | `prepublishOnly` | Now runs `npm test && npm run release:verify`, so an artifact gate failure stops a publish |
| Python wheel | `scripts/verify_wheel.py` (8 checks) | Builds the wheel, inspects members and metadata, creates a clean virtualenv, installs, and drives `grudge-engine --version`, `--help`, and `demo --no-browser --fast --json` |
| Cross-surface metadata | `scripts/release_check.py` | Fails when `package.json`, `package-lock.json`, `src/version.js`, `pyproject.toml`, the README status line, and the changelog disagree |
| CI | `.github/workflows/grudge-guard.yml` | The package job now runs the wheel gate, `npm run release:verify`, and a blocking proof from the installed packages |

New regression tests: `tests/test_release_check.py` (9), `tests/test_verify_wheel.py` (8),
and `packages/grudge/test/release-packaging.test.js` (6, including "packing
always rebuilds the bundle and publishing always runs the suite and the
artifact gate").

### Evidence

`npm run release:verify` → `PASS (30/30)`. `python -m scripts.verify_wheel` →
`PASS (8/8)`. `python -m scripts.release_check` →
`release-check: local npm/PyPI metadata and published-version documentation agree`
(exit 0).

## 6. Workstream C — Claude Code nested settings

### Problem

A project-scope install is invisible to a Claude Code session started in a
subdirectory: the hooks never load, the call executes, and the user believes
they are guarded. The product could not change the host's discovery rules, and
`doctor` run from a nested directory reported everything green.

### Measured host behaviour (Claude Code 2.1.283)

| Session start | Hooks loaded | Prohibited call | Accounting |
|---|---|---|---|
| Repository root | yes | blocked | `catch/blocked` appended |
| `project/nested` | no | executed | no event appended |
| `project/nested` + `--settings <root>/.claude/settings.json` | yes | blocked | `catch/blocked` appended |

These are observations of the host for a `--scope repo` install, not inferences
from its documentation. The `--scope local` exception is documented by the host
and not measured here: `.claude/settings.local.json` is read from the git
repository root, except on Windows.

### What changed

- `doctor` resolves the install root upward from the directory it runs in
  (stopping at `home`) and adds a `launch directory` check. It distinguishes
  the two project files: `.claude/settings.json` is read from the start
  directory, while `.claude/settings.local.json` is read from the git repository
  root on Linux and macOS (Windows is the documented exception). A shared-file
  install launched elsewhere fails and names the `--settings` remedy with the
  file that actually holds the hooks; a local-file install inside the same
  repository passes on POSIX. The JSON output carries `launchDirectory`.
- `setup` prints the same limitation, with scope-specific text: `--scope repo`
  and `--scope global` state the start-directory rule, while `--scope local`
  states the repository-root rule on POSIX.
- Doctor's human output suggests `Next: grudge setup --scope global` **only**
  when the launch directory is the sole failing check, so the advice is not
  offered when something else is also broken.
- `docs/hooks.md` gained a "Claude Code settings discovery" section with the
  measured table, the local-scope exception, the qualified `hook paths`
  statement, and a **manual acceptance test**, because settings discovery is
  host behaviour the Node suite cannot automate.

Tests: 9 new installer tests — setup's launch-directory warning, setup's
local-scope warning per platform, doctor from a nested launch directory naming
the remedy, doctor reading local-scope hooks from the repository root on POSIX,
doctor failing local-scope hooks where no repository explains them, doctor
keeping a user-scope install green from a nested directory, the
settings-file-deleted case, the paths-with-spaces absolute-hook case, and the
compiled-rule case below — plus one new output test, "a nested launch suggests
the user-scope fix, not another repo setup". The suite totals before and after
are in §3 and §8.

### Evidence

`D:\Temp\ph3-cli.txt` records the doctor output at the root and from a nested
directory, the JSON `launchDirectory` field, and the human `Next:` line.

## 7. Workstream D — audit closure

Every finding in the three audit documents now carries a disposition, recorded
as an addendum at the end of each document. Historical findings and verdicts are
untouched, so the record of what was observed survives the remediation.

Dispositions: **FIXED** (a named check proves the old behaviour is gone),
**ACCEPTED** (behaviour is correct or intentional and now documented),
**DEFERRED** (real, out of this scope), **OPEN** (unresolved), **INVALID** (the
finding does not hold).

| Document | Finding | Disposition |
|---|---|---|
| `docs/INDEPENDENT-PRODUCTION-AUDIT.md` | P2-1 — `grudge-engine doctor`/`verify` implied by Quick start | FIXED |
| | P2-2 — `demo --guard` needs a Node runtime outside a checkout | FIXED |
| | P2-3 — corrupt or wrong-version rules silently disable enforcement | FIXED |
| | P2-4 — `must call <tool> before <tool>` rejected by the parser | FIXED |
| | P3-1 — redaction injects `: ` into query strings | FIXED |
| `docs/INDEPENDENT-RE-AUDIT.md` | R-1 — release metadata inconsistent (blocker) | FIXED |
| | O-1 — demo names a scar path inside site-packages | INVALID |
| | O-2 — `stats --json` has no Stop counter | FIXED |
| | O-3 — duplicate hook scopes only diagnosed | ACCEPTED |
| | O-4 — generic scar text causes unrelated refusals | INVALID |
| `docs/production-readiness-audit-2026-10-30.md` | P2-4 — exact-version pins conflict with common tooling | FIXED |
| | P2-5 — documented hook timing does not match the shipped process | FIXED |
| | P3-2 — unlocked legacy `stats.json` increment | FIXED |
| | P3-3 — `uninstall` removes `.grudge` wholesale | FIXED |
| | P3-4 — release docs use `npm pack`/`publish --prefix` | FIXED |
| | P3-5 — no live Claude Code session was exercised | FIXED |
| | P3-6 — doctor reports a missing status-line helper | ACCEPTED |

Four dispositions deserve the reasoning, not just the label:

- **IPA P2-3** needed a second fix. The runtime already warned and skipped a
  damaged rule file, but `doctor` printed `[fail] compiled.json: valid` — a
  failed check carrying the word "valid" is how a corrupt file looks healthy.
  The detail now reads `invalid or unsupported version; enforcement is skipped`,
  with a regression test.
- **IPA P2-4** could not be fixed without touching a test that asserted the old
  behaviour. `must call verify before transfer` was an expected parse error;
  after the fix it parses. The error case was replaced with
  `must verify transfer`, which still has to fail (the `call` after `must`
  remains mandatory), and the shorthand plus the canonical form are both proven
  end-to-end through `propose --rule-stdin --accept`.
- **RE O-1** is INVALID, not ACCEPTED. Re-measured on an installed 0.2.1 wheel:
  the named `site-packages/scars/sample_leak.scar.json` is byte-identical
  (SHA-256 and mtime) before and after the demo, no non-`.pyc` file under
  `site-packages/grudge` changed, and the working directory stayed empty.
- **RE O-4** is INVALID for the same kind of reason: the refusal came from a
  synthetic rule whose English was `Never run this exact command.`. Real
  proposals derive the sentence from the rule and name the tool, so the product
  path does not produce that wording.

Two non-blocking follow-ups are recorded rather than hidden:

- `pydantic`, `typer`, `click`, and `httpx` remain exact pins. They no longer
  conflict with anything the finding named: `pip check` is clean in a fresh venv
  built from `requirements.lock`. The shared ambient environment on this
  workstation reports unrelated tool conflicts (`twine`, `pytest-asyncio`,
  an unrelated package) and is not the project environment. Widening the pins is
  a separate change.
- The user-scope install path was documented and its doctor advice tested; it
  was never executed against a real `~/.claude/settings.json`, because doing so
  would rewrite the maintainer's machine-local configuration.

### Deferred findings from the independent review

**All seven of these are fixed in Phase 6** — §14.2 records each fix and the
check that proves it. The paragraphs below are the state at the time of the
first review and are kept as the record of what was deferred.

These were confirmed as real but were not fixed in this change set; each is
recorded here rather than silently dropped:

- **`doctor` has no repository boundary when resolving the install upward.**
  `resolveInstallRoot` walks to `home` and returns `home` when nothing matches,
  so a session in a nested independent repository (`proj/vendor/lib` with its
  own `.git`) binds to the outer install and reports a launch-directory failure
  instead of "no install here". The tests cover a nested directory within one
  repository; they do not cover a nested repository boundary.
- **`uninstall` still uses the raw working directory.** `grudge uninstall` from
  a subdirectory resolves no install and exits 0 with nothing removed, while
  `doctor` now resolves upward; the two commands disagree.
- **A global install writes `$HOME/.gitignore`.** `planGitignore` uses the
  install root, which is `home` for `--scope global`; git never reads that file.
  Pre-existing, but `doctor` now recommends the global scope for launch-directory
  failures, which makes it more reachable.
- **`.claude/settings.json` is not matched by the repository `.gitignore`.**
  The file is untracked and machine-specific; a future `git add -A` would sweep
  it in. Every commit here used explicit paths only.
- **`doctor`'s `hook paths` check only resolves `grudge.mjs` commands.** A
  Grudge hook registered as `./node_modules/.bin/grudge …` is recognised but not
  resolved; the docs now state that qualifier instead of overclaiming.
- **`verify-release.mjs` joins its argv into a shell string.** The Windows
  escaping is POSIX-style, but every argument is a constant or a `mkdtemp` path,
  so no current call is exposed; fixing it is a robustness change, not a
  correctness fix.
- **The default pytest suite inspects only synthetic wheels.** The real wheel
  gate runs in CI's `package` job and was run locally for this report; adding a
  build-once fixture to the unit suite would slow every run.

## 8. Phase 5 — full validation

Every gate was re-run on the final tree after all implementation changes, from
the repository root unless noted. The results below are what the committed tree
produces, not the earlier phase runs.

| # | Gate | Command | Result | Exit |
|---|---|---|---|---|
| 1 | Python tests (ambient env) | `python -m pytest -q -p no:cacheprovider` | 338 selected: 337 passed, 1 skipped (25.8 s) | 0 |
| 2 | Python tests (declared dev floor) | `python -m pytest` in a clean venv from `requirements.lock` (pytest 9.2.0) | 338 selected: 337 passed, 1 skipped; `pip check` → no broken requirements | 0 |
| 3 | Lint | `python -m ruff check .` | `All checks passed!` | 0 |
| 4 | Types | `python -m mypy .` | `Success: no issues found in 128 source files` | 0 |
| 5 | Docs index and links | `python -m scripts.docs_check` | `43 indexed, non-empty, linked documentation files` | 0 |
| 6 | Release metadata | `python -m scripts.release_check` | `local npm/PyPI metadata and published-version documentation agree` | 0 |
| 7 | Node suites (from `packages/grudge`) | `npm test` | 143 tests, 143 pass, 0 fail (73.9 s) | 0 |
| 8 | npm artifact gate (from `packages/grudge`) | `npm run release:verify` | `PASS (30/30 checks)`; `stats.blocks=2 report.blocked=2`; blocks from root and from a nested directory; installed runtime verifies its own guard `10/10` | 0 |
| 9 | Wheel artifact gate | `python -m scripts.verify_wheel --outdir D:\Temp\wheel-rerun` | `PASS (8/8 checks)`: wheel contents and metadata `grudge-cli 0.2.1`, clean virtualenv, install, `grudge 0.2.1`, `--help`, installed demo "fixed passes, vulnerable fails", module resolves inside the virtualenv | 0 |
| 10 | Wheel gate re-runnability | same command, second run into the now non-empty `--outdir` | `PASS (8/8 checks)` | 0 |
| 11 | DSL ordering parity | `pytest tests/test_predicates_dsl.py` (6) and `node --test test/phase15-core.test.js` (4) | both pass; shorthand and canonical forms produce the same rule | 0 |

**§14.5 supersedes this table.** The Phase 6 changes added tests and two gates'
worth of findings, so the totals above are the Phase 5 snapshot, not the final
tree.

Gates 1–6 are the Python source surface; 7–8 build and drive the packed npm
tarball; 9–10 build and drive the packed wheel. Together they cover the two
artifacts plus the source surface, which is the combination the earlier audits
found wanting.

Four observations about this run:

- The ambient environment used pytest 8.3.4, which is below the project's
  declared `pytest>=9.0.3` floor. Gate 2 closes that gap by installing
  `requirements.lock` into a fresh virtualenv (pytest 9.2.0, `rich` 14.3.4) and
  running the whole suite there; the result matches.
- The suite totals are 338 Python tests (337 passed, 1 skipped) and 143 Node
  tests, against the Phase 0 baseline of 326 passed (1 skipped) and 123 passed.
  The added Node files are `stats-consistency.test.js` (14),
  `release-packaging.test.js` (6), and new cases in `installer.test.js` (32
  total) and `output.test.js` (11 total).
- The npm gate grew from 29 to 30 checks; the extra check fails when
  `npm pack --json` yields no tarball filename instead of throwing.
- The transient `concurrency-enforcement.test.js` timing flake noted in §9 did
  not recur in the final runs.

## 9. Environment notes (not product defects)

- **This checkout's `.claude/` is untracked and was excluded from every
  commit.** The repository now ignores `.claude/settings.local.json` and keeps
  `.claude/settings.json` trackable (finding E, §14.2); this checkout's
  `settings.json` is machine-local anyway, so it was staged by explicit path
  never, and with it the whole directory. The hooks in it use relative commands
  (`node .grudge/bin/grudge.mjs hook ...`), so `grudge doctor` at the repository
  root correctly reports `[fail] hook paths ... (relative path)` with the remedy
  `re-run grudge setup`. That is the guard doing its job on an environment that
  predates the absolute-path install; nothing under `.claude/` was modified.
- **`.gitignore` and `CLAUDE.md` carry `grudge setup` side effects** — three
  `.grudge/` ignore lines and a managed instruction block. The `.gitignore` line
  that matters (the personal Claude settings) is committed; the rest stays
  modified and uncommitted, flagged rather than silently folded into a
  workstream.
- **The registry still serves the stale `grudge-cli@0.2.1`.** The version was
  deliberately not bumped: the release action is publish, not re-version.
- **One transient flake was observed once**:
  `concurrency-enforcement.test.js` "a spawned hook returns well under a second
  (P1-2)" failed under full-suite load, passed alone, and passed on the
  subsequent full run. The threshold was not relaxed; the timing budget is the
  behaviour under test. If it recurs, the fix belongs in the harness, not the
  assertion.

## 10. Remaining actions

| # | Action | Owner | Why it is not done here |
|---|---|---|---|
| 1 | Push commits 1–7 (phases 1–5 and 6) | Maintainer | Pushing and opening the PR are out of scope |
| 2 | Confirm CI is green on those commits | Maintainer | CI cannot run on unpushed commits |
| 3 | Publish the corrected tree as a new version (`0.2.2`) | Maintainer | `0.2.1` is already immutable in both registries — npm `grudge-cli@0.2.1` (shasum `bb2e7f9930d6333c7d3d76bbe7a3888fcda749d2`) and PyPI 0.2.1 — and a version bump is a release decision, not a remediation step |
| 4 | Widen the remaining exact pins | Follow-up | Non-blocking; `pip check` is clean in the lock environment |
| 5 | Run the manual Claude Code acceptance test on a release machine | Follow-up | It is a host-level check, documented in `docs/hooks.md` |

## 11. Working tree and excluded files

Seven local commits carry the work (§13). After the last commit the working tree
retains only these intentionally excluded residual changes:

| Path | State | Why it is excluded |
|---|---|---|
| `.gitignore` | committed in part | Commit 6 adds the `.claude/settings.local.json` line (finding E). The three `.grudge/` lines `grudge setup` appended stay uncommitted: the existing `.grudge/` entry already covers them, so they are workstation noise, not a repo fix |
| `CLAUDE.md` | modified | `grudge setup` wrote a machine-managed instruction block; not a repo-wide documentation change |
| `.claude/` | untracked | Machine-local agent configuration; contains this workstation's hooks and must never be committed |

No build artifacts, logs, temporary files, or credentials are tracked: `dist/`
is gitignored and the artifact gates write only to external temporary
directories. The per-workstream path lists are in the commit bodies (§13).

## 12. Evidence index

Local artifacts produced by this remediation (outside the repository):

| File | Contents |
|---|---|
| `D:\Temp\ph1-cli-verify.txt` | Stats JSON and human output for a blocked call |
| `D:\Temp\ph3-cli.txt` | Doctor output at the root and from a nested directory |
| `D:\Temp\ph4-cli-p24b.txt` | `propose` accepting both ordering spellings |
| `D:\Temp\ph4-corrupt3.txt` | Corrupt `compiled.json` and unknown-kind rule handling |
| `D:\Temp\ph4-redact-e2e.txt` | Stored session event with a redacted query string |
| `D:\Temp\ph4-o1.txt` | Installed-wheel demo with site-packages hashes before and after |
| `D:\Temp\ph4-p36.txt` | Doctor warnings with `~/.claude/settings.json` hashes unchanged |
| `D:\Temp\ph5-validation.txt` | The Phase 5 gate run |
| `D:\Temp\v-rv3.txt` | Final `npm run release:verify` transcript quoted in §5 and §8 (`PASS 30/30`) |
| `D:\Temp\junit2.xml` | Final ambient-environment pytest results (338 selected, 337 passed, 1 skipped) |
| `D:\Temp\junit-venv.xml` | Final pytest results in the clean `requirements.lock` venv (pytest 9.2.0) |
| `D:\Temp\j-unit2.xml` | `tests/test_release_check.py` plus `tests/test_verify_wheel.py` (17 tests) |
| `D:\Temp\wheel-rerun\` | Wheel artifacts from two consecutive runs into the same `--outdir` |
| `D:\Temp\ph4-check\` | Installed-runtime end-to-end ordering check (`propose --rule-stdin`, `scars list`) |

These are local working files, outside the repository; they are evidence for a
reviewer on this machine and are not shipped. The artifact gates themselves are
the reproducible proof.

## 13. Commit set

Branch `remediation/production-readiness`, based on
`origin/remediation/production-readiness` at `6047112`. Nothing was pushed,
tagged, published, or merged.

| # | Commit | Message | Files |
|---|---|---|---|
| 1 | `4aa0fbf` | `fix(stats): reconcile persisted event accounting` | pre-existing |
| 2 | `a533b26` | `feat(release): enforce distributable artifact verification` | 9 |
| 3 | `bc0e9a8` | `fix(claude): clarify nested settings and hook discovery` | 9 |
| 4 | `9083b79` | `fix(audit): accept the documented ordering shorthand and record remediation status` | 12 |
| 5 | `d6d26e1` | `docs: document final production readiness evidence` | 2 |
| 6 | `4b9fb2f` | `fix: close the deferred review findings and second-review defects` | 36 |
| 7 | this commit | `docs: record the phase 6 review closure` | 3 |

Commits 2–6 were created with hooks enabled and explicit path staging.
`.claude/` and `CLAUDE.md` were never staged. Commit 6 stages a *filtered*
`.gitignore`: the stored blob is HEAD's content plus the
`.claude/settings.local.json` rule, written with `git hash-object -w` and
installed with `git update-index --cacheinfo`, so the three `grudge setup` lines
stay out of the commit while finding E is tracked. Commit 7 cannot name its own
hash before it exists; the six hashes above are the actual commits this report
travels with.

Commit 2's message body contains the typo "packsaging gate" (meant "packaging
gate"). Amending a commit was out of scope, so it is recorded here rather than
rewritten.

## 14. Phase 6 — independent review closure (2026-11-01)

### 14.1 What the second review covered

A read-only review of commit `d6d26e1` re-checked the seven findings §7 had
deferred and looked specifically for defects the remediation itself had
introduced. It found one: the new `hook paths` check required an execute bit on
`grudge.mjs`, which the installer writes `0644`, so `doctor` failed on every
POSIX install (F3 below). Every claim in this section was re-verified in code
before a fix was scheduled; none was accepted on the reviewer's word.

Dispositions use the same vocabulary as §7: **FIXED** (a named check proves the
old behaviour is gone), **DEFERRED** (real, deliberately not changed), and no
finding was relabelled to make the tree look better.

### 14.2 The seven deferred findings

| Finding | Fix | Evidence |
|---|---|---|
| `doctor` had no repository boundary when resolving the install upward, so a nested repository bound to an outer install | New `installer/install-root.js`: `repositoryRoot` treats a `.git` file and a `.git` directory as the same boundary; `findInstallRoot` binds a directory to its own repository's install; `findProjectInstallRoot` never reaches above it. `doctor` and `uninstall` share it | `install-root.test.js` (10) and the installer tests "doctor reports no install for a nested repository instead of borrowing the outer one", "findInstallRoot refuses to cross into an enclosing repository's install" |
| `uninstall` used the raw working directory, so it removed nothing from a subdirectory and still exited 0 | `uninstall` resolves the project install with the same boundary rule. With no install it returns `found: false`, exits 1, and says in text and JSON that nothing was removed; it can no longer reach a `$HOME` install from an unrelated directory | "uninstall from a subdirectory removes the repository install", "uninstall in an unrelated directory removes nothing and says so", and the CLI exit-code assertions in `phase22-install-hardening.test.js` |
| `--scope global` wrote `$HOME/.gitignore`, which git never reads | global setup skips `planGitignore` and warns instead | "global setup does not create or modify `$HOME/.gitignore`" |
| `hook paths` resolved only `grudge.mjs` commands | commands are classified as a script, a `PATH` binary or unresolved; `PATH` lookup honours the platform executable suffixes; package runners warn; a Grudge command that cannot be resolved fails | "hook paths accepts an absolute shim, rejects a missing one, and resolves PATH names", "hook paths rejects a relative node_modules/.bin shim instead of ignoring it", "hook paths warns, and does not fail, when a package runner hides the target" |
| `.claude/settings.json` was not matched by the repository `.gitignore` | the repository ignores `.claude/settings.local.json` only, never the shared file or the directory | "the repository ignores personal Claude settings but keeps the shared file trackable" |
| `verify-release.mjs` joined its argv into a shell string | `runNpm` spawns `process.execPath` with an argv array and `shell: false`, and resolves the npm CLI per platform | "the release gate resolves the npm CLI script instead of building a shell command", "npm runs with an argument array, so spaces and shell metacharacters stay literal" |
| the default suite inspected only synthetic wheels | `tests/test_real_wheel.py` (4): builds the wheel from a copy of the build inputs, inspects members, metadata and console scripts, installs it into a virtualenv and runs `grudge` and `grudge-engine` from inside it | the test itself, plus the `scripts/verify_wheel.py` artifact gate (§14.5 row 9) |

### 14.3 Findings from the second review

| ID | Severity | Defect | Status | Evidence |
|---|---|---|---|---|
| F1 | High | PreToolUse refused any input over 1 MiB *before evaluating a rule*, so a large call carried a prohibited command past the guard | FIXED — the ceiling is 16 MiB; below it the payload is evaluated; above it PreToolUse denies with a reason. In-process input above the ceiling fails closed only when a block rule can apply to that tool | "a matching call larger than 1 MiB is blocked instead of silently allowed", "input beyond the hard ceiling is denied for PreToolUse and never allowed", "an over-limit payload fails closed only when a block rule could apply" (`phase17-hooks.test.js`) |
| F2 | High | `mcp__server__tool` normalized to `mcp`, so a rule written for `write_file`, `read_file`, `shell` or `http` covered nothing on MCP servers, which is how most hosts expose filesystem and shell access | FIXED — MCP events carry `tools` (the raw name, `mcp`, and the canonical capability when the name is recognisable); both engines match against it; unknown names are never guessed | the MCP test in `phase25-mapping.test.js`; conformance `28-mcp-capability`, `29-mcp-unknown-tool`, `30-mcp-ordering` agree in Node and Python |
| F3 | High | The new `hook paths` check required an execute bit on `grudge.mjs`, but the installer writes it `0644` and it is an argument to `node` — so `doctor` failed on every POSIX install, a regression introduced by this remediation | FIXED — a `script`-kind command only has to exist; the execute bit is still required for `PATH`-style binaries | "hook paths accepts the installed runtime without an execute bit" |
| F4 | High | `uninstall` restored whatever path the backup manifest named, so a hostile checkout could ship a manifest that overwrote files outside the install | FIXED — backup names are validated, and both the target and its backup must resolve inside the install; anything else is skipped and reported | "uninstall refuses a backup manifest that points outside the install" (the victim file stays byte-identical, two warnings) |
| F5 | Medium | A structurally valid but stale `compiled.json` is undetectable: an old copy keeps enforcing old rules and silently omits new ones | DEFERRED, documented — the file is state, not build output the runtime can date, and guessing staleness could disable a deliberate rule set. `docs/hooks.md` states the limitation and the remedy | the `.grudge/compiled.json` rows and the paragraph following them in `docs/hooks.md` |
| F6 | Medium | A recorded backup that no longer existed aborted `uninstall` before it removed anything | FIXED — restore failures become warnings and removal continues | "uninstall continues when the recorded backup no longer exists" |
| F7 | Medium | A Grudge hook registration that resolved to nothing only produced a warning, so `doctor` stayed green on a dead install | FIXED — an unresolvable Grudge command is a failure | "hook paths fails a Grudge command whose target cannot be resolved" |
| F8 | Medium | PostToolUse persisted tool arguments unbounded: a `Write` copied its whole body into the session log and through the redactor | FIXED — every string is truncated to 4 KiB and every collection to 50 items | "PostToolUse bounds the persisted arguments of a large call" |
| F9 | Low | The replay module called itself hermetic while patching a fixed list of entry points on one thread | FIXED — the docstrings state it is an accident guard, not a security boundary | module and `_hermetic_guards` docstrings in `grudge/replay/sandbox.py` |
| F10 | Low | Python `_values` yielded container objects, and only matched a substring when the sink field was itself a string; the Node engine walks leaves | FIXED — both engines walk leaves and match equal-or-containing leaves | conformance `31-taint-nested-objects`, `32-taint-nested-substring` agree in Node and Python |
| F11 | Medium | `stats.record` read, incremented and wrote the legacy counter without the stats lock, so concurrent callers lost increments | FIXED — the legacy read-modify-write takes `withStatsLock`; the append-only log path is untouched | "concurrent record calls keep every legacy counter increment" (24 writers); the test fails when the lock is removed (measured: 1 failed) |
| F12 | Low | CI had no `permissions:` block and referenced mutable action tags | FIXED — `permissions: contents: read` in both workflows; `checkout`, `setup-node` and `setup-python` are pinned to commit SHAs | `.github/workflows/grudge-gate.yml`, `.github/workflows/grudge-guard.yml` |
| F13 | Low | `pyproject.toml` built with setuptools 75.8.0 while the lock installed 84.2.1, so CI tested a different build toolchain from the one it pinned | FIXED — the pins agree, and `release_check` fails when they diverge | "build toolchain drift is reported" (`tests/test_release_check.py`) |

### 14.4 Claims corrected in this report

- **P3-2 was labelled FIXED while it was not.** §7 recorded the unlocked legacy
  increment as fixed; `stats.record` still performed an unlocked read-modify-write
  at `d6d26e1`. It is fixed now (F11) and the label follows the evidence.
- **P2-3 stays FIXED, with a boundary.** Corrupt, wrong-version and oversized
  rule files warn and are refused; a valid-but-stale file is a different case and
  is not detected (F5).
- **§5 described the wheel gate as building "the wheel".** That is true of
  `scripts/verify_wheel.py`, but until finding G the *default* suite only
  inspected synthetic wheels; the real artifact is now built and installed on
  every test run.
- **§8's totals are a Phase 5 snapshot.** §14.5 supersedes them.

### 14.5 Validation on the final tree

The ambient interpreter on this workstation carries pytest 8.3.4 and rich 13.9.4,
below `requirements.lock`, so every Python gate was re-run in a virtualenv built
from the lock (pytest 9.2.0, rich 14.3.4), with `build` and `twine` added for the
wheel gate exactly as CI's `package` job does.

| # | Gate | Command | Result | Exit |
|---|---|---|---|---|
| 1 | Python tests (locked env) | `python -m pytest` | 342 collected: 341 passed, 1 skipped | 0 |
| 2 | Dependency integrity | `python -m pip check` | `No broken requirements found.` | 0 |
| 3 | Lint | `python -m ruff check .` | `All checks passed!` | 0 |
| 4 | Types | `python -m mypy .` | `Success: no issues found in 129 source files` | 0 |
| 5 | Docs index and links | `python -m scripts.docs_check` | `43 indexed, non-empty, linked documentation files` | 0 |
| 6 | Release metadata | `python -m scripts.release_check` | `local npm/PyPI metadata and published-version documentation agree` | 0 |
| 7 | Node suites (from `packages/grudge`) | `npm test` | 173 tests, 173 pass, 0 fail | 0 |
| 8 | npm artifact gate | `npm run release:verify` | `PASS (30/30 checks)` | 0 |
| 9 | Wheel artifact gate | `python scripts/verify_wheel.py` | `PASS (8/8 checks)` | 0 |
| 10 | Shared conformance | `python -m pytest tests/test_guard_conformance.py` and `node --test test/phase15-core.test.js` | 41 fixtures, both engines agree | 0 |

The suite grew from 338 Python and 143 Node tests at Phase 5 to 342 and 173:
`install-root.test.js` (10), `tests/test_real_wheel.py` (4), the new installer
cases (43 total), `stats-consistency.test.js` (15, including the `record`
concurrency case), `release-packaging.test.js` (9) and `test_release_check.py`
(10).

### 14.6 What remains

F5 is the only finding from either review that is not fixed, and it is a
documented limitation rather than an open defect. Everything else that is still
undone is process, not code: pushing these commits, observing CI on them, and
publishing a corrected version (§10 rows 1–3).
