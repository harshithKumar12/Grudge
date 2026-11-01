# Final release consistency report

**Purpose:** Record the three release-consistency defects found in independent
testing, the root cause and fix for each, the exact artifact that was verified,
and the release verdict.
**Audience:** Maintainers cutting the next `grudge-cli` release and reviewers
checking the claims.
**Status:** final
**Last updated (phase):** 0.2.1 release consistency - 2026-11-01

## 1. Bottom line

**Verdict: READY FOR RELEASE CANDIDATE.**

The source tree now builds an artifact that is provably the tested
implementation, and the three reported defects are resolved or, for issue 3,
accurately documented as a host limitation that Grudge cannot fix.

Nothing was committed, tagged, pushed, or published. The working tree is dirty
by design and the version was deliberately **not** bumped.

Two conditions must be met before `npm publish`, and neither is a defect in this
tree:

1. **Bump the version to `0.2.2`** (or any unused version). The registry already
   holds `grudge-cli@0.2.1`, so this tarball cannot be published under its
   current name and the stale 0.2.1 stays `latest` until a new version ships.
2. **Re-run `npm run release:verify` after the bump.** The gate reads the
   version from the packed tarball and fails if the installed runtime disagrees.

## 2. What was tested

| Item | Value |
|---|---|
| Repository | `C:\Users\kotes\Desktop\Grudge` |
| Git HEAD | `0e062935add8bf8e2986e17e19e30a2e97cbbec1` ("fix(enforcement): close audit P0-1..P0-4 and P1-1", 2026-10-31 16:25:32 +0530) |
| Working tree | Uncommitted changes on top of HEAD (see §7) |
| Package | `grudge-cli` |
| Version | `0.2.1` (unchanged; see §1) |
| Tarball tested | `grudge-cli-0.2.1.tgz`, 107198 bytes, 50 entries, unpacked 387227 bytes |
| Tarball SHA-1 (npm `shasum`) | `24f0b81936df003e7d0ba9c3c3b2d5fac4e8ab69` |
| Tarball SHA-256 | `D99C1A2185AEF092B9414DBB0CEBDC896863C712FAEB08C23AE87AA1A5C04106` |
| Tarball SRI | `sha512-tfxKLgdLm+DQ9t3jwt5Zq8Xii7bw1+7jpABegMQfpablU0buzSz4FB3cNXQJ98ZJDP+u6LMPeF8zOgyW9JlDVQ==` |
| Bundled `dist/grudge.mjs` | 196414 bytes, SHA-256 `86340BFE6C442DD9358EE66316778917D110A76B87EDAB5E0BC99ECA510A3108` |
| Node | `C:\Program Files\nodejs\node.exe` (v20 line; absolute path used in every hook) |
| Claude Code | `2.1.283` |
| Published artifact compared against | `grudge-cli@0.2.1`, published 2026-10-31T07:18:41.737Z, SHA-1 `bb2e7f9930d6333c7d3d76bbe7a3888fcda749d2`, 48 files, unpacked 341095 bytes |

The tarball is reproducible in the sense that matters here: two independent
`npm pack` runs from this tree produced the same SHA-1 (`24f0b819…`), because
`prepack` now rebuilds `dist/` from `src/` every time.

## 3. Issue 1 — the published npm package was a stale bundle

### 3.1 Root cause

Confirmed, with evidence:

- `packages/grudge/package.json` had **no `prepack` script**. `git log -S
  'prepack' -- packages/grudge/package.json` returns nothing: it never existed.
- `.gitignore` ignores `dist/`, so the built bundle is never in the repository
  and nothing forces it to be current at publish time.
- `npm publish` therefore packed **whatever `dist/grudge.mjs` happened to be on
  the packer's disk**, with no build and no test.

Timeline:

| Time (IST) | Event |
|---|---|
| 2026-10-31 12:45:24 | `a4788c0 chore: release 0.2.1` — touched only `CHANGELOG.md`, `README.md`, `TEST.md`, `grudge/cli/_common.py`, `pyproject.toml`. No `dist`, no build. |
| 2026-10-31 12:48:41 | `npm publish` (`2026-10-31T07:18:41.737Z`). The packed `dist/` predates the enforcement fixes. |
| 2026-10-31 16:25:32 | `0e06293` adds absolute `runtimeCommand`, `src/core/roots.js`, `src/core/rules.js`, and the `hook paths` doctor check — 3.5 hours after publishing. Never republished. |

