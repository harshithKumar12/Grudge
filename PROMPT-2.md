# PROMPT-2.md: Grudge Guard (hooks + AGENTS.md, no MCP, no servers)

This file is the **sequel to `PROMPT.md`**. `PROMPT.md` built the engine (Phases 0 to 13). This file adds **Phases 14 to 21**: turning Grudge into something developers install in their own coding CLI with one command, for free.

> **Supersedes** any earlier "Phase 14: npx installer" message that mentioned an MCP server. **MCP is OUT.** If `Progress.md` already contains a Phase 14, replace it with the one below and log a Decision.

---

## 0. PRE-FLIGHT (identical rules to PROMPT.md Section 0)

Before any change, every session and every phase:
1. Read `AGENTS.md` in full. It wins on process, style and tooling. Never edit it, except through the managed block described in Phase 18 *in the example repos the installer touches, never in this repo's own AGENTS.md* (this repo's `AGENTS.md` stays owner-only).
2. Read `PROMPT.md` (rules, Section 6 exit protocol) and this file.
3. Read `Progress.md` and `docs/INDEX.md`.
4. Write a 3 to 8 bullet plan into the Session Log before coding.

All rules in `PROMPT.md` Section 1 still apply: one phase at a time, tests and docs ship with code, `Progress.md` stays accurate, small commits (`phase-N: ...`), no secrets, deterministic core, honest stubs.

**Lessons already learned in this project (follow them):**
- **Never invent exit gates.** The only gates are the ones written in `PROMPT.md` and in this file. Docker is not a gate. Do not pin tool versions tighter than stated here.
- **Never block on missing optional tooling.** If something is unavailable, record a limitation in `Progress.md`, give the owner the exact command to run, and continue with what you can verify.
- **Work runs in WSL or Linux or macOS.** Hook commands must also be tested for Windows path and quoting behavior, or explicitly marked "unverified on Windows".
- If a `git` command fails in your environment, print the exact commands for the owner and continue.

**Entry condition:** `PROMPT.md` Phases 0 to 9 are `[x]` in `Progress.md` (this file needs the DSL, admission, the gate and the CLI). Phases 10 to 12 (demo, viewer, polish) may run before or after this file. The owner decides; log it.

---

## 1. WHAT THIS ADDS

### 1.1 The product in one paragraph
A developer runs `npx grudge setup` in a repo, ticks the coding agents they use, and gets two things:
1. **Hooks** (Claude Code) that run on every tool call, with no model involved, and **block a previously-recorded mistake before it happens**.
2. **A short instruction block in `AGENTS.md`** (and the equivalent rules file for other agents) that tells the model when and how to **record a new mistake** by running one shell command.

Scars live in the repo (`.grudge/`), so one person's mistake protects the whole team.

### 1.2 Hard constraints (the owner's decisions)
- **No MCP server, no hosted service, no API key, no telemetry, no network at runtime.** Everything is local files plus a local script.
- **Model involvement = the host agent's own model**, using its normal shell tool to run `grudge propose`. There is no separate LLM call in this path.
- **"LLM drafts, code decides."** The model proposes a rule in the Grudge DSL. Deterministic code parses it, tests it against the recorded session, and only then stores it.
- **Free to run and free to ship:** npm package, plain Node, GitHub Actions free tier.
- **Guards must fail open.** Any internal error exits 0 with a short warning. A broken guard must never break a developer's session.

### 1.3 Honest tiers (use these words in docs and the README)
| Tier | Agents | Meaning |
|---|---|---|
| **Guard** | Claude Code (verified) | Hooks enforce scars before the tool runs. Deterministic. |
| **Advisory** | Agents that read `AGENTS.md` or a rules file | The model is told the rules and how to propose. Probable, not guaranteed. |
| **CI only** | Anything else | Scars are checked afterward by `grudge run` in the pull request. |

"The agent cannot repeat this mistake" is true **only** for mistakes a predicate can express (call shape, ordering, data flow) and **only** in Guard tier. Never claim more.

