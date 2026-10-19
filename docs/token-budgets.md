# Token budgets and estimated savings

**Purpose:** Define the bounded text surfaces and the honest savings calculation.
**Audience:** Users and maintainers of the local Guard hooks.
**Status:** final
**Last updated (phase):** 20

## Caps

| Output | Cap | Enforcement |
|---|---:|---|
| SessionStart injection | 1,200 characters and 8 scars; each line 140 characters | `session-start` selects at most 8 rules and truncates each line and the total deterministically |
| Block reason | 400 characters | PreToolUse truncates the plain-English reason with its scar ID and retry guidance |
| Prompt nudge | 200 characters | UserPromptSubmit truncates the propose hint |
| AGENTS.md block | 1,000 characters and 12 lines | `limitAgentsBlock()` applies the line cap first, then the character cap |

`core/budget.js` exposes the caps, deterministic prefix truncation, and
doctor-ready measurements. Measurements include characters, UTF-8 bytes,
estimated tokens, cap, and whether the output is within the cap. The cheap token
estimate is `ceil(characters / 4)`; it is an estimate, not a tokenizer result.

## Stats and status line

Counters are stored in `.grudge/stats.json`, which is local and gitignored by
the installer. Missing or corrupt JSON becomes zeroed counters rather than
breaking a hook. The tracked counters are blocks, warnings, proposals, accepted
scars, and per-scar counts.

Estimated savings are always calculated as:

```text
blocks × config.avoidedRetryTokens
```

The default assumption is 1,500 avoided retry tokens per blocked mistake. The
result is always labeled **`est.`**. It is not a measurement of model usage and
must not be presented as one.

The status line is deliberately short:

```text
grudge: 4 scars, 2 blocked, ~3.0k tokens saved (est.)
```

It prints nothing when `GRUDGE_DISABLE=1` or `mode: "off"`, and the lane-local
test asserts it completes in under 50 ms on a temporary repository. On the lane
machine, 20 measured calls produced p50 **1.20 ms**, p95 **4.83 ms**, and max
**4.83 ms** (filesystem reads included; process startup excluded).

## Honest comparison

A long list of “never do X” instructions in `CLAUDE.md` is loaded into model
context on every turn, whether or not the mistake is relevant. Grudge keeps the
instruction block short and uses committed scars plus deterministic hooks to
spend text on relevant reminders only. The status-line savings number remains
an explicit assumption: it helps expose the operating model, but it does not
claim to measure tokens consumed by a particular provider.