Result: the published `dist/grudge.mjs` is 173072 bytes with **no `hook paths`
string**, and its `setup.js` still computes

```js
selectedScope === "global" ? `node ${...}` : "node .grudge/bin/grudge.mjs"
```

so `npx grudge-cli@0.2.1 setup --scope repo` writes a relative hook command that
stops resolving as soon as Claude Code runs it from a subdirectory — and Claude
Code treats the failed command as "allowed".

### 3.2 Published vs rebuilt artifact

| Surface | Published `0.2.1` | Tarball built from this tree |
|---|---|---|
| `shasum` | `bb2e7f9930d6333c7d3d76bbe7a3888fcda749d2` | `24f0b81936df003e7d0ba9c3c3b2d5fac4e8ab69` |
| Packed files | 48 | 50 |
| Unpacked size | 341095 | 387227 |
| `dist/grudge.mjs` bytes | 173072 | 196414 |
| `dist/grudge.mjs` SHA-256 | `79E634FF8040…49ADD4` | `86340BFE6C44…0A3108` |
| `doctor` `hook paths` check | absent | present |
| Repo-scope hook command | `node .grudge/bin/grudge.mjs` | `"<node>" "<root>/.grudge/bin/grudge.mjs"` |
| `src/core/roots.js`, `src/core/rules.js` | not in the tarball | present |
| `scripts.prepack` / `prepublishOnly` | absent | `npm run build` / `npm test` |

The two missing source files are only a staleness fingerprint — the CLI runs the
bundled `dist/`, so 0.2.1 does not crash on them. The behavioural difference is
the relative hook command and the missing doctor check, both reproduced above.

### 3.3 What changed

| File | Change |
|---|---|
| `packages/grudge/package.json` | `prepack: npm run build`, `prepublishOnly: npm test`, `release:verify: node scripts/verify-release.mjs` |
| `packages/grudge/scripts/verify-release.mjs` | New gate: build → pack → install into a clean external directory → exercise the installed artifact (18 checks) |
| `packages/grudge/src/installer/adapters/claude-code.js` | New exported `defaultRuntimeCommand()`; `plan()` and `commandFor()` no longer fall back to the relative literal |
| `packages/grudge/test/release-packaging.test.js` | New: asserts the pack/build/publish scripts, the bundle contents, the adapter fallback, and the absolute registration produced by `setup` |
| `scripts/release_check.py` | Fails when `prepack`, `prepublishOnly`, or a required `files` entry is missing |
| `tests/test_release_check.py` | Negative tests for each of those assertions |
| `.github/workflows/grudge-guard.yml` | New step: `npm run release:verify` after the tarball install job |

### 3.4 Proof

`npm run release:verify` → **PASS (30/30 checks)**, exit 0:

```text
[ok] metadata: every release surface reports one version: 0.2.1
[ok] metadata: CHANGELOG documents this version: ## 0.2.1
[ok] metadata: README states the release status: prepared
[ok] publish gate runs the tests and this verifier: npm test && npm run release:verify
[ok] build output stays out of version control: dist/ is gitignored
[ok] build
[ok] pack: > grudge-cli@0.2.1 prepack
[ok] pack reports a tarball filename and version: grudge-cli-0.2.1.tgz
[ok] tarball contains the required runtime files: 50 files
[ok] tarball excludes development-only files: none
[ok] tarball reports the release version: grudge-cli@0.2.1
[ok] tarball is the built bundle: grudge-cli-0.2.1.tgz dist/grudge.mjs 205708 bytes, built 205708 bytes
[ok] bundle registers absolute runtimes: absolute runtimeCommand present
[ok] bundle ships the hook paths check: "hook paths" doctor check present
[ok] install tarball into a clean directory
[ok] installed bundle is the freshly built bundle: sha256 match
[ok] installed runtime does not reference the repository: no absolute repository paths
[ok] runtime needs no undeclared dependency: node builtins only
[ok] installed runtime reports the package version: grudge 0.2.1
[ok] setup
[ok] installed runtime exists: …\project\.grudge\bin\grudge.mjs
[ok] registered hook command uses absolute paths: "C:\Program Files\nodejs\node.exe" "…\project\.grudge\bin\grudge.mjs" hook PreToolUse
[ok] config records the absolute runtime command: "C:\Program Files\nodejs\node.exe" "…\project\.grudge\bin\grudge.mjs"
[ok] doctor passes hook paths: absolute and present
[ok] propose and accept: [ok] Proposal: scar-3ed200373fd3
[ok] blocks from the project root: exit 2
[ok] blocks from a nested directory: exit 2
[ok] block reason is visible: grudge: blocked by scar-3ed200373fd3: Never call shell with the specified argume
[ok] stats and report agree: stats.blocks=2 report.blocked=2
[ok] installed runtime verifies its own guard: Result: PASS (10/10 checks)

Result: PASS (30/30 checks)
Tarball: … (grudge-cli@0.2.1, removed with the temporary directory)
Nothing was published.
```

