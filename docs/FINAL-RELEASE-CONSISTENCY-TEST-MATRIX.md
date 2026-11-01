# Final release consistency test matrix

**Purpose:** Give every check behind the release verdict a reproducible command,
an expected result, the observed result, and its status.
**Audience:** Reviewers reproducing the release-consistency claims, and
maintainers re-running the gate before publishing.
**Status:** final
**Last updated (phase):** 0.2.1 release consistency - 2026-11-01

## Environment

| Item | Value |
|---|---|
| Date | 2026-11-01 |
| Git HEAD | `0e062935add8bf8e2986e17e19e30a2e97cbbec1` plus uncommitted working-tree changes |
| Package version | `0.2.1` (not bumped) |
| Tarball under test | `grudge-cli-0.2.1.tgz`, `shasum 24f0b81936df003e7d0ba9c3c3b2d5fac4e8ab69`, 50 entries, 107198 bytes |
| External install root | `D:\Temp\grudge-manual\consumer`, project at `D:\Temp\grudge-manual\project` |
| Published artifact compared | `grudge-cli@0.2.1`, `shasum bb2e7f9930d6333c7d3d76bbe7a3888fcda749d2`, 48 files |
| Claude Code | `2.1.283` |
| Node | `C:\Program Files\nodejs\node.exe` |

Status vocabulary: **PASS** — reproduced as expected; **FAIL** — reproduced a
defect (only for the pre-fix artifact); **NOT RUN** — deliberately not executed,
with the reason recorded.

## A. Release pipeline (issue 1)

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| A1 | Packaging rebuilds the bundle | `git log -S 'prepack' -- packages/grudge/package.json` | no output before the fix; `prepack` present after | no output before; `"prepack": "npm run build"` after | PASS |
| A2 | `dist/` is not in git | `git check-ignore -v packages/grudge/dist/grudge.mjs` | ignored | ignored, so the shipped bundle could never be stale-proof | PASS (root cause confirmed) |
| A3 | Pack runs the build | `npm pack --json --pack-destination D:\Temp\grudge-artifact` | `prepack` runs, tarball built from `src/` | `> grudge-cli@0.2.1 prepack` then a 107198-byte tarball | PASS |
| A4 | Tarball identity is stable | two independent `npm pack` runs | identical `shasum` | `24f0b819…` both times | PASS |
| A5 | Published bundle lacks the fix | search published `dist/grudge.mjs` for `hook paths` | absent (stale build) | absent; 173072 bytes | FAIL (pre-fix artifact) |
| A6 | Rebuilt bundle carries the fix | search `dist/grudge.mjs` for `hook paths` and `shellQuote(process.execPath)` | both present | both present; 196414 bytes | PASS |
| A7 | Packed file set differs from published | `npm pack --dry-run --json` vs published tree | rebuilt adds what the stale build omitted | rebuilt adds `src/core/roots.js`, `src/core/rules.js`; 50 vs 48 entries | PASS |
| A8 | Clean external install | `npm install D:\Temp\grudge-artifact\grudge-cli-0.2.1.tgz --no-save` in an empty consumer | exit 0 | exit 0 | PASS |
| A9 | Installed version matches the package | `node <consumer>/node_modules/grudge-cli/dist/grudge.mjs --version` | `grudge 0.2.1` | `grudge 0.2.1` | PASS |
| A10 | Gate script exists and is wired | `npm run release:verify` | runs `scripts/verify-release.mjs` | 30 checks executed | PASS |
| A11 | Gate passes end to end | `npm run release:verify` | `Result: PASS (30/30 checks)` | PASS 30/30, exit 0, "Nothing was published." | PASS |
| A12 | Packaging metadata is asserted in Python | `python -m scripts.release_check` | exit 0 | exit 0 | PASS |
| A13 | Missing `prepack` is caught | `pytest tests/test_release_check.py -k prepack` | reported error | `packages/grudge/package.json prepack must run the build before packing` | PASS |
| A14 | Missing `prepublishOnly` is caught | `pytest tests/test_release_check.py -k prepublish` | reported error | `… prepublishOnly must run the test suite` | PASS |
| A15 | Missing packed directory is caught | `pytest tests/test_release_check.py -k packed` | reported error | `… files is missing dist` | PASS |
| A16 | Version drift is caught | `pytest tests/test_release_check.py -k version_drift` | reported errors | CHANGELOG/README/version errors reported | PASS |
| A17 | CI runs the gate | `.github/workflows/grudge-guard.yml` | step present | `Verify the packed artifact is the tested implementation` → `npm run release:verify` | PASS |
| A18 | Adapter has no relative fallback | `node --test test/release-packaging.test.js` | absolute default command | `process.execPath` + absolute `<root>/.grudge/bin/grudge.mjs` | PASS |

