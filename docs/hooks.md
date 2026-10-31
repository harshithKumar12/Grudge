# Grudge hook contract

**Purpose:** Document the local Claude Code command hooks and their fail-open behavior.
**Audience:** Developers installing Grudge Guard hooks.
**Status:** final
**Last updated (phase):** 0.2.1 production remediation - 2026-10-31

## Command and official decision mechanism

The installer registers an **absolute** command for each event:

```text
"<node executable>" "<install root>/.grudge/bin/grudge.mjs" hook <event>
```

`<install root>` is the repository root for `--scope repo` / `--scope local`,
and the home directory for `--scope global`. Both tokens are quoted, so a path
with spaces works unchanged. A relative path such as
`.grudge/bin/grudge.mjs` is never registered: Claude Code runs a command hook
from whatever directory the session is in, so a relative path stops resolving
as soon as the agent `cd`s, and the host treats the failed command as
"allowed".

The event names are `pre-tool-use`, `session-start`, `user-prompt-submit`,
`post-tool-use`, and `stop` in the command path. The Phase 17 handlers are
PreToolUse, SessionStart, UserPromptSubmit, and Stop.

`grudge doctor` re-reads the registered commands and fails the `hook paths`
check when one is relative or points at a missing script; the fix it prints is
`re-run grudge setup`.

## Root resolution and rule precedence

A hook never derives its project from the process working directory. The
running script's own path is the anchor:

| Situation | Project root | Global rules |
|---|---|---|
| Repository or local install | the install root (the directory that owns `.grudge/bin/grudge.mjs`) | consulted when a global install exists in the home directory |
| Global install | the validated payload `cwd` | consulted always (the install root is the home directory) |
| No installed runtime found | the payload `cwd`, falling back to the process cwd | none |

The payload `cwd` is accepted only when it names an existing directory. For a
repository install it must also live inside the install root; a payload path
outside it is reported on stderr and the install root still enforces. A missing
or non-string `cwd` is reported and never silently disables enforcement.

Precedence between the two rule sets is deterministic:

1. **Global rules are loaded first and are authoritative.** They are evaluated
   in a global install and in any project while a global install exists.
2. **Project rules add protections.** A project rule with the same `id` as a
   global rule is ignored with a stderr warning; it can neither replace nor
   disable the global rule.
3. **Identical rule bodies are evaluated once**, so installing the same rule at
   both scopes does not double-evaluate it.
4. **`mode: "off"` is per installation.** Turning a project off stops that
   project's own rules but never the global installation, and turning the
   global install off does not stop an explicit project install.