The gate runs in a fresh `mkdtemp` directory, so the install is external to the
repository and to `node_modules` of any existing project. A second, manual run
into the persistent directory `D:\Temp\grudge-manual` reproduced the same
registration:

```text
install exit=0
grudge 0.2.1
setup exit=0
PreToolUse command: "C:\Program Files\nodejs\node.exe" "D:\Temp\grudge-manual\project\.grudge\bin\grudge.mjs" hook PreToolUse
SessionStart command: "C:\Program Files\nodejs\node.exe" "D:\Temp\grudge-manual\project\.grudge\bin\grudge.mjs" hook SessionStart
statusLine: "C:\Program Files\nodejs\node.exe" "D:\Temp\grudge-manual\project\.grudge\bin\grudge.mjs" statusline
config.runtimeCommand: "C:\Program Files\nodejs\node.exe" "D:\Temp\grudge-manual\project\.grudge\bin\grudge.mjs"
doctor.ok=True
hook paths: absolute and present
```

One subtlety the gate also encodes: hook checks must run the **installed** copy
at `<project>/.grudge/bin/grudge.mjs`, not the package's own `dist/grudge.mjs`.
Only the installed copy is the install anchor that resolves the project root, so
running `dist/` against an installed project reports "not installed here" and
finds no rules. The first version of the gate used `dist/` and failed three
checks for exactly that reason; the passing run above uses the installed copy.

## 4. Issue 2 — `grudge stats` printed `Blocks: 0`

### 4.1 Source of truth

- **Canonical:** `.grudge/stats.jsonl`, the append-only event log written by the
  hook paths through `appendEvent()`.
- **Legacy:** `.grudge/stats.json`, the counter file written by the older
  `record()` path. Hooks no longer update it, so on any installation created
  after that change it stays at its zeroed default.
- `aggregate()` reads the event log and falls back to the legacy counters only
  when the log contains no events, which keeps pre-0.2.1 installations readable.

### 4.2 Root cause

`src/commands/stats.js` built its result as `{ ...counters, caught, blocked,
warned, proposals, accepted, … }`. The spread copied the stale
`blocks`/`warnings`/`proposals`/`acceptedScars` fields from `stats.json`, and
only the `caught/blocked/warned` aliases were recomputed from the aggregate. The
renderer prints `Blocks: 0` because it reads `blocks`, not `blocked`.

### 4.3 Reproduction against the published artifact

Both commands were run on the same fixture — a project whose `stats.jsonl` holds
7 events, of which 2 are `catch/blocked`:

```text
--- published 0.2.1 stats ---
Grudge stats v0.2.1
[ok] Blocks: 0
[ok] Warnings: 0
[ok] Scars: 0
[ok] Estimated savings: ~3000 tokens

--- published 0.2.1 report ---
Grudge report v0.2.1
[ok] lifetime: 2 caught, 2 blocked, 0 warned
```

That is the reported discrepancy exactly.

### 4.4 Fix and after-state

`src/commands/stats.js` now derives `blocks`, `warnings`, `proposals`, and
`acceptedScars` from the aggregate, keeps the `caught/blocked/warned/accepted`
aliases, and falls back to `report.accepted` when `compiled.json` is absent.
`src/commands/statusline.js` had the same defect on its lifetime line and now
prints `lifetime.blocked`. The CLI output shape is unchanged — four status
lines, same labels, same ordering.

Same fixture, rebuilt tarball:

```text
--- rebuilt tarball stats ---
Grudge stats v0.2.1
[ok] Blocks: 2
[ok] Warnings: 0
[ok] Scars: 1
[ok] Estimated savings: ~3000 tokens

--- rebuilt tarball report ---
Grudge report v0.2.1
[ok] lifetime: 2 caught, 2 blocked, 0 warned

stats.blocks=2 stats.warnings=0 stats.proposals=1 stats.scars=1
report.blocked=2 report.warned=0 report.accepted=1
```

### 4.5 Edge cases covered by tests