## B. Setup, registration, and doctor (installed tarball)

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| B1 | Setup succeeds from the installed CLI | `node <consumer>/…/dist/grudge.mjs setup --cwd D:\Temp\grudge-manual\project --yes --agents claude-code --scope repo` | exit 0 | exit 0 | PASS |
| B2 | Hook commands are absolute | read `.claude/settings.json` | both tokens absolute | `"C:\Program Files\nodejs\node.exe" "D:\Temp\grudge-manual\project\.grudge\bin\grudge.mjs" hook PreToolUse` | PASS |
| B3 | All five events registered absolutely | read `settings.hooks` | SessionStart…Stop all absolute | all five identical in form | PASS |
| B4 | Status line is absolute | read `settings.statusLine.command` | absolute | `… statusline` with absolute script | PASS |
| B5 | Config records the runtime command | read `.grudge/config.json` | absolute | `"C:\Program Files\nodejs\node.exe" "…\.grudge\bin\grudge.mjs"` | PASS |
| B6 | Installed runtime is written | `Test-Path .grudge\bin\grudge.mjs` | exists | exists | PASS |
| B7 | Doctor validates hook paths | `node <installed> doctor --json --cwd <project>` | `hook paths` ok | `{"name":"hook paths","ok":true,"detail":"absolute and present"}`, `doctor.ok=True` | PASS |
| B8 | Doctor rejects a relative command | rewrite `settings.hooks.SessionStart` to `node .grudge/bin/grudge.mjs hook SessionStart`, re-run doctor | `hook paths` fails | `ok:false`, `re-run grudge setup: node .grudge/bin/grudge.mjs hook SessionStart (relative path)` | PASS |
| B9 | Doctor flags a missing script | point `PreToolUse` at `…\.grudge\bin\absent\grudge.mjs`, re-run doctor | `hook paths` fails | `ok:false`, `… hook PreToolUse (script missing)` | PASS |

`hook paths` validates commands it recognises as Grudge hooks, i.e. those whose
tokens include a `grudge.mjs` script; a command pointing at an unrelated entry
point is not a Grudge registration and is left to the host's own diagnostics.

## C. Enforcement (installed tarball)

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| C1 | Record a session before proposing | `… hook PostToolUse` with a real payload on stdin | exit 0 | exit 0 | PASS |
| C2 | Propose and admit a scar | `… propose --rule-stdin --why … --preventive --accept` with `never call shell where command ~ "MANUAL_BLOCK_TOKEN"` | accepted | `[ok] Proposal: scar-de64791f01e3`, `[ok] Status: accepted and enforced` | PASS |
| C3 | Block from the project root | `… hook PreToolUse` with `cwd` = project | exit 2, deny | exit 2, `permissionDecision":"deny"` | PASS |
| C4 | Block from a nested directory | `… hook PreToolUse` with `cwd` = `project\nested` | exit 2, deny | exit 2, `permissionDecision":"deny"` | PASS |
| C5 | Block reason is machine-readable | inspect stdout | JSON with `blocked:true`, `reason`, `scarId` | present | PASS |
| C6 | Block reason is human-readable | inspect stderr | one diagnostic line | `grudge: blocked by scar-de64791f01e3: Never call shell with the specified arguments. …` | PASS |
| C7 | Governance is preserved under load | `node --test test/concurrency-enforcement.test.js` | all pass | passes | PASS |
| C8 | Post-tool-use capture, redaction, dedupe | `node --test test/post-tool-use.test.js` | all pass | passes | PASS |
| C9 | Built-in self-proof | `… verify --cwd <project>` | `Result: PASS (10/10 checks)` | PASS 10/10, exit 0 | PASS |

## D. Statistics (issue 2)

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| D1 | Published CLI reproduces the bug | published `dist/grudge.mjs stats --cwd <fixture>` with 2 blocked events | `Blocks: 0` | `Blocks: 0` | FAIL (pre-fix artifact) |
| D2 | Published CLI report is correct | published `report --cwd <fixture>` | `2 blocked` | `lifetime: 2 caught, 2 blocked, 0 warned` | PASS |
| D3 | Fixed CLI matches the event log | rebuilt `stats --cwd <fixture>` | `Blocks: 2` | `Blocks: 2`, `Scars: 1` | PASS |
| D4 | Fixed CLI agrees with report | rebuilt `stats --json` vs `report --json` | equal | `blocks=2` == `blocked=2`, `warnings=0` == `warned=0`, `caught=2` == `caught=2` | PASS |
| D5 | Empty installation | `stats` with no `.grudge/` | zeros, exit 0 | zeros | PASS |
| D6 | Legacy-only installation | `stats` with only `.grudge/stats.json` | legacy counts read | 4 blocks / 1 warning / 2 proposals / 3 accepted | PASS |
| D7 | Corrupt legacy file | invalid JSON + a truncated event line | valid events counted, no throw | 1 block counted | PASS |
| D8 | Missing event file | delete `stats.jsonl` from an installed project | fallback, no throw | `exit=0`, `blocks=0`; restoring the log returns `blocks=2` | PASS |
| D9 | Status line parity | `statusline` on the same fixture | `2 blocked` | `2 blocked` | PASS |
| D10 | Output conventions preserved | compare human output shape | 4 status lines, same labels | `Blocks`/`Warnings`/`Scars`/`Estimated savings` unchanged | PASS |