Claude Code's hooks reference was checked on 2026-10-23 at
<https://code.claude.com/docs/en/hooks>. A command hook receives one JSON
object on stdin. A PreToolUse deny is returned on stdout as:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "..."
  }
}
```

Exit code 0 with no decision means that normal permission handling continues.
A PreToolUse **deny exits 2** and still prints the deny JSON. Exit 2 is the code
Claude Code blocks on even when it cannot parse stdout, and the JSON
`permissionDecisionReason` is the reason the user sees; Grudge also writes
`grudge: blocked by <scar id>: <reason>` to stderr. Re-checked against the hooks
reference on 2026-10-29. Unknown events, malformed input, corrupt compiled
rules, and internal errors emit one short stderr warning and exit 0 (fail open).

## Hook behavior

- **PreToolUse:** normalizes the pending call, loads the global and project
  `compiled.json` rule sets, evaluates active `block` and `warn` rules against
  the current session, and denies a match or emits one warning. Block reasons
  include the scar ID, the plain-English rule, and “Do not retry; change
  approach or ask the user.”
- **SessionStart:** prunes session logs older than seven days or beyond 500 events,
  then prints at most eight relevant scars from the layered global + project
  rule sets, one line each. Each line is at most 140 characters and total
  output is at most 1,200 characters.
- **UserPromptSubmit:** recognizes configured correction phrases and emits one
  proposal nudge. The nudge is at most 200 characters; unrelated prompts are silent.
- **Stop:** appends a `{"type":"stop"}` event to `.grudge/stats.jsonl` (the same
  append-only log every other counter uses) and emits one one-line savings
  message only when the current session has catches that have not appeared in a
  previous Stop report. Repeating Stop without a new catch is silent. The line
  is delivered through the documented top-level `systemMessage` field.

`GRUDGE_DISABLE=1` allows immediately. `mode: "off"` allows immediately for the
installation that declares it, while the other installation (global or project)
keeps enforcing. Oversized input (over 1 MiB) fails open.

## Enforcement failure policy

Enforcement is **fail-closed against its own bookkeeping**. The state a
decision needs is read with fixed caps, and the verdict is never raced against
a timer:

- `.grudge/compiled.json` is refused above 4 MiB instead of being parsed;
- the session tail is read as at most the last 2 MiB / 500 events;
- rule evaluation is pure CPU over already-loaded data;
- accounting runs *after* the verdict and is bounded to 1 s.

`hookBudgetMs` is an **observability threshold**, not a timeout. When the
bounded state load takes longer than the configured value, the hook writes
`grudge: state load took <n>ms, over hookBudgetMs <n>; enforcement continued
(fail-closed)` to stderr and returns the verdict the rules produced. It can
never turn a matching block into an allow.

| Situation | Result |
|---|---|
| A rule matches a prohibited call | **Deny** (exit 2) — before any accounting starts |
| State load exceeds `hookBudgetMs` | **Deny is unchanged**; a stderr notice reports the overrun |
| Large session history (over the byte/event cap) | **Deny is unchanged**; the bounded tail is what taint rules see |
| Stale or held `.grudge/stats.jsonl.lock` | **Deny is unchanged**; the enforcement path takes no lock |
| `.grudge/compiled.json` missing or corrupt | Allow with no rules; a corrupt file cannot invent a match |
| Malformed or oversized hook input | Allow, with an explicit stderr warning |
| Accounting (stats/session write) fails or is slow | Decision unchanged; accounting is bounded to 1 s and dropped if it overruns |
| Duplicate delivery of the same hook event | **Still enforced**; only the counter is deduplicated |

A matching prohibited call can therefore never be turned into an allow by
contention, a stale lock, a timeout, or an internal accounting error. The
fail-open cases above are all *infrastructure or input* failures, where nothing
proves the call is prohibited; callers that need stronger guarantees can run
`grudge verify` to prove blocking on the actual install.

Writes to `.grudge/stats.jsonl` are lock-free appends, and `seq` is the 1-based
line number computed by readers, so a killed process can never leave a lock that
blocks enforcement. The only lock left is the report cursor, which a later run
takes over once it is older than 120 s.

## Stop output mechanism

The official hooks reference documents `systemMessage` as a warning shown to the
user. Grudge emits the savings line as `{"systemMessage":"..."}` from the Stop
hook, verified against the current documentation on **2026-10-23**. The
PreToolUse deny continues to use `hookSpecificOutput.permissionDecision`.

PowerShell users can avoid DSL quote stripping with:

```powershell
'never call shell where command ~ "RULE"' | grudge propose --rule-stdin --why "reason"
```

## Claude Code instruction visibility

Claude Code's memory documentation was checked on **2026-10-23** at
<https://code.claude.com/docs/en/memory>. The installer writes the managed
Grudge block to `CLAUDE.md` at the matching scope: `<repo>/CLAUDE.md` for a
repository install and `~/.claude/CLAUDE.md` for a global install. `AGENTS.md`
remains available for adapters that document it as their instruction file.

## Timing evidence

Two different numbers matter, and they are measured separately.

**In-process handler work** (30 PreToolUse calls in one Node process, empty
compiled rule set) shows what the rule engine costs once Node is running:

```text
p50 1.80 ms · p95 4.86 ms · max 5.10 ms
```

**End-to-end hook cost** is what a host actually pays per call, because Claude
Code spawns a fresh `node grudge.mjs hook pre-tool-use` process each time. It
includes Node startup, module load, state read, decision, and accounting. On
Windows 11 / Node 25.2.1, 15 sequential spawns per case, measured against the
0.2.0 runtime:

| Case | Before (0.2.0) | After (remediation) |
|---|---|---|
| No rules | p50 1,778 ms · p95 2,460 ms | p50 164 ms · p95 218 ms |
| Matching block rule → exit 2 | p50 1,790 ms · p95 2,153 ms | p50 157 ms · p95 299 ms |
| Non-matching call → exit 0 | p50 1,720 ms · p95 1,820 ms | p50 187 ms · p95 248 ms |

The 0.2.0 figure was not Node startup: a 1,500 ms fail-open timer stayed
referenced until it fired, so *every* hook call paid the full budget. The 0.2.1
remediation removed the budget timer from the enforcement path entirely; state
reads are bounded by size instead, so no timer can keep the process alive or
allow a call. `packages/grudge/test/concurrency-enforcement.test.js` asserts a
real spawned hook stays under 1,000 ms so this cannot regress.
