# Token budgets and estimated savings

**Purpose:** Define the bounded text surfaces and the honest savings calculation.
**Audience:** Users and maintainers of the local Guard hooks.
**Status:** final
**Last updated (phase):** 0.1.5 · 2026-10-23

## Caps

| Output | Cap | Enforcement |
|---|---:|---|
| SessionStart injection | 1,200 characters and 8 scars; each line 140 characters | `session-start` selects at most 8 rules and truncates each line and the total deterministically |
| Block reason | 400 characters | PreToolUse truncates the plain-English reason with its scar ID and retry guidance |
| Prompt nudge | 200 characters | UserPromptSubmit truncates the propose hint |
| Managed instruction block | 1,000 characters and 12 lines | The installer applies the line cap first, then the character cap |

`core/budget.js` exposes the caps, deterministic prefix truncation, and
doctor-ready measurements. Measurements include characters, UTF-8 bytes,
estimated tokens, cap, and whether the output is within the cap. The cheap token
estimate is `ceil(characters / 4)`; it is an estimate, not a tokenizer result.

## Stats and status line

Savings events are appended to local `.grudge/stats.jsonl`. Readers skip blank
or corrupt lines. Each event may
carry a session id, catch outcome, scar id, and injected character count; events
from Advisory integrations are ignored. The older `.grudge/stats.json` remains a
compatibility fallback for repositories created before Phase 23.

Estimated savings are always calculated as:

```text
blocks × config.avoidedRetryTokens
```

The default assumption is 1,500 avoided retry tokens per blocked mistake. The
result is always labeled **`est.`**. It is not a measurement of model usage and
must not be presented as one.

Report overhead is estimated as `ceil(injected characters / 4)`. Net savings are
`estimated avoided retry tokens - estimated injected tokens`; both values are
always labeled **`est.`**. `grudge report --session --lifetime --json` returns
catch, block, warning, proposal, acceptance, overhead, avoided-retry, and net
figures for the requested scopes. The Stop hook reports only newly caught
mistakes since the previous report and does not double count them.

The status line is deliberately short:

```text
grudge: 4 scars, 2 blocked, ~3.0k tokens saved (est.)
```

It prints nothing when `GRUDGE_DISABLE=1` or `mode: "off"`, and the lane-local
test asserts it completes in under 50 ms on a temporary repository. On the lane
machine, 20 measured calls produced p50 **1.20 ms**, p95 **4.83 ms**, and max
**4.83 ms** (filesystem reads included; process startup excluded).

When invoked with `--session <id>`, the status line uses that session's caught,
blocked, warned, and estimated savings totals. Without a session id it retains
the lifetime compact form.

## Honest comparison

A long list of “never do X” instructions in `CLAUDE.md` is loaded into model
context on every turn, whether or not the mistake is relevant. Grudge keeps the
instruction block short and uses committed scars plus deterministic hooks to
spend text on relevant reminders only. The status-line savings number remains
an explicit assumption: it helps expose the operating model, but it does not
claim to measure tokens consumed by a particular provider.