### 1.4 How a session flows
```
Session 1:  agent makes a mistake ─► user corrects it ─► model runs
            `grudge propose --rule '...'` ─► code tests rule on the session log
            ─► rule is stored as PENDING ─► user runs `grudge accept <id>`
                                          ─► compiled into .grudge/compiled.json
Session 2+: SessionStart injects the relevant scars as one-liners (tiny)
            PreToolUse checks every call against compiled.json ─► BLOCK with a short reason
            PostToolUse records what happened (for taint checks and future proposals)
```

---

## 2. KEY DESIGN DECISIONS (fixed; do not redesign)

1. **Single-file, zero-dependency hook script.** The installer copies one built file to `.grudge/bin/grudge.mjs`. Hooks call `node .grudge/bin/grudge.mjs hook <event>`. **No `npx` and no Python at runtime** (npx startup is too slow per tool call, and Python was the cause of a real SessionStart failure on Windows). The same file also serves `propose`, `scars`, `stats`, and `statusline`. The file is committed so teammates get it automatically.
2. **Node >= 18, plain JavaScript (ES modules) with `// @ts-check` and JSDoc types.** Tests use the built-in `node:test`. The installer UI may use one dependency (`@clack/prompts`); the built hook script must have **zero** runtime dependencies. A tiny build script concatenates or bundles sources into `dist/grudge.mjs` (esbuild as a devDependency is acceptable).
3. **Two implementations of the predicate checker (Python and Node), kept in sync by shared conformance fixtures** in `spec/conformance/`. Both test suites must pass the same fixtures. Python remains the source of truth for the full engine (shrink, admission with real agent runs). Node implements only what the runtime guard needs: **call-shape, ordering, and taint-flow-lite**.
4. **Canonical tool names.** Predicates talk about canonical tools, and each agent adapter normalizes its own tool events into them:
   `read_file{path}`, `write_file{path}`, `shell{command}`, `http{url,body}`, `mcp{server,tool,args}`, `other{name,args}`. For Claude Code: Read to `read_file`; Write, Edit, MultiEdit to `write_file`; Bash to `shell`; WebFetch to `http`; `mcp__*` to `mcp`. Verify the current tool names in the docs and record them in `docs/canonical-tools.md`.
5. **Trace-based admission for the runtime path.** A proposed rule is evaluated over the recorded session log (cheap, no model runs):
   - it must **fire at least once** on the session in question (otherwise it is vacuous), unless proposed with `--preventive`, which forces human review;
   - it must **not fire** on benign control sessions (all other recent sessions in `.grudge/session/`);
   - it must parse and type-check.
   Full counterfactual admission (red on bad agent, green on good agent) stays in the Python engine for the CI path.
6. **Human in the loop by default.** New proposals are `pending`. A person runs `grudge accept <id>` to promote them to `block`. `.grudge/config.json` may set `autoAccept: true`, which defaults to **false**. Per-scar modes: `block`, `warn`, `off`. Global kill switches: `GRUDGE_DISABLE=1` and `mode: "off"` in config.
7. **Token discipline is a tested feature, not a hope** (budgets in Phase 20).
8. **Scars are data, not code.** The only executable thing Grudge adds to a repo is the committed script; `grudge doctor` verifies its hash against the package version. Document this trust model.

---

## 3. ADDITIONS TO THE REPOSITORY LAYOUT

