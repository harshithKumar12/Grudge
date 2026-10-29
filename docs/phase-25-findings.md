# Phase 25 findings: does Guard actually block?

**Purpose:** Answer, with command output from a scratch project, what the published CLI does when a model proposes a rule — and establish that "it works" was unproven before this phase.
**Audience:** Project owner, reviewers, and release operator.
**Status:** final for Phase 25
**Last updated (phase):** 0.1.9 · 2026-10-29

## How this was measured

Every command below ran in a throwaway directory,
`%TEMP%\grudge-phase25-probe`, created with `git init` and a `package.json`,
never in the repository and never in the home directory. The CLI came from the
registry, not from this checkout:

```powershell
npx --yes grudge-cli@0.1.9 setup --yes --agents claude-code --scope repo
node .grudge/bin/grudge.mjs --version
```

```text
Grudge setup v0.1.9
[ok] Scope: repo
[ok] Agents: claude-code
[ok] Files: 5 changed
3 passed, 0 failed, 0 warnings
Next: grudge doctor
grudge 0.1.9
```

The session that motivated this phase claimed it had run
`grudge propose --rule '...' --preventive` and that the rule was active. The
transcript contained no shell command for that turn, so the claim was never
evidence. The measurements below are.

## a. Does `propose` write a file? Where, and in what state?

Yes, one file, and only in the pending directory:

```text
Grudge propose v0.1.9
[ok] Proposal: scar-3fa245953758
[warn] Status: pending acceptance
1 passed, 0 failed, 1 warnings
Next: grudge accept scar-3fa245953758
```

```text
.grudge/pending/scar-3fa245953758.scar.json     <- "mode": "pending"
.grudge/compiled.json                            -> does not exist
```

The record itself says `"mode": "pending"`. Nothing is enforced at this point:
the hook evaluates `.grudge/compiled.json`, and that file is not written until a
scar is accepted.

`propose` also refuses to run before any session exists:

```text
[fail] Proposal: no session found; record a session before proposing a rule
0 passed, 1 failed, 0 warnings
```

So a proposal needs a captured session event first (in practice, the
`PostToolUse` hook of the action that went wrong).

## b. Which command accepts a scar, and does `--preventive` exist?

- The accepting command is `grudge accept <id>`; `grudge scars accept <id>` also
  works. Both are discoverable: `grudge --help` lists
  `accept  Accept a pending Scar by id`, `scars list` shows the id, and
  `propose` prints `Next: grudge accept <id>`.
- `--preventive` is real, implemented in `propose` (`options.preventive`), and
  it only bypasses the "did this rule fire on the recorded session" check. It
  does **not** accept the scar.
- `--rule-stdin` is real as well.
- Neither flag appears in `--help`, and `grudge propose --help` prints the
  general command list instead of propose's own flags. That is the gap that let
  a model narrate flags it had never verified.
- `--accept` (the flag this phase adds) did not exist: it was accepted silently
  and ignored, exit code 0, proposal still pending. Unknown flags produced no
  error of any kind.
- The JSON result said `"accepted": true` while the scar was pending, which is
  the single most misleading field for a model reading the output.

## c. Does accepting regenerate the compiled rules?

Yes. Accepting moves the record from `.grudge/pending/` to `.grudge/scars/`,
sets `mode: "block"`, and rewrites `.grudge/compiled.json` in the same command.
No separate compile step exists or is needed.

```json
{ "version": 1, "rules": [ { "id": "scar-0513574aaf9a", "mode": "block", "tool": "shell", "match": { "command": { "$contains": "GRUDGE_TEST" } } } ] }
```

## d. Does the hook map Claude Code tool names to DSL tools?

The link that was never proven is this one. It works for the tools that were
mapped, and it was incomplete:

| Host name | Canonical tool | Before Phase 25 | Now |
|---|---|---|---|
| `Bash` | `shell` | mapped | mapped |
| `Read` | `read_file` | mapped | mapped |
| `Write`, `Edit`, `MultiEdit` | `write_file` | mapped | mapped |
| `WebFetch`, `WebSearch` | `http` | mapped | mapped |
| `PowerShell` | `shell` | **not mapped** | mapped |
| `NotebookRead` | `read_file` | **not mapped** | mapped |
| `NotebookEdit` | `write_file` | **not mapped** | mapped |
| `mcp__<server>__<tool>` | `mcp` | mapped | mapped |
| anything else | passthrough name | unchanged | unchanged |

Evidence from the installed runner: a `PostToolUse` payload with
`"tool_name":"Bash"` was stored as `{"tool":"shell","args":{"command":"echo GRUDGE_TEST"},...}`,
and rules written against `write_file`, `read_file`, and `http` fired for
`Write`/`Edit`/`MultiEdit`, `Read`, and `WebFetch` payloads respectively.

`PowerShell` matters here specifically: Claude Code's current hooks reference
documents a Windows `PowerShell` tool alongside `Bash`, so on this machine a
`shell` rule did **not** stop a PowerShell command. The mapping is now complete
for the tools Claude Code exposes, and `test/phase25-mapping.test.js` fails if
any of them regresses.

## e. Does a rule survive the way PowerShell passes it?

All four spellings parse, and all four produced a working rule:

| Invocation | Result |
|---|---|
| `--rule 'never call shell where command ~ "GRUDGE_TEST"'` | accepted, pending |
| `--rule 'never call shell where command ~ GRUDGE_TEST'` (quotes gone) | accepted — the DSL accepts a bare word after `~` |
| `--rule 'never call shell where command ~ \"GRUDGE_TEST\"'` (PowerShell escape) | accepted, same rule |
| `'never call shell where command ~ "GRUDGE_TEST"' \| ... propose --rule-stdin` | accepted; the trailing newline is stored in `rule.source`, which changes the scar id but not the rule |

A genuinely broken rule (for example a missing operator) fails loudly with a
parse error, the column, and a corrected example. Quoting was not the failure
mode in the reported session; the model never ran the command.

## f. Does the hook block, and with which exit code?

Before this phase, a matching call printed the official deny payload but exited
0:

```text
Bash "echo GRUDGE_TEST"  -> exit 0, {"hookSpecificOutput":{...,"permissionDecision":"deny"}}
Bash "echo hello"        -> exit 0, no output
malformed payload        -> exit 0, stderr "invalid hook input; allowed (fail-open)"
```

Claude Code accepts that (exit 0 plus a deny decision does block), but exit 2 is
the mechanism that blocks even if the JSON is unreadable, and it is the exit
code a reviewer can check without parsing the payload. Phase 25 switches a deny
to exit 2 while still printing the same JSON, which the hooks reference allows:
exit 2 blocks, and the JSON decision supplies the reason.

## What this phase changes

1. `grudge verify` runs the whole chain — install, propose, accept, real
   `PreToolUse` payloads over stdin, stats, report — in a temporary project and
   prints one PASS/FAIL line per check. This is the only claim of "it works".
2. A deny exits 2 and prints the reason.
3. `propose` says PENDING in words, in JSON (`accepted: false`,
   `enforced: false`), and adds `--accept` for people who do not want review.
4. Unknown flags fail with the list of valid flags instead of being ignored.
5. The tool-name map covers `PowerShell`, `NotebookRead`, and `NotebookEdit`.
6. The managed block tells the model to paste real command output and never to
   claim a rule is active unless the output says accepted.
7. `doctor` prints that file checks cannot prove a block, and points at
   `grudge verify`.
