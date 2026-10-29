# TEST.md: try Grudge yourself (about 20 minutes)

This guide walks you through Grudge the way a new developer would meet it. By the end you will have seen a rule get installed, watched Claude Code get stopped by it, and read the numbers it keeps.

**The idea in three lines**
1. A **scar** is a rule about something the agent must never do again.
2. A **hook** checks every action Claude Code is about to take against your scars, and stops a match before it runs.
3. Grudge counts what it caught and stopped, so you can see whether it earns its place.

**You need:** Node 18 or newer, Claude Code installed, and a terminal. Step 10 also needs Python 3.11 or newer (WSL is fine).

> **Never test inside your home folder** (for example `C:\Users\you`). A repo-level install there acts like a global one and affects every project. Use the scratch folder in Step 1.

Commands below are shown for **PowerShell** first, then **bash/WSL** where they differ.

---

## Step 0: Clean up an earlier install (only if you ran setup in your home folder)

You need this if Claude Code shows a **SessionStart hook error** mentioning `.grudge\bin\grudge.mjs`.

1. Try the built-in remover first, from the folder where you ran setup:
   ```powershell
   cd $HOME
   npx grudge-cli@latest uninstall
   ```
2. Check what is left. Open `%USERPROFILE%\.claude\settings.json` and delete any hook or `statusLine` entry whose command contains `.grudge`. Save the file.
3. Open `%USERPROFILE%\.claude\CLAUDE.md` and delete the block between `<!-- grudge:begin` and `<!-- grudge:end -->` if it is there.
4. Remove the leftover folder:
   ```powershell
   Remove-Item -Recurse -Force $HOME\.grudge
   ```
5. Start Claude Code anywhere. The hook error should be gone.

---

## Step 1: Make a scratch project

Use a temporary directory, not `$HOME` and not the Grudge checkout. On
PowerShell, `$env:TEMP` is the Windows temporary directory; on bash/WSL use
`${TMPDIR:-/tmp}`.

```powershell
mkdir $env:TEMP\grudge-test
cd $env:TEMP\grudge-test
git init
```

bash/WSL:
```bash
mkdir -p "${TMPDIR:-/tmp}/grudge-test"
cd "${TMPDIR:-/tmp}/grudge-test"
git init
```

---

## Step 2: Install Grudge (pinned, so you do not get a cached old version)

```powershell
npx grudge-cli@0.1.8 setup
```

What you should see: a list of agents with **arrow keys to move, Space to toggle, Enter to confirm**, then a question about where to install (choose **this repository**).

Pick **Claude Code** only for this test.

**Check the version** printed during setup. It should be `0.1.8`. If the
version is older, clear the npx cache or install the intended version again.
For a local unreleased checkout, build the package and install the generated
`grudge-cli-0.1.8.tgz` into the scratch project; do not substitute the
repository's `packages/grudge/dist` path for the published package flow.

---

## Step 3: Run the health check

```powershell
npx grudge-cli@latest doctor
```

Everything should report as fine: Node version, hook script, settings file, hooks present, `.gitignore` entries.

Now see what was created:

```powershell
dir .grudge
dir .claude
```

You should see `.grudge\bin\grudge.mjs` and `.claude\settings.json` containing hooks.

---

## Step 4: Prove the installed script runs on its own

This is the check that catches the "Cannot find module ... commands\index.js" bug.

```powershell
node .grudge/bin/grudge.mjs statusline
```

Pass: it prints a short line, or nothing, and exits quietly.
Fail: any message containing `Cannot find module`. That means the installed file is not self-contained. Stop and report it.

To save typing for the rest of the test, define a short name for this session:

```powershell
function grudge { node .grudge/bin/grudge.mjs @args }
```
bash/WSL: `alias grudge='node .grudge/bin/grudge.mjs'`

---

## Step 5: Create a harmless test rule

We will ban one harmless command, `echo GRUDGE_TEST`, so nothing real is at risk.

```powershell
grudge propose --rule 'never call shell where command ~ \"GRUDGE_TEST\"' --why "harmless test rule" --preventive
```

bash/WSL (quotes are simpler there):
```bash
grudge propose --rule 'never call shell where command ~ "GRUDGE_TEST"' --why "harmless test rule" --preventive
```