| Case | Expected | Covered by |
|---|---|---|
| Events present, legacy counters stale at zero | canonical counts win | `stats counts blocks from the canonical append-only log…` |
| No events, legacy `stats.json` present | legacy counts still read | `stats keeps legacy stats.json readable when no events were ever appended` |
| No `.grudge/` at all | zeros, no throw | `stats returns zeros for a missing installation instead of throwing` |
| Corrupt legacy JSON plus a truncated event line | valid events still counted | `stats survives a corrupt legacy file and corrupt event lines` |
| Status line lifetime count | matches `stats` | `statusline reports the same lifetime block count as stats` |
| Built CLI contract | `stats.blocks == report.lifetime.blocked` | `the built CLI prints the same counts for stats and report` |

## 5. Issue 3 — Claude Code nested settings discovery

### 5.1 Measured behaviour (not a Grudge defect)

Measured with Claude Code 2.1.283 on Windows 11, 2026-11-01, against a project
installed with `--scope repo` and a blocking rule:

| Session start directory | Hooks loaded | Result of the prohibited call |
|---|---|---|
| project root | yes | blocked, exit 2, reason on the tool result |
| `project/nested` | **no** | executed; `.grudge/stats.jsonl` gained no event |
| `project/nested` with `--settings <project>/.claude/settings.json` | yes | blocked, exit 2 |

Claude Code reads a project's `.claude/settings.json` from the directory the
session starts in. It does not walk up to the repository root. When the session
starts below the root the hook command never runs, so **no change to the command
can fix this** — that is why the absolute-path fix and this issue are separate.

**This was not fixed, and the documentation no longer implies that it was.**

### 5.2 What changed instead

| File | Change |
|---|---|
| `README.md` | "Absolute paths matter" now says explicitly that absolute paths are *necessary but not sufficient*, and lists the two remedies (`cd <repo> && claude`, `claude --settings <repo>/.claude/settings.json`) plus the user-scope alternative |
| `docs/hooks.md` | New "Claude Code settings discovery" section with the measured table, why `/hooks` can be empty while `doctor` is green, and the three supported options |
| `docs/integrations.md` | New "Claude Code launch directory" note under the integration table |

**Update (2026-11-01, production-readiness remediation).** `doctor` and `setup`
now surface this limitation instead of leaving it to the docs:

| File | Change |
|---|---|
| `packages/grudge/src/commands/doctor.js` | Resolves the install root upward from the directory `doctor` runs in, and adds a `launch directory` check that fails when project hooks are installed at a different root, naming the `claude --settings <root>/.claude/settings.json` remedy |
| `packages/grudge/src/commands/setup.js` | Prints the same limitation and both remedies at install time, and points at `--scope global` |
| `packages/grudge/src/output.js` | Doctor's human output suggests `grudge setup --scope global` when the launch directory is the only failing check |

The host's session directory is still not guessed. The check compares the
directory `doctor` was invoked from with the installed root, which is the one
fact a file check can observe; a session that starts elsewhere afterwards
remains the documented `/hooks` limitation. The measured table in §5.1 is
unchanged.

### 5.3 User-scope alternative

`grudge setup --scope global --agents claude-code` writes
`~/.claude/settings.json`, which Claude Code loads in every project, so a session
started anywhere is covered. Grudge never selects user scope implicitly and
never rewrites unrelated user settings. The user's real `~/.claude/settings.json`
and `~/.claude/CLAUDE.md` were **not** touched by this work; every install
described here was written under a temporary project directory.

## 6. Validation results