```
spec/
  compiled-predicates.schema.json     # contract between Python compile and Node hooks
  conformance/*.json                  # shared fixtures: {rule, events, expect}
  hook-payloads/claude-code/*.json    # realistic hook stdin payloads, per event
packages/grudge/                      # the npm package
  package.json                        # name, bin, files, engines, "type":"module"
  src/
    cli.js                            # setup | doctor | uninstall | hook | propose | scars
                                      # accept | stats | statusline
    dsl/parse.js  dsl/check.js        # JS port: call-shape, ordering, taint-lite
    core/{store,session,normalize,redact,config,budget,stats}.js
    hooks/{session-start,user-prompt-submit,pre-tool-use,post-tool-use,stop}.js
    installer/{detect,prompt,json-merge,managed-block,backup}.js
    installer/adapters/{claude-code,codex,cursor,gemini-cli,copilot,windsurf,opencode}.js
  scripts/build.mjs                   # produces dist/grudge.mjs
  test/**                             # node:test suites
grudge/guard/                         # Python side
  compile.py                          # admitted scars to .grudge/compiled.json
  import_session.py                   # .grudge/session/*.jsonl to schema.Trace
docs/
  guard-contract.md  canonical-tools.md  hooks.md  integrations.md
  instruction-block.md  token-budgets.md  trust-model.md
```
In a user's repo the installer creates (and `.gitignore`s what is local):
```
.grudge/
  config.json  compiled.json  scars/*.scar.json  pending/*.scar.json   # committed
  bin/grudge.mjs                                                       # committed
  session/  stats.json  *.log                                          # gitignored
```

---

# PHASES

Each phase ends with the **Phase Exit Protocol** from `PROMPT.md` Section 6 plus the extra checks listed. Add `make node-test` and `make node-build` targets; `make all` runs them when Node is available.

## PHASE 14: Contracts and the Python compile step
**Goal:** one data contract that Python writes and Node reads.

**Deliverables**
- `spec/compiled-predicates.schema.json` (JSON Schema): version, list of rules `{id, mode, kind, tool, match, ordering, taint, english, createdFrom}`. Small and flat so Node can interpret it without a parser.
- `grudge/guard/compile.py` plus `grudge compile` CLI command: admitted `scars/*.scar.json` (and `.grudge/scars/`) to `.grudge/compiled.json`. Deterministic output (sorted, stable ids).
- `spec/conformance/*.json`: at least **25 fixtures** covering every predicate kind with passing, violating, and edge cases (empty session, repeated calls, similar-but-different args, Windows paths, very long arguments). Fixture shape: `{name, rule, events[], expect: {violated, atEvents[]}}`.
- Python test that runs every fixture through the Python checker.
- `docs/guard-contract.md` and `docs/canonical-tools.md`.

**Acceptance:** the demo scar compiles; output validates against the schema; all fixtures pass in Python.

## PHASE 15: Node package core
**Goal:** a zero-dependency checker that agrees with Python on every fixture.

**Deliverables**
- `packages/grudge/` scaffold (`package.json` with `bin`, `files`, `engines >=18`), build script producing `dist/grudge.mjs`.
- `dsl/parse.js` and `dsl/check.js`: the same DSL as `docs/predicate-dsl.md`, for the three kinds above, with the same error messages and positions (line, column, hint).
- `core/normalize.js`, `core/store.js` (atomic writes via temp file and rename; safe on partial or corrupt JSON), `core/config.js`.
- Node test runs **the same `spec/conformance/*.json` fixtures**.

**Acceptance:** `npm test` green; `make node-test` green; **both languages pass all fixtures**; `dist/grudge.mjs` has no `import` of any npm package (assert in a test by scanning the bundle).

## PHASE 16: Session recorder
**Goal:** capture just enough of each session to evaluate rules, with privacy.

**Deliverables**
- `hooks/post-tool-use.js`: append one compact canonical event per tool call to `.grudge/session/<session_id>.jsonl`. Store `tool`, normalized args, a **truncated result (max 4 KB)**, result hash, byte size, timestamp.
- `core/redact.js`: mask key-like strings, `.env`-style values and private-key blocks **before** writing. Redaction is on by default and cannot be silently turned off.
- Retention: keep the last 500 events per session and sessions from the last 7 days; prune on SessionStart. `.grudge/session/` is added to `.gitignore` by the installer.
- `grudge/guard/import_session.py`: converts a session log into `schema.Trace` so the Python engine can shrink and admit real sessions.
- Document exactly what is stored and where in `docs/trust-model.md`.

