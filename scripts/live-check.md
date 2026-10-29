# Live Claude Code check

**Purpose:** Record one real, interactive Claude Code run that proves the
installed Grudge block works end to end. This is the only check that cannot be
automated: it needs a human in the Claude Code UI.
**Audience:** Release operator.
**Status:** not yet recorded for `0.1.8`.
**Last updated:** 2026-10-28

Run this in a **scratch repository** (for example `%TEMP%\grudge-live` or
`${TMPDIR:-/tmp}/grudge-live`). Never run it in your home folder and never in
the Grudge checkout: a repo-scope install in either place behaves like a global
one.

## 0. Prerequisites

```powershell
node --version        # 18 or newer
claude --version      # prints a version, e.g. 2.1.x
```

If `claude` is missing, stop. The check is not replaceable by `node
.grudge/bin/grudge.mjs hook pre-tool-use`; that only proves the payload, not
that the host loads it.

## 1. Create the scratch repository

```powershell
mkdir $env:TEMP\grudge-live
cd $env:TEMP\grudge-live
git init
```

bash/WSL:

```bash
mkdir -p "${TMPDIR:-/tmp}/grudge-live"
cd "${TMPDIR:-/tmp}/grudge-live"
git init
```

## 2. Install the release candidate

Use the packed tarball for an unreleased build, or the registry package once
`0.1.8` is published:

```powershell
npm pack --pack-destination . ../../Desktop/Grudge/packages/grudge
npx --yes .\grudge-cli-0.1.8.tgz setup --yes --agents claude-code --scope repo
```

Expected: `Grudge setup v0.1.8`, `[ok] Scope: repo`, `[ok] Agents:
claude-code`, a `Files: N changed` line, and `Next: grudge doctor`.

Record the setup output here:

```text
<paste setup output>
```

## 3. Confirm the install is healthy

```powershell
npx grudge-cli@latest doctor
```

Expected: every check is `[ok]` (Node version, hook script, settings file,
hooks present, `.gitignore` entries) and the verdict line is `[ok] Healthy`.
Write any warning you see here:

```text
<paste doctor output>
```

## 4. Add one harmless rule

```powershell
node .grudge/bin/grudge.mjs propose --rule 'never call shell where command ~ "GRUDGE_TEST"' --why "harmless test rule" --preventive
node .grudge/bin/grudge.mjs scars list
node .grudge/bin/grudge.mjs accept <ID-FROM-LIST>
```

Expected: the scar starts as pending and becomes accepted after `accept`.

## 5. Prove the hook payload without the UI (sanity check only)

```powershell
'{"session_id":"live","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo GRUDGE_TEST"}}' | node .grudge/bin/grudge.mjs hook pre-tool-use
```

Expected: one JSON object on stdout with
`hookSpecificOutput.permissionDecision` set to `deny` and a
`permissionDecisionReason` naming the scar, exit code `0`.

```text
<paste deny payload>
```

## 6. Run the real check inside Claude Code

1. Start Claude Code in the scratch repository:

   ```powershell
   claude
   ```

2. Type `/hooks`. Expected: the Grudge hooks are listed for `SessionStart`,
   `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`.

3. Wait for the first turn. Expected: at most one short SessionStart line
   listing active scars (capped near 1,200 characters). Silence is also a pass.

4. Ask:

   > Run this shell command: echo GRUDGE_TEST

   **Expected (pass):** Claude Code does **not** run the command. A message
   naming the scar appears, telling Claude not to retry and to change approach.
   A retry of the same command must be blocked again.

5. Ask:

   > Run this shell command: echo hello

   **Expected (pass):** the command runs normally and prints `hello`.
   Only the rule-matched command is blocked.

6. Exit Claude Code.

## 7. Confirm the counters

```powershell
node .grudge/bin/grudge.mjs stats
node .grudge/bin/grudge.mjs statusline
```

Expected: at least one block is counted. Token figures are labelled `est.`
because they are an estimate, not a measurement.

```text
<paste stats output>
```

## 8. Uninstall leaves no residue

```powershell
node .grudge/bin/grudge.mjs uninstall
```

Expected: `.claude/settings.json` contains no `grudge` entries, the managed
block is gone from `CLAUDE.md`, and unrelated user settings are byte-identical
to their pre-setup content. Run `git status` and confirm no `.claude` diff
remains if the directory was clean before setup.

## 9. Screenshots

Attach one image per numbered item. Keep them in `docs/assets/live-check/` and
add each new file to `docs/INDEX.md`; the documentation check requires every
file under `docs/` to be indexed.

| Step | What the screenshot must show | File |
|---|---|---|
| 6.2 | `/hooks` listing all five Grudge hooks | `docs/assets/live-check/01-hooks-list.png` |
| 6.4 | Blocked `echo GRUDGE_TEST` with the scar message | `docs/assets/live-check/02-blocked-command.png` |
| 6.5 | Allowed `echo hello` with its output | `docs/assets/live-check/03-allowed-command.png` |
| 7 | `stats` output showing at least one block | `docs/assets/live-check/04-stats.png` |

## Result

- **Date run:**
- **Claude Code version:**
- **Node version:**
- **Grudge version:**
- **Pass / fail:**
- **Notes or defects found:**
