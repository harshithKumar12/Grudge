# Testing Grudge by hand

**Purpose:** One thing to do, one verdict to reach. This is not a reference.
**Audience:** Anyone who just installed `grudge-cli` and wants to know it works.
**Status:** draft
**Last updated (phase):** 0.2.3

Run it in a throwaway folder. About 10 minutes, no model, no network, no Python.

---

## Install as a real user

```bash
rm -rf /d/Temp/grudge-lab
mkdir -p /d/Temp/grudge-lab && cd /d/Temp/grudge-lab && git init
npm install -g grudge-cli
grudge --version
```

Expected: `grudge 0.2.3`.

Use a fresh directory. The `rm -rf` line is there because a leftover folder
from an earlier run makes `mkdir` fail, and a stale `.grudge/` in it will
produce results that are not about this run.

The npm package installs to your system PATH; no checkout needed. If
`grudge --version` says `command not found`, the global npm bin directory is not
on your PATH — reopen your terminal, or see the README's PATH note.

---

## 1. One-command proof

```bash
grudge verify
```

Expected tail:

```text
[ok] stats: 1 blocked event in .grudge/stats.jsonl
[ok] report: grudge report shows 1 caught, 1 blocked
Result: PASS (10/10 checks)
Temp project removed (use --keep to inspect it)
```

**Pass:** `Result: PASS (10/10 checks)`.

This is the only proof of *enforcement*. It feeds real Claude Code payloads
through the installed hook, blocks a matching call, lets a benign one through,
and fails open on malformed input.

---

## 2. Install the guard into this project

```bash
grudge setup -y
```

Expected tail:

```text
Grudge setup v0.2.3
[ok] Scope: repo
[ok] Agents: claude-code
[ok] Files: 5 changed
```

The warning about the settings path is normal — it means Claude Code only
loads this project's hooks when the session starts inside this folder. To
guard every directory on the machine instead, use `grudge setup -y --scope global`.

**What this proved:** the hook is registered in this repo's `.claude/settings.json`.

Optional but useful — confirm the install is coherent:

```bash
grudge doctor
```

Expected: `20 passed, 0 failed`. Warnings about an existing status line are
expected if you already have one. `doctor` deliberately ends with
`Enforcement: not proven by file checks` — it checks configuration, not
decisions. Step 1 is what proves blocking.

---

## 3. Learn a rule, then enforce it

A rule needs a recorded session first. Pipe a `PostToolUse` payload to the
hook — this is what Claude Code sends after every tool call:

```bash
echo '{"session_id":"u1","hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf ./dist"},"tool_response":"ok"}' \
  | node .grudge/bin/grudge.mjs hook PostToolUse
echo "captured=$?"
```

Expected: `captured=0`, no stdout.

`node .grudge/bin/grudge.mjs` is the runtime that `setup` installed *into this
project*, so it uses this project's rules and config. The global `grudge`
command works too, but piping a payload into a hook entry point is what
Claude Code actually does, so the guide uses that form.

Now propose and accept:

```bash
grudge propose \
  --rule 'never call shell where command ~ "rm -rf"' \
  --why "deleted the dist folder" --accept
```

Expected:

```text
[ok] Proposal: scar-111c96dbfe37
[ok] Status: accepted and enforced
```

Expected: `grudge: blocked by scar-...` with exit `2`.

**Pass:** `block=2`. And the mirror — a harmless call in the same session must exit `0`:

```bash
echo '{"session_id":"u2","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo hello"}}' \
  | node .grudge/bin/grudge.mjs hook PreToolUse >/dev/null 2>&1; echo "benign=$?"
```

Expected: `benign=0`. Both halves matter — a guard that blocks everything is
as broken as one that blocks nothing.

---

## 4. Clean up

```bash
grudge uninstall
```

Expected:

```text
[ok] Restored: 4 files
[ok] Removed: 9 paths
```

Check the folder afterwards:

```bash
ls -a
```

Expected: `.git`, `.gitignore`, and an **empty** `.claude/`. Every Grudge hook,
scar, and managed block is gone; the directory remains because uninstall will
not delete a folder it did not create and cannot know is unused. Delete it
yourself if it is empty.

**Pass:** no `.grudge/`, no Grudge hooks in `.claude/settings.json`, and your
own content untouched.

Then remove the lab:

```bash
rm -rf /d/Temp/grudge-lab
```

**Verdict:** Steps 1, 2, 3, and 4 all passing means the npm package installs,
blocks real calls, leaves benign calls alone, and uninstalls without collateral
damage.
