# PROMPT-2-PARALLEL.md: multi-agent execution mode for PROMPT-2.md

This is a **companion** to `PROMPT-2.md`. It changes **nothing** in that file (goals, phases, designs, caps, tests and acceptance criteria all stay exactly as written). It only adds a second way to *execute* Phases 14 to 21: with several agents working in parallel lanes, so wall-clock time drops.

Read `PROMPT-2.md` as the specification. Read this file for **who does what, where, and when**.

---

## 0. AUTHORITY AND SCOPE

Order of precedence: `AGENTS.md` > `PROMPT.md` rules (Sections 1 and 6) > `PROMPT-2.md` content > this file. This file governs *only* how work is split and merged.

**Explicit exception, owner-approved:** `PROMPT.md` rule 1 ("one phase at a time") and the "execute Phase 14 only" wording in `PROMPT-2.md` are relaxed **only** as described here, **only** when the owner starts parallel mode with the kickoff in Section 9, and **only** after Phase 14 is complete. Every phase must still pass its own exit gate, with tests and docs, exactly as written.

**Use parallel mode for:** Phases 15 to 21 of `PROMPT-2.md`.
**Never parallelize:** `PROMPT.md` Phases 0 to 13 (a dependency chain: schema, agent, recorder, replay, shrinker, predicates, admission, gate), or Phase 14 itself.
**Limit:** 1 integrator plus at most **3 worker agents**.
**Cost reality:** parallel agents do **not** reduce total tokens; they reduce waiting time, and each extra agent re-reads context. Keep reads minimal (Section 5) and reports short.

**Requires git worktrees.** If worktrees are unavailable or git fails, do not run parallel mode: tell the owner and fall back to sequential execution of `PROMPT-2.md`. Never let two agents write in the same working directory.

---

## 1. ROLES

| Role | Count | Owns |
|---|---|---|
| **Integrator** | 1 | Phase 14, lane scaffolding, shared files, `Progress.md`, `docs/INDEX.md`, merges, contract changes, `make all`, commits to `main`, Phase 21 end-to-end test and demo flag |
| **Lane A: Guard** | 1 worker | Phases 15, 17, 20 |
| **Lane B: Capture and Propose** | 1 worker | Phases 16, 18 |
| **Lane C: Installer and Release** | 1 worker | Phase 19, then the docs, README, pitch, CI and packaging parts of Phase 21 |

The integrator may itself be a worker-less coordinator that spawns the lanes as subagents, or the owner may run each lane as a separate session in its own worktree. The rules below are identical either way.

---

## 2. DEPENDENCY GRAPH AND SYNC POINTS

```
T0  Phase 14 (integrator, solo): contract + fixtures + lane scaffolding ──► S0
          ┌ A: P15 core ──S1──► P17 hooks ──S2──► P20 budgets/stats ───────┐
S0 ───────┼ B: P16a (pure parts) ──S1──► P16b recorder ──► P18 propose ────┼─► S3 ─► P21
          └ C: P19 installer + adapters (against a stub script) ───────────┘
```

| Sync | Entry condition | Unlocks |
|---|---|---|
| **S0 contract freeze** | Phase 14 exit gate passed and merged; `docs/interfaces.md` and all stub files exist | All three lanes start |
| **S1** | Lane A's Phase 15 merged (checker, normalize, store pass every fixture) | B starts 16b and 18; A starts 17 |
| **S2** | Lane A's Phase 17 and Lane B's Phase 16 merged | B finishes accept-to-compiled flow; A starts 20; C finalizes hook command strings against the real script |
| **S3** | A's Phase 20, B's Phase 18, C's Phase 19 merged | Integrator runs Phase 21 end to end |

Lanes work **independently between sync points** and **stop at each sync point** until the integrator merges and tells them to continue. Lane B's "16a" is the part of Phase 16 with no Node-core dependency: `redact.js` (pure function), retention logic as pure functions, the session-log format spec, and `grudge/guard/import_session.py`. Lane C's work before S2 runs against a stub `grudge.mjs` that answers the documented hook interface.

---

## 3. WHAT THE INTEGRATOR DOES AT T0 (extends Phase 14)

In addition to Phase 14's deliverables in `PROMPT-2.md`:

