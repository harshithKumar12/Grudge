# Testing Grudge

**Purpose:** A step-by-step procedure to verify that Grudge works in this checkout, from install through enforcement, ending in a pass/fail verdict.
**Audience:** Anyone testing a build before release, and new contributors checking their environment.
**Status:** draft
**Last updated (phase):** 0.2.3

Every command below was run against this checkout on Windows 11 with Node
`25.2.1`, Python `3.14.0`, and Grudge `0.2.3`. Output blocks are real captures.
Paths and scar IDs differ between machines.

The whole procedure takes about 20 minutes. Work through it in order — later
steps depend on state the earlier ones create.

---

## What you are testing

Grudge has two packages that do different jobs:

| Package | Command | What it does |
|---|---|---|
| npm `grudge-cli` | `grudge` / `grudge-node` | Guard: records sessions, blocks tool calls through Claude Code hooks |
| PyPI `grudge-cli` | `grudge-engine` | Engine: capture, shrink, admit, replay, and gate Scars |

The Guard blocks. The engine proves. Testing only one of them leaves half the
product unverified.

---

## Step 0. Prerequisites

```bash
node --version
python --version
```

You need Node.js 18 or newer and Python 3.11 or newer. If either is missing,
nothing below will work and the failures will be confusing.

---

## Step 1. Build the Guard from this checkout

Run from the repository root.

```bash
npm --prefix packages/grudge run build
```

**What this proves:** the source compiles. A failure here is a broken checkout,
not a configuration problem.

Confirm the built runtime responds:

```bash
node packages/grudge/dist/grudge.mjs --version
```

Expected:

```text
grudge 0.2.3
```

---

## Step 2. Prove enforcement with one command

This is the single most important check. It needs no model, no network, and no
Python.

```bash
node packages/grudge/dist/grudge.mjs verify
```

Expected final lines:

```text
[ok] allow: Bash "echo hello" exited 0 with no decision
[ok] fail open: malformed payload exited 0 (allowed)
[ok] stats: 1 blocked event in .grudge/stats.jsonl
[ok] report: grudge report shows 1 caught, 1 blocked
Result: PASS (10/10 checks)
Temp project removed (use --keep to inspect it)
```

**Pass:** `Result: PASS (10/10 checks)`.

**Fail:** the failing line names which stage broke. A failure keeps the temp
project and prints its path; `--keep` keeps it after a pass too, so you can
inspect what was written.

**What this proves:** the installed hook runner accepts real Claude Code
`PreToolUse` payloads, blocks a call that matches an accepted rule with exit
`2`, allows a benign call with exit `0`, fails open on malformed input, and
writes both stats and a report. This is the only proof of *enforcement* in the
product — `doctor` checks files, not decisions.

---

## Step 3. Set up a disposable project

Do not test in your real repository. Create a scratch project:

```bash
mkdir -p /d/Temp/grudge-lab && cd /d/Temp/grudge-lab && git init
```

On Windows PowerShell, use `New-Item -ItemType Directory -Force D:\Temp\grudge-lab`
and `Set-Location D:\Temp\grudge-lab` instead.

Install the guard into it:

```bash
node /c/Users/kotes/Desktop/Grudge/packages/grudge/dist/grudge.mjs setup -y
```

Adjust the path to your checkout. Expected:

```text
Grudge setup v0.2.3
[ok] Scope: repo
[ok] Agents: claude-code
[ok] Files: 5 changed
3 passed, 0 failed, 1 warnings
Next: grudge doctor
```

The warning about the settings path is normal: Claude Code only loads a
repo-scoped `.claude/settings.json` when the session starts in that directory.

**Pass:** five files changed, including `.grudge/`, `.claude/settings.json`, and
a managed block in `CLAUDE.md`.

**What this proves:** setup detects the agent, writes the hook registration, and
results in a self-contained runtime rather than a dependency on your checkout.

Every command from here on uses the *installed* copy, `.grudge/bin/grudge.mjs`,
not the checkout path.