## E. Claude Code settings discovery (issue 3)

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| E1 | Session started at the project root | `cd <project> && claude` | hooks load, prohibited call blocked | blocked, exit 2, reason on the tool result | PASS (measured earlier this session) |
| E2 | Session started in a nested directory | `cd <project>/nested && claude` | hooks **not** loaded, call executes | executed; no event appended to `.grudge/stats.jsonl` | PASS (limitation confirmed) |
| E3 | Nested session with explicit settings | `claude --settings <project>/.claude/settings.json` from `nested` | hooks load, call blocked | SessionStart + PreToolUse fired, `catch/blocked` recorded, call blocked | PASS (documented remedy works) |
| E4 | Documentation states the limitation | read `docs/hooks.md` §Claude Code settings discovery | measured table + remedies | present | PASS |
| E5 | README does not over-claim absolute paths | read `README.md` §Integrations | "necessary but not sufficient" | present, with both remedies | PASS |
| E6 | Integration doc carries the launch-directory note | read `docs/integrations.md` | note present | present | PASS |
| E7 | Live Claude Code re-run in this validation pass | — | — | NOT RUN | NOT RUN — E1–E3 were measured in this session with 2.1.283; re-running would make Claude Code write project-trust state into the user's `~/.claude.json`, which the constraints exclude |
| E8 | User-scope install | `grudge setup --scope global` | would write `~/.claude/settings.json` | NOT RUN | NOT RUN — would modify the user's real Claude Code settings; the behaviour is documented, not executed |
| E9 | Doctor reports a nested launch directory (added 2026-11-01) | `node <installed>/grudge.mjs doctor --json --cwd <project>/nested` | `launch directory` fails and names `--settings` | `launch directory` `ok:false` with the `--settings` remedy; `config`, `hook paths`, and `.gitignore` still pass; human output ends `Next: grudge setup --scope global` | PASS |

## F. Suites, lint, types, documentation

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| F1 | Node regression suite | `npm test` (in `packages/grudge`) | all pass | 143 tests, 143 pass, 0 fail, exit 0 | PASS |
| F2 | New stats tests | `node --test test/stats-consistency.test.js` | 6 pass | 6 pass | PASS |
| F3 | New packaging tests | `node --test test/release-packaging.test.js` | 6 pass | 6 pass | PASS |
| F4 | Python suite | `python -m pytest` | all pass | 338 selected: 337 passed, 1 skipped, exit 0 | PASS |
| F5 | Lint | `python -m ruff check .` | clean | `All checks passed!` | PASS |
| F6 | Types | `python -m mypy .` | clean | `Success: no issues found in 128 source files` | PASS |
| F7 | Documentation contract | `python -m scripts.docs_check` | exit 0 | `43 indexed, non-empty, linked documentation files`, exit 0 | PASS |
| F8 | Release metadata | `python -m scripts.release_check` | exit 0 | exit 0 | PASS |

## G. Constraints

| ID | Case | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| G1 | Nothing was published | `npm view grudge-cli version` | still `0.2.1`, `latest` unchanged | `0.2.1` | PASS |
| G2 | Nothing was committed or tagged | `git rev-parse HEAD`, `git tag --points-at HEAD` | HEAD unchanged, no new tag | `0e06293…`, no tag | PASS |
| G3 | No user Claude settings touched | compare `~/.claude/settings.json` before/after | unchanged | unchanged; every install written under `D:\Temp` | PASS |
| G4 | Pre-existing changes preserved | `git status --porcelain` | earlier modifications untouched | `.gitignore`, `CLAUDE.md`, `docs/INDEX.md`, `packages/grudge/package-lock.json`, `packages/grudge/package.json`, `packages/grudge/src/version.js`, `packages/grudge/test/phase22-install-hardening.test.js`, `.claude/`, the two re-audit docs all still present | PASS |

## Summary

| Area | Pass | Fail (pre-fix artifact) | Not run |
|---|---:|---:|---:|
| A. Release pipeline | 18 | 1 (A5) | 0 |
| B. Setup, registration, doctor | 9 | 0 | 0 |
| C. Enforcement | 9 | 0 | 0 |
| D. Statistics | 9 | 1 (D1) | 0 |
| E. Settings discovery | 6 | 0 | 2 (E7, E8) |
| F. Suites and static checks | 8 | 0 | 0 |
| G. Constraints | 4 | 0 | 0 |

The two `FAIL` rows are not regressions: they are the pre-fix published
artifact, reproduced on purpose to document the defect. Every check against the
rebuilt tarball passes.