1. **`docs/interfaces.md`**: exact signatures and one-line contracts for every cross-lane function and file format: `dsl.parse`, `dsl.check`, `normalize(event)`, `store.readJson`, `store.writeJsonAtomic`, `session.append`, `session.read`, `redact(text)`, the session log line format, `compiled.json` fields, the hook stdin and stdout contract, the exact hook command string, the managed-block markers, and the `grudge.mjs` command list. **This is the contract workers code against.**
2. **Lane scaffolding:** create every file in the `PROMPT-2.md` layout under `packages/grudge/` and `grudge/guard/` as a stub with a first-line ownership header (`// OWNER: lane-a`) and a body that throws `NotImplemented("lane-x")`. Create the **command registry** (`src/commands/index.js` importing one file per command) and the **hook registry**, so lanes fill their own files and **never touch a shared dispatcher**.
3. **Shared files, integrator-only:** `package.json`, `scripts/build.mjs`, `Makefile`, `pyproject.toml`, `.gitignore`, `docs/INDEX.md`, `Progress.md`, `spec/**`, `docs/interfaces.md`, `coordination/**` structure.
4. **Worktrees:** `git worktree add ../grudge-lane-a -b lane-a` (and `lane-b`, `lane-c`) from the S0 commit. Print the paths for the owner.
5. **`coordination/`** (committed): `lane-a.md`, `lane-b.md`, `lane-c.md` from the template in Section 6, plus `requests/` (empty).
6. Add to `Progress.md`: a "Parallel mode" section listing lanes, branches, worktree paths and the sync table with status.

---

## 4. FILE OWNERSHIP (strict)

A worker edits **only** files it owns. Tests live with their owner.

| Path | Owner |
|---|---|
| `packages/grudge/src/dsl/**`, `core/{normalize,store,config}.js`, `hooks/{pre-tool-use,session-start,user-prompt-submit,stop}.js`, `core/{budget,stats}.js`, `commands/{hook,stats,statusline}.js`, matching `test/**`, `docs/hooks.md`, `docs/token-budgets.md` | **Lane A** |
| `packages/grudge/src/core/{session,redact}.js`, `hooks/post-tool-use.js`, `commands/{propose,scars,accept}.js`, matching `test/**`, `grudge/guard/import_session.py`, `tests/test_import_session.py`, `docs/trust-model.md`, `docs/instruction-block.md` | **Lane B** |
| `packages/grudge/src/installer/**`, `commands/{setup,doctor,uninstall}.js`, matching `test/**`, `docs/integrations.md`, root `README.md`, `packages/grudge/README.md`, `.github/workflows/**`, `pitch/**` | **Lane C** |
| `grudge/guard/compile.py`, `spec/**`, `docs/{guard-contract,canonical-tools,interfaces}.md`, all shared files in Section 3, the Phase 21 e2e test and `grudge demo --guard` | **Integrator** |

**Need a change in a file you do not own?** Do not edit it. Write `coordination/requests/<from>-to-<owner>-<n>.md` (what, why, minimal proposed diff, 10 lines max) and continue with other work. The owner or the integrator handles it at the next sync point, or sooner if it blocks you.

---

## 5. WORKER PROTOCOL

**Pre-flight (cheap on purpose):**
1. Read `AGENTS.md` in full. Never edit it.
2. Read `PROMPT.md` Sections 1 and 6 only.
3. Read `PROMPT-2.md` Sections 0 to 3, the Appendices, and **only your own phases**. Read this file.
4. Read `docs/interfaces.md`, your lane file in `coordination/`, and the docs your phases name. Do **not** read other lanes' code unless an interface is unclear.

**While working:**
- Work only in your worktree and on your branch. Commit small and often: `phase-N(lane-x): <summary>`.
- Run **lane-local tests only** while iterating (for example `node --test packages/grudge/test/dsl`). The integrator runs the full suite.
- Code against `docs/interfaces.md`. If reality and the contract disagree, **stop and file a request**; never silently diverge.
- Do not edit `Progress.md` or `docs/INDEX.md`. Record everything in your lane file.
- Never mark a phase `[x]`. Only the integrator does, after merge and `make all`.

**At each sync point (or phase end):** write a lane report (40 lines max) in your lane file: files created or changed, tests added and results, acceptance evidence (commands and output), docs written, deviations, open requests. Then **stop** and tell the owner you are waiting for the integrator.

If git fails in your environment, print the exact commands for the owner and continue; do not block.

---

## 6. LANE FILE TEMPLATE (`coordination/lane-<x>.md`, append-only)

```markdown
# Lane <X>: <name>
Branch: lane-<x>   Worktree: <path>   Phases: <list>

## Status
- Current: <phase / task>   Waiting on: <sync point or none>

## Log (newest at bottom)
### <date> <phase>
- Plan:
- Done:
- Tests (command, result):
- Docs written:
- Requests filed:
- Handoff note:
```

---