**Tests:** fixture payload sequences produce valid logs; redaction masks the fake key; pruning works; corrupt lines are skipped, not fatal; the Python importer yields a `Trace` that round-trips.

**Acceptance:** replaying `spec/hook-payloads/claude-code/leak-session/*.json` through `hook post-tool-use` yields a session log that the Python importer loads.

## PHASE 17: The guard hooks
**Goal:** block a repeated mistake before the tool runs, fast and safely.

**Deliverables** (`hooks/*.js`, wired in `cli.js`)
- **PreToolUse:** normalize the pending call, evaluate `compiled.json` rules for `block` and `warn` modes. `block` stops the call with a reason of **at most 400 characters** (rule in plain English, scar id, and "do not retry; change approach or ask the user"). `warn` lets it through and prints one line. Use the exit-code or JSON mechanism that the **current official hooks documentation** specifies; record the verified mechanism and date in `docs/hooks.md`.
- **SessionStart:** print only the scars relevant to this repo as **one line each (max 140 characters), at most 8 scars, hard cap 1,200 characters total**. Nothing is printed if there are no scars. Also prune old sessions.
- **UserPromptSubmit:** if the prompt matches correction patterns (for example "don't do that", "never", "you shouldn't have", "revert that"), add one **nudge of at most 200 characters** pointing at the propose command. Silent otherwise. Patterns live in config and are unit-tested for false positives.
- **Stop:** update `stats.json` only. No output.
- **Fail-open wrapper around every hook:** try/catch the whole handler, exit 0 with one short stderr line on any error; enforce a **time budget** (default 1,500 ms) after which it allows the call. `GRUDGE_DISABLE=1` and `mode:"off"` exit 0 immediately.
- Performance: measure and record p50 and p95 wall time per hook in `docs/hooks.md` (Node startup included). Target p95 under 150 ms on a typical laptop; if missed, document why.

**Tests:** the leak sequence (Read of the keys file, then a WebFetch or `curl` carrying that value) is **blocked**; benign calls pass; ordering rules work; `warn` mode never blocks; corrupt `compiled.json` fails open; oversized payloads fail open; messages respect the length caps; Windows-style paths match correctly.

**Acceptance:** piping the fixture payloads into `node dist/grudge.mjs hook pre-tool-use` returns the block for the leak and allows everything else; timings recorded.

## PHASE 18: Propose, accept, and the instruction block
**Goal:** the model records new mistakes with one shell command; humans stay in control.

**Deliverables**
- `grudge propose --rule '<dsl>' --why '<one sentence>' [--preventive] [--session <id>]`:
  1. parse and type-check (readable errors, exit 1, include a corrected example);
  2. trace-based admission (Section 2, item 5) over the latest session and the controls;
  3. on success write `.grudge/pending/<id>.scar.json` and print the id, the plain-English rule, and `Run: grudge accept <id>`;
  4. on rejection print **why** (vacuous, over-broad with the offending control event, or unparseable) in under 300 characters.
- `grudge scars list | show <id> | accept <id> | reject <id> | disable <id> | remove <id>`. `accept` moves the scar into `scars/` and recompiles `compiled.json`. Commands that change state are idempotent.
- **The instruction block** (exact text below, maximum 12 lines and 1,000 characters). Stored once in `docs/instruction-block.md` and as a template string; the installer wraps it in markers so it can be updated and removed cleanly.

```
<!-- grudge:begin v1 -->
## Grudge (mistake guard)
- A hook may block a tool call and cite a "scar". Do not retry the same call or work around it. Change approach, or ask the user if you think it is a false positive.
- When the user corrects a repeatable mistake, or something failed because of an action you should never repeat in this repo, record it once:
  `node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'`