All commands were run from `C:\Users\kotes\Desktop\Grudge` or
`packages\grudge` as noted, on 2026-11-01.

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Node suite | `npm test` (in `packages/grudge`) | 143 tests, 143 pass, 0 fail, exit 0 |
| 2 | Python suite | `python -m pytest` | 338 selected: 337 passed, 1 skipped, exit 0 |
| 3 | Lint | `python -m ruff check .` | `All checks passed!`, exit 0 |
| 4 | Types | `python -m mypy .` | `Success: no issues found in 128 source files`, exit 0 |
| 5 | Docs | `python -m scripts.docs_check` | `docs-check: 43 indexed, non-empty, linked documentation files`, exit 0 |
| 6 | Release metadata | `python -m scripts.release_check` | exit 0 |
| 7 | Build + pack + clean install + behaviour | `npm run release:verify` | PASS 30/30, exit 0 |
| 8 | Setup from the installed tarball | `node <consumer>/node_modules/grudge-cli/dist/grudge.mjs setup --cwd D:\Temp\grudge-manual\project --yes --agents claude-code --scope repo` | exit 0, absolute commands (see §3.4) |
| 9 | Doctor | `node … doctor --json --cwd D:\Temp\grudge-manual\project` | `ok=True`, `hook paths: absolute and present` |
| 10 | Block from root | `… hook PreToolUse` with `cwd` = project | exit 2, `permissionDecision: deny` |
| 11 | Block from nested | `… hook PreToolUse` with `cwd` = `project\nested` | exit 2, `permissionDecision: deny` |
| 12 | Reason visible | same as above | stdout reason + `grudge: blocked by scar-de64791f01e3: …` on stderr |
| 13 | Stats vs report | `… stats --json` / `… report --json` | `blocks=2` == `blocked=2`, `warnings=0` == `warned=0`, `caught=2` == `caught=2` |
| 14 | `grudge verify` | `… verify --cwd <project>` | `Result: PASS (10/10 checks)`, exit 0 |
| 15 | Artifact comparison | `npm pack --json` vs published 0.2.1 | see §3.2 |
| 16 | User changes preserved | `git status --porcelain` | see §7 |

### 6.1 Documentation and release checks

`python -m scripts.docs_check` reports `42 indexed, non-empty, linked
documentation files`, which now includes this report and the test matrix. The
release check additionally asserts that `prepack` builds, `prepublishOnly` tests,
and that `files` ships `dist`, `src`, and `package.json`.

## 7. Constraints honored

- **Nothing was published, committed, pushed, tagged, merged, or deployed.** The
  tarball lives under `D:\Temp`.
- `HEAD` is still `0e062935add8bf8e2986e17e19e30a2e97cbbec1`; every change is in
  the working tree.
- The version was not bumped; that decision is left to the maintainer (§1).
- No user-level Claude Code file was modified. All installs were written into
  temporary project directories.
- Pre-existing working-tree changes from earlier work (`.gitignore`, `CLAUDE.md`,
  `docs/INDEX.md`, `packages/grudge/package-lock.json`,
  `packages/grudge/package.json`, `packages/grudge/src/version.js`,
  `packages/grudge/test/phase22-install-hardening.test.js`, `.claude/`, and the
  two independent re-audit documents) were left in place. The pre-existing
  `package.json` and `version.js` edits are the 0.2.0 → 0.2.1 bump; the only new
  edits to `package.json` are the three scripts.

### 7.1 Files touched by this work

Modified:

- `packages/grudge/package.json` — `prepack`, `prepublishOnly`, `release:verify`
- `packages/grudge/src/commands/stats.js` — canonical counts
- `packages/grudge/src/commands/statusline.js` — lifetime block count
- `packages/grudge/src/installer/adapters/claude-code.js` — absolute default
- `scripts/release_check.py` — packaging assertions
- `tests/test_release_check.py` — negative tests
- `README.md`, `docs/hooks.md`, `docs/integrations.md`, `docs/INDEX.md`
- `.github/workflows/grudge-guard.yml` — release gate step

Added:

- `packages/grudge/scripts/verify-release.mjs`
- `packages/grudge/test/release-packaging.test.js`
- `packages/grudge/test/stats-consistency.test.js`
- `docs/FINAL-RELEASE-CONSISTENCY-REPORT.md`
- `docs/FINAL-RELEASE-CONSISTENCY-TEST-MATRIX.md`

## 8. Residual risk

| Risk | Status |
|---|---|
| The registry still serves the broken 0.2.1 | Open by design — a new version must be published (§1) |
| `prepublishOnly` runs the full suite, so publishing takes ~90 s longer | Accepted; that is the point of the gate |
| `release:verify` requires a working `npm` on the packer's machine | Accepted; the gate fails loudly instead of shipping blind |
| Nested-session enforcement | Documented limitation of the host, not fixed (§5) |
| Legacy `stats.json`-only installs | Still readable through the `aggregate()` fallback, covered by test |

## 9. Recommendation

Cut `0.2.2` from this tree:

```bash
cd packages/grudge
# bump version in package.json, package-lock.json, src/version.js, and update
# CHANGELOG.md, README.md, pyproject.toml per the existing release checklist
npm run release:verify     # must print PASS (30/30 checks)
npm publish                # deliberately not run in this session
```

`prepublishOnly` will re-run `npm test`, and `prepack` will rebuild `dist/`,
which closes the exact path by which 0.2.1 shipped a stale bundle.