## 7. INTEGRATOR PROTOCOL AT EACH SYNC POINT

1. Confirm each lane's report is complete and its phase deliverables are done.
2. **Merge in dependency order** (A, then B, then C) into `main`. Resolve conflicts only in shared files; if a conflict appears in a lane-owned file, send it back to that lane.
3. Run: `make all`, `npm test`, the **Python and Node conformance fixtures**, and the phase acceptance checks written in `PROMPT-2.md`. Record commands and output.
4. If anything fails, the lane whose tests or contract broke fixes it **on its branch**; re-merge. Do not patch lane code on `main`.
5. Update `Progress.md` (Phase Board, Snapshot, Decisions, Session Log), `docs/INDEX.md`, and the sync table. Mark phases `[x]` only if their exit protocol passed.
6. Commit on `main` as `phase-N: complete <name>` (or print the exact commands for the owner if git fails).
7. Update each lane's worktree: `git merge main` (or rebase). Tell each lane it may continue and what unlocked.

**Contract changes.** If a lane's request touches `spec/**` or `docs/interfaces.md`: decide, update the contract and any affected fixtures in one commit, bump the `spec` version if breaking, log a Decision, and notify **every** lane. Lanes re-read `docs/interfaces.md` before continuing.

**Conflicts between lanes** on an interface are settled by `docs/interfaces.md` and the conformance fixtures. The integrator breaks ties.

---

## 8. PHASE 21 IN PARALLEL

After S3, split Phase 21 by ownership: the **integrator** writes the two-session end-to-end test, `grudge demo --guard`, and the final audit; **Lane C** finishes README, `docs/integrations.md`, pitch updates, the GitHub Actions workflow, `npm pack --dry-run` and name-availability checks. Both merge, then the integrator runs the final audit from `PROMPT-2.md` (fresh clone, `make all`, offline two-session flow).

---

## 9. HOW TO START

**Owner kickoff for the integrator** (use only after `PROMPT.md` Phases 0 to 9 are `[x]`):

```
Read AGENTS.md, PROMPT.md, PROMPT-2.md and PROMPT-2-PARALLEL.md. Parallel mode
is approved for PROMPT-2.md Phases 15-21 only. Run the pre-flight, add
Phases 14-21 to the Phase Board, log the "no MCP" and "parallel mode" decisions,
then execute Phase 14 solo including the T0 duties in PROMPT-2-PARALLEL.md
Section 3. Stop at S0 and report the worktree paths and the lane kickoff
messages.
```

**Worker kickoff template** (the integrator prints one per lane; the owner pastes each into its own session or subagent, replacing LANE and PATH):

```
You are Lane LANE worker. Work ONLY inside PATH (a git worktree on branch
lane-LANE). Read AGENTS.md, then follow PROMPT-2-PARALLEL.md Section 5 and your
lane file coordination/lane-LANE.md. Execute only the phases owned by your lane,
in order, editing only files you own (Section 4). Stop at each sync point and
write your lane report. Never edit Progress.md, docs/INDEX.md or AGENTS.md.
```

**Subagent variant (single Claude Code session):** the integrator spawns the three lane subagents with the worker kickoff, each pointed at its own worktree path, and waits for all three reports before running the sync-point protocol.

**Tip for cost and speed:** assign the strongest model to Lane A (the checker and hooks are the riskiest code). Lane C is mostly mechanical and may use a cheaper model. Optionally clone the repo into the WSL home directory for faster installs than `/mnt/c`.

---

## 10. DEFINITION OF DONE (parallel mode)

- [ ] Phase 14 completed solo; `docs/interfaces.md` and all stubs existed before any lane started.
- [ ] Each lane edited only files it owns; cross-lane needs went through `coordination/requests/`.
- [ ] Every sync point ended with a merge, `make all`, `npm test`, and both conformance suites green.
- [ ] Only the integrator edited `Progress.md`, `docs/INDEX.md` and shared files.
- [ ] All `PROMPT-2.md` acceptance criteria and its Definition of Done are met, unchanged.

## 11. ANTI-PATTERNS (do NOT do these)

- Running more than 3 workers, or two agents in one working directory.
- Parallelizing `PROMPT.md` Phases 0 to 13 or Phase 14.
- Starting lanes before the interface freeze and lane scaffolding exist.
- Editing a file you do not own, or silently changing a contract.
- A worker marking a phase complete, or editing `Progress.md`.
- Merging without `make all` and both conformance suites.
- Patching a lane's code on `main` instead of sending it back.
- Skipping a sync point "because it looks fine".
- Using parallel mode when worktrees are unavailable.