---

## Step 4. Check the install

```bash
node .grudge/bin/grudge.mjs doctor
```

Expected tail:

```text
Enforcement: not proven by file checks. Run `grudge verify` to prove blocking works.
20 passed, 0 failed, 2 warnings
Next: grudge verify
```

**Pass:** `0 failed`. Warnings about an existing status line are expected if you
already have one configured.

**What this proves:** the files, hook registration, and config are coherent. It
deliberately does *not* claim blocking works — that is Step 2's job.

---

## Step 5. Record a session

`propose` needs an observed session before it will accept a rule. Simulate one
by feeding the installed hook a `PostToolUse` payload:

```bash
echo '{"session_id":"lab-1","hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf ./build"},"tool_response":"removed"}' \
  | node .grudge/bin/grudge.mjs hook PostToolUse
echo "exit=$?"
```

Expected: `exit=0` and no stdout (hooks stay quiet when they succeed).

Confirm the session landed:

```bash
ls .grudge/session/
```

Expected: `lab-1.jsonl`.

**Pass:** the file exists and contains one JSON line whose `tool` is `shell`,
not `Bash`.

**What this proves:** the hook contract accepts payloads, translates host tool
names to canonical names, and persists events keyed by session. Without this,
no rule can be learned. Running `propose` before this step fails with
`no session found; record a session before proposing a rule` — that error is
correct behavior, not a bug.

---

## Step 6. Propose and accept a rule

```bash
node .grudge/bin/grudge.mjs propose \
  --rule 'never call shell where command ~ "rm -rf"' \
  --why "agent deleted the build dir" --accept
```

Expected:

```text
Grudge propose v0.2.3
[ok] Proposal: scar-2afdb527f5b5
[ok] Status: accepted and enforced
2 passed, 0 failed, 0 warnings
```

**Pass:** a scar ID is printed and the status reads *accepted and enforced*.

**Fail:** `vacuous rule: it did not fire on the selected session` means the rule
does not match what you recorded in Step 5 — check the `command` value matches.

**What this proves:** the rule compiled from English-like DSL into a predicate,
fired against a real recorded session, passed the over-broad-rule check against
control sessions, and was written to `.grudge/compiled.json` in `block` mode.

Without `--accept` the rule stays **pending**, which is not enforced. A pending
scar must never be reported as active.

---

## Step 7. Prove the block

Send the dangerous call as a `PreToolUse` payload:

```bash
echo '{"session_id":"lab-2","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf ./build"}}' \
  | node .grudge/bin/grudge.mjs hook PreToolUse
echo "EXIT=$?"
```

Expected:

```text
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...},"blocked":true,...}
grudge: blocked by scar-2afdb527f5b5: Never call shell with the specified arguments. [...]
EXIT=2
```

Now the benign call:

```bash
echo '{"session_id":"lab-2","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo hello"}}' \
  | node .grudge/bin/grudge.mjs hook PreToolUse
echo "EXIT=$?"
```

Expected: no output, `EXIT=0`.

**Pass:** exit `2` with a deny decision on the first, exit `0` with silence on
the second. Both halves matter — a guard that blocks everything is as broken as
one that blocks nothing.

**What this proves:** enforcement works on the live path, through the installed
hook, with a real scar.

### The regression this guards against

An earlier version evaluated a rule against *every event in the session* instead
of the pending call. Once a session contained one matching event, every later
tool call in that session was denied — including harmless ones. That was fixed
in `f1dd813`.

Step 7 already covers half of it, because both calls use the same
`session_id`. To exercise the exact failure, send a *harmless* call in the same
session after a blocked one:

```bash
echo '{"session_id":"lab-2","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"path":"src/app.js","content":"hi"}}' \
  | node .grudge/bin/grudge.mjs hook PreToolUse
echo "EXIT=$?"
```

