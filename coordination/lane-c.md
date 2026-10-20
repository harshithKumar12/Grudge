# Lane C: Installer and Release
Branch: lane-c   Worktree: sibling worktree `grudge-lane-c` (local-only)   Phases: 19, Phase 21 release

## Status
- Current: S3 Phase 20 doctor budget measurements complete   Waiting on: integrator merge

## Log (newest at bottom)
### 2026-10-19 Phase 14
- Plan: Read interfaces and implement merge-only installer, verified adapters, and release packaging in owned files only.
- Done: Lane scaffold created; no implementation started before S0.
- Tests (command, result): Integrator package smoke test passed; lane tests pending.
- Docs written: none.
- Requests filed: none.
- Handoff note: Start against the documented stub command after the integrator announces S0.

### 2026-10-19 S2
- Plan: Reconcile installer command strings and package build against the merged Phase 17 interfaces without editing lane-A or shared files.
- Done: Reviewed `docs/interfaces.md`, Claude adapter commands, `packages/grudge/src/commands/hook.js`, `src/cli.js`, and `scripts/build.mjs`. Installer strings already match the frozen contract: `node .grudge/bin/grudge.mjs hook <event>`.
- Tests: `npm test` — 14 passing. `npm run build` and `node --check dist/grudge.mjs` — passed. `npm pack --dry-run` — passed; package contains README, package metadata, and dist runtime.
- Docs written: none; existing `docs/integrations.md` remains accurate and Cursor stays unverified/no-write.
- Requests filed: Phase 17 hook and CLI dispatcher are still `NotImplemented("lane-a")`; integrator must land real interfaces before release claims or end-to-end installer proof.
- Handoff note: No implementation changes in this S2 pass; no focused commit required. Stop for integrator merge.

### 2026-10-19 S3
- Plan: Implement Lane A's doctor request using `measureOutputs`, add a cap-failure test, and verify package checks.
- Done: `doctor` now measures SessionStart injection, block reason, prompt nudge, and AGENTS.md block; prints chars/cap and fails when caps or line caps are exceeded. Uses the Phase 20 API when available and a pre-merge compatibility fallback.
- Tests: `npm test` — 24 passing. `npm run build` plus `node --check dist/grudge.mjs` — passed. `npm pack --dry-run` — passed.
- Docs written: none.
- Requests filed: none. The request file was absent in lane-c; read from lane-a's worktree because it was present there.
- Handoff note: Commit requested as `phase-20(lane-c): report doctor budget measurements`.
