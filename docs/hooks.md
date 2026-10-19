# Grudge hook contract

**Purpose:** Document the local Claude Code command hooks and their fail-open behavior.
**Audience:** Developers installing Grudge Guard hooks.
**Status:** final
**Last updated (phase):** 17

## Command and official decision mechanism

The installer registers the same command for each event:

```text
node .grudge/bin/grudge.mjs hook <event>
```

The event names are `pre-tool-use`, `session-start`, `user-prompt-submit`,
`post-tool-use`, and `stop` in the command path. The Phase 17 handlers are
PreToolUse, SessionStart, UserPromptSubmit, and Stop.

Claude Code's hooks reference was checked on 2026-10-19 at
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
Grudge therefore uses exit code 0 for both allow and deny decisions, as required
by the current JSON decision mechanism. Unknown events, malformed input, corrupt
compiled rules, and internal errors emit one short stderr warning and exit 0.

## Hook behavior

- **PreToolUse:** normalizes the pending call, loads local `.grudge/compiled.json`,
  evaluates active `block` and `warn` rules against the current session, and
  denies a match or emits one warning. Block reasons include the scar ID, the
  plain-English rule, and “Do not retry; change approach or ask the user.”
- **SessionStart:** prunes session logs older than seven days or beyond 500 events,
  then prints at most eight relevant scars, one line each. Each line is at most
  140 characters and total output is at most 1,200 characters.
- **UserPromptSubmit:** recognizes configured correction phrases and emits one
  proposal nudge. The nudge is at most 200 characters; unrelated prompts are silent.
- **Stop:** updates `.grudge/stats.json` only and prints nothing.

`GRUDGE_DISABLE=1` and `mode: "off"` allow immediately. Every handler has a
default 1,500 ms budget; after the budget expires it allows the action and emits
one short stderr warning. Oversized input (over 1 MiB) also fails open.

## Timing evidence

Measured over 30 in-process PreToolUse calls (temporary repository, empty
compiled rule set) on the lane machine:

```text
p50 1.80 ms · p95 4.86 ms · max 5.10 ms
```

This test measures handler work rather than a fresh Node process per call. Node
startup is deployment-dependent and is not included in the in-process figure;
the 1,500 ms fail-open budget still covers startup plus handler work.