**Pass:** `EXIT=0`. **Fail:** exit `2` — the session-scoping bug has returned,
and the guard is now unusable for the rest of any session that trips a rule.

---

## Step 8. Confirm the counters

```bash
node .grudge/bin/grudge.mjs stats
node .grudge/bin/grudge.mjs report
```

Expected:

```text
Grudge stats v0.2.3
[ok] Blocks: 1
[ok] Warnings: 0
[ok] Scars: 1
[ok] Estimated savings: ~1500 tokens
```

```text
Grudge report v0.2.3
[ok] lifetime: 1 caught, 1 blocked, 0 warned
```

**What this proves:** the decision was recorded, not just returned. Note that
savings are labelled `estimated` — they value a blocked call at a fixed token
estimate rather than measuring a real retry. Treat the number as indicative.

---

## Step 9. Confirm uninstall is clean

```bash
node .grudge/bin/grudge.mjs uninstall
```

Expected:

```text
Grudge uninstall v0.2.3
[ok] Restored: 4 files
[ok] Removed: 9 paths
3 passed, 0 failed, 0 warnings
```

**Pass:** Grudge-managed content is gone, and any content Grudge did not write
is left alone. Verify by checking that `.grudge/` is removed and that your
`.claude/` settings no longer contain Grudge hooks.

**What this proves:** the install is reversible. This matters more than it
sounds — a tool that cannot be cleanly removed is one people are reluctant to
try.

---

## Step 10. Run the Python engine demo

From the repository root, not the scratch project:

```bash
python -m grudge demo --no-browser --fast --json
```

Expected JSON includes:

```json
"mode": "offline/deterministic",
"vulnerable": { "passed": false, "successes": 0 },
"fixed": { "passed": true, "successes": 1 }
```

**Pass:** `vulnerable.passed` is `false` and `fixed.passed` is `true`.

**What this proves:** the core claim — a Scar is red on the bad agent and green
on the fixed one. It runs fully offline against checked-in fake tools and
scripted policies, so it does not depend on any model provider.

For the two-session hook proof:

```bash
python -m grudge demo --guard --json
```

This needs a Node Guard runtime. It resolves `--node-runtime`, then
`GRUDGE_NODE_RUNTIME`, then a checkout, then `packages/grudge/node_modules`.

---

## Step 11. Run the test suites

From the repository root:

```bash
python -m pytest
```

Expected: `342 passed, 1 skipped`.

```bash
npm test --prefix packages/grudge
```

Expected: `pass 184`, `fail 0`.

```bash
python -m scripts.docs_check
```

Expected: `docs-check: 44 indexed, non-empty, linked documentation files` with
exit `0`.

---

## Interpreting results

| Symptom | Likely cause |
|---|---|
| `verify` fails at `install` | stale build — rerun Step 1 |
| `propose` says `no session found` | you skipped Step 5, or ran it in another directory |
| `propose` says `vacuous rule` | the rule does not match the command you recorded |
| Block does not fire | the scar is `pending`, not `accepted` |
| `doctor` warns about the status line | you already had one; Grudge will not overwrite it |
| `no installed runtime found` | you ran `packages/grudge/dist/grudge.mjs` with `--cwd` instead of the installed copy |

## What a full pass means

Every step passing establishes that:

1. the Guard installs into a repository and can be removed cleanly;
2. it records sessions and translates host tool names;
3. a rule learned from a session is enforced on the live path;
4. benign calls are not affected;
5. the engine's offline proof is red on the bad agent and green on the fixed one;
6. both test suites are green.

It does **not** establish that other agents are protected. Codex, Gemini CLI,
GitHub Copilot, OpenCode, and Windsurf receive an advisory instruction file —
nothing blocks their tool calls. Guard enforcement is verified for Claude Code
only, because it is the only integration that exposes blocking command hooks.

---

## Cleanup

```bash
rm -rf /d/Temp/grudge-lab
```

On PowerShell: `Remove-Item -Recurse -Force D:\Temp\grudge-lab`.