If PowerShell complains about quotes, run this one command from Git Bash or WSL in the same folder.

The rule is **pending**. A person has to approve it. That is on purpose, so a model can never add rules that block itself without you knowing.

```powershell
grudge scars list
grudge accept <the id shown above>
grudge scars list
```

Pass: the scar moves from pending to accepted.

---

## Step 6: Test the guard without Claude Code

Feed Grudge a fake "Claude is about to run this command" message, exactly as Claude Code would.

An **allowed** command:
```powershell
'{"session_id":"t1","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo hello"}}' | node .grudge/bin/grudge.mjs hook pre-tool-use
```
Pass: no deny decision.

A **blocked** command:
```powershell
'{"session_id":"t1","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo GRUDGE_TEST"}}' | node .grudge/bin/grudge.mjs hook pre-tool-use
```
Pass: a deny decision that names the scar and gives a short reason.

---

## Step 7: Test it inside Claude Code (the real proof)

1. Start Claude Code inside `grudge-test`:
   ```powershell
   claude
   ```
2. Type `/hooks`. You should see the Grudge hooks listed.
3. At the start you may see a short line listing your active scars. That is the SessionStart hook, and it is capped at about 1,200 characters.
4. Ask:
   > Run this shell command: echo GRUDGE_TEST

   Pass: Claude Code does **not** run it, and shows a message naming the scar and telling Claude not to retry.
5. Ask:
   > Run this shell command: echo hello

   Pass: it runs normally. Grudge only stops what a rule matches.

If step 4 runs the command anyway, the hook is not wired up. Go back to Step 3.

---

## Step 8: Read the numbers

Exit Claude Code, then:

```powershell
grudge stats
grudge statusline
```

Pass: at least one **block** is counted. Token figures are always labeled **est.** because they are an estimate (blocks times an assumed cost of a retry), not a measurement.

---

## Step 9: The end-of-turn savings line

Repeat Step 7 and look right after Claude answers. You should see one short line like:

```
Grudge: 1 mistake caught, 1 blocked. ~1.5k tokens saved (est.), ~1.2k net of what Grudge injected.
```

It should stay silent on turns where nothing was caught. Then run:

```powershell
grudge report
```

to see this session and your lifetime totals.

---

## Step 10: See how a rule is born from a real mistake (optional)

This replays the demo: an agent leaks a fake secret, a rule is proposed and accepted, and the same attempt is blocked in a second session. No network, no API key.

```bash
git clone https://github.com/harshithKumar12/Grudge
cd Grudge
python -m pip install -e .
python -m grudge demo --guard --json
```

Pass: the output shows session 1 leaked and a rule was proposed, and session 2 was blocked.

For the visual version with the shrink animation:
```bash
python -m grudge demo
```

---

## Step 11: Remove everything

From `grudge-test`:
```powershell
npx grudge-cli@0.1.8 uninstall
```
Then check `.claude\settings.json` has no `.grudge` entries and that the managed block is gone from `CLAUDE.md`. Uninstall removes only Grudge-managed content; do not manually delete a file containing user content.

---

## If something looks wrong

| What you see | What it means |
|---|---|
| `Cannot find module ... commands\index.js` | The installed script is the old unbundled one. Update to `0.1.8` or later and run setup again. |
| Setup prints a wall of JSON | You are on an old version. `0.1.8` prints a structured summary by default; use `--json` for scripts. |
| You chose scope "local" but the result says "repo" | Old scope bug. Update and retry. |
| `doctor` is green but Claude runs the blocked command | Settings file not loaded. Restart Claude Code and check `/hooks`. |
| Quote errors in `propose` on PowerShell | Use Git Bash or WSL for that one command, or the stdin option if your version has it. |
| Hook error on every session in every project | The install went into your home folder. Do Step 0. |

## You are done when

- [ ] `doctor` is clean and Step 4 runs without errors.
- [ ] The blocked command is stopped in Claude Code and the harmless one runs.
- [ ] `stats` shows at least one block, with figures labeled **est.**
- [ ] Uninstall leaves no `.grudge` entries behind.