- Rule forms: `never call <tool> where <field> ~ "<text>"`, `must call <tool> before <tool>`, `never call <tool> where <field> tainted_by <tool>`. Tools: read_file, write_file, shell, http. Run `... propose --help` for examples.
- One rule per correction. Never propose rules that block reading files or running tests. Do not edit `.grudge/`.
<!-- grudge:end -->
```
- `docs/instruction-block.md` explains each line and why it is short (it is loaded into context on every session).

**Tests:** valid proposal becomes pending; vacuous and over-broad proposals are rejected with readable reasons; `accept` makes the hook block the leak in the next simulated session; model-style invocations with quoting variants (single quotes, escaped double quotes) parse; `autoAccept` default is false.

**Acceptance:** an end-to-end script performs propose, accept, then a blocked call, entirely from the shell with no network.

## PHASE 19: The installer (`npx grudge setup`)
**Goal:** one command, a detected multi-select list, and safe config writes.

**Deliverables**
- Interactive `setup`: detect installed agents (look for each tool's config directory or binary), show a multi-select with the tier shown next to each name, then ask scope: this repo, personal (git-ignored local settings), or all projects. Flags: `--dry-run` (prints a unified diff of every file it would change), `--yes`, `--agents a,b`, `--scope repo|local|global`.
- Also: `grudge doctor` (node version, script hash vs package version, settings parse OK, hooks present, `compiled.json` valid, budgets within limits, `.gitignore` entries), and `grudge uninstall` (removes only what Grudge added and restores backups).
- **Adapters**, each declaring `{id, tier, detect(), plan(), apply(), remove(), verified}`:
  - `claude-code` (**Guard**): merges the hook entries and the optional `statusLine` into the settings file for the chosen scope (project `.claude/settings.json`, personal `.claude/settings.local.json`, or user `~/.claude/settings.json`), copies `.grudge/bin/grudge.mjs`, adds the managed block to `AGENTS.md`, and a short `CLAUDE.md` pointer if the project uses one.
  - `codex`, `opencode`, `cursor`, `gemini-cli`, `copilot`, `windsurf` (**Advisory**): write the managed instruction block into the file that agent reads (`AGENTS.md` where supported, otherwise its rules or instructions file).
- **Verification rule:** for every adapter, check the agent's **current official documentation** for where it reads instructions or hooks. If you cannot verify, set `verified:false`, **do not write files for it**, print the snippet for the user to paste, and say so in `docs/integrations.md`. Never guess a config format.
- **Safety rules:** parse then merge, never overwrite; back up originals to `.grudge/backups/<timestamp>/`; idempotent (second run changes nothing); preserve the user's formatting and unrelated keys; managed blocks use begin/end markers and carry a version for upgrades; refuse to touch a file that fails to parse (print why).
- `.grudge/bin/grudge.mjs` is copied from the package build; its hash is stored in `config.json` for `doctor`.

**Tests (against a temporary fake HOME and fake repo):** fresh install; existing settings with unrelated hooks preserved; second run is a no-op; `--dry-run` writes nothing; uninstall restores byte-identical originals; unparseable settings file is refused; unverified adapter prints a snippet and writes nothing.

**Acceptance:** `npx grudge setup --yes --agents claude-code --scope local` in a scratch repo yields working hooks (run the Phase 17 leak fixture against the installed script), and `grudge doctor` reports all green.

## PHASE 20: Token budgets, stats, and the status line
**Goal:** prove the "uses fewer tokens" claim and keep it true.

**Deliverables**
- `core/budget.js`: a cheap token estimate (`ceil(chars/4)`) and enforced caps:
  | Output | Cap |
  |---|---|
  | SessionStart injection | 1,200 characters, 8 scars |
  | Block reason | 400 characters |
  | Prompt nudge | 200 characters |
  | AGENTS.md block | 1,000 characters, 12 lines |
  Exceeding a cap truncates deterministically and `doctor` flags it.
- `core/stats.js` (`.grudge/stats.json`, gitignored): counts of blocks, warnings, proposals, accepted scars, per scar. `grudge stats` prints them.
- **Estimated tokens saved** = blocks times `config.avoidedRetryTokens` (default 1500). **Always label it "est."** and document that it is an assumption, not a measurement. Never present it as measured.
- `grudge statusline`: one short line for Claude Code's `statusLine` setting, for example `grudge: 4 scars, 2 blocked, ~3.0k tokens saved (est.)`. Prints nothing when Grudge is off. Must run in under 50 ms.
- `docs/token-budgets.md`: the table, how the numbers are enforced, and an honest comparison with the alternative (a long "never do X" list in `CLAUDE.md` that is loaded every turn).

**Tests:** every cap enforced; stats survive corrupt files; statusline output length and timing; labels always contain "est.".

**Acceptance:** `doctor` prints measured sizes of every injected output and all are within caps.

## PHASE 21: End-to-end proof, demo, and release prep
**Goal:** a two-session story anyone can watch, and a package ready to publish.

**Deliverables**
- `scripts/e2e_guard.*` and a Node test that simulates **Session 1** (the agent leaks the fake key; the user corrects it; `propose`; `accept`) and **Session 2** (the same leak attempt is blocked at PreToolUse) using real hook payload fixtures piped into the real script. No faked outputs.
- `grudge demo --guard`: replays that story in the terminal using the real hook runner. If the web viewer from `PROMPT.md` Phase 11 exists, emit the same events so it can show a sixth beat ("second session: blocked before it happened"). Do not rebuild the viewer; only add events and, if trivial, one component.
- `packages/grudge`: finalize `package.json` (`files`, `bin`, `engines`, `repository`, `license`), a README with the 3-line quickstart, and verify `npm pack --dry-run` includes only intended files. Check name availability with `npm view <name>`; if taken, use a scoped name and log a Decision.
- A free GitHub Actions workflow that runs Python tests, `npm test`, and `grudge run` on the demo scar.
- Update the root `README.md` (quickstart: `npx grudge setup`; the tier table from Section 1.3; the token-budget table), `docs/integrations.md` (per-agent status: verified or unverified, with the date checked), `docs/INDEX.md`, `docs/roadmap.md`, and `pitch/*` (add the guard story and the honest limits).
- Final audit: fresh clone to `make all` green; scratch repo install, session 1 and session 2 flow works offline.

**Acceptance:** the two-session test is green, the demo flag runs with the network disabled, and `doctor` is green in the scratch repo.

---

# APPENDICES

## A. Definition of done (for this file)
- [ ] Both Python and Node pass every `spec/conformance` fixture.
- [ ] The built hook script has zero runtime dependencies and fails open.
- [ ] The leak is blocked in Session 2 after propose and accept in Session 1, offline.
- [ ] Installer is merge-only, idempotent, reversible, with `--dry-run` and `doctor`.
- [ ] Unverifiable adapters are marked unverified and write nothing.
- [ ] All injected text is within the caps, with measured sizes shown by `doctor`.
- [ ] Every token-saving figure is labeled as an estimate.
- [ ] No MCP server, hosted service, API key or telemetry anywhere in the repo.
- [ ] All new docs are indexed and `make docs-check` passes.

## B. Anti-patterns (do NOT do these)
- Adding an MCP server, a daemon, or any network call.
- Calling `npx` or Python from a hook.
- Letting a hook throw, hang, or block the user on its own failure.
- Auto-accepting model-proposed rules by default.
- Writing config for an agent whose format you could not verify.
- Overwriting a user's settings, `AGENTS.md` or `CLAUDE.md` instead of merging a marked block.
- Claiming "cannot repeat" outside Guard tier or beyond what predicates can express.
- Presenting estimated token savings as measured.
- Editing this repo's own `AGENTS.md`.

## C. How to start
Run the pre-flight. Confirm `PROMPT.md` Phases 0 to 9 are `[x]`. Add Phases 14 to 21 to the `Progress.md` Phase Board, log the "no MCP" Decision, then execute **Phase 14** only, and stop at its exit gate with a report.
