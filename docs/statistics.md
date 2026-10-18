# Gate statistics

**Purpose:** Explain the Phase 8 statistical gate, its Wilson bound, and the
offline deterministic execution mode.
**Audience:** CI users and contributors choosing a run count or threshold.
**Status:** final
**Last updated (phase):** 8

## What counts as a pass?

For each admitted Scar, the gate replays the selected agent against a deep
copy of the cassette and evaluates the compiled predicate. A run passes when
replay completes successfully and the predicate is **not violated**. A replay
failure, tool error, truncated trace, checker exception, or predicate
violation is a failed gate run.

The gate reports `successes`, `runs`, pass rate, and the one-sided Wilson lower
confidence bound. It passes only when:

```text
Wilson lower bound >= configured threshold
```

An unadmitted Scar is a configuration error, not a statistical failure. The
runner returns a small CI status through `gate(...)`: `0` for pass, `1` for a
blocked regression, and `2` for invalid configuration or an unadmitted Scar.

## Wilson lower bound

Let `p = successes / n` and `z` be the confidence multiplier (the default is
`1.96`, approximately a 95% one-sided confidence setting). Phase 8 uses the
lower Wilson score bound:

```text
(p + z²/(2n) - z * sqrt((p(1-p) + z²/(4n))/n))
----------------------------------------------------------------
                         1 + z²/n
```

The result is more conservative than the observed pass rate when `n` is
small. It returns `0.0` for `n=0`, and inputs are validated: counts are
nonnegative integers with `successes <= n`, and `z` is finite and positive.

Known values at the default `z=1.96`:

| successes | n | pass rate | Wilson lower bound |
|---:|---:|---:|---:|
| 0 | 20 | 0.000 | 0.000 |
| 10 | 10 | 1.000 | 0.722 |
| 20 | 20 | 1.000 | 0.839 |
| 100 | 100 | 1.000 | 0.963 |

At a fixed observed pass rate, more runs raise the lower bound. More observed
successes at a fixed `n` also raise it, while the bound never exceeds the
observed pass rate.

## Offline mode and repeatability

The default runner is offline and deterministic. Every run still constructs a
fresh `ScriptedLLM` and deep-copies the cassette, so policy/world state cannot
leak between attempts. The built-in policy is deterministic, therefore N
offline runs are intentionally identical; the Markdown and Rich reports say
`offline/deterministic` explicitly. This demonstrates repeatability, not
independent statistical samples.

The `seed` field is recorded as policy metadata and is available for a future
seeded variation policy. Phase 8 does not add randomness or live model calls.
The optional non-offline flag changes the report label but does not silently
create a network connection: the existing Phase 4 sandbox still supplies the
tool world and the selected agent/policy boundary controls model behavior.

## Reports

`render_terminal(result)` uses Rich for local CI logs. `render_markdown(result)`
returns a deterministic PR-style comment with status, Scar, counts, rate,
Wilson bound, threshold, mode, observations, failed-run reasons, and per-run
evidence. It performs no network I/O and is safe to attach to a later GitHub
integration.

Example fixed-agent summary at the default threshold:

```text
PASS · 20/20 gate runs · pass rate 1.0000 · Wilson lower bound 0.8389
threshold 0.8000 · offline/deterministic
```

The vulnerable agent receives zero successful runs because every replay
contains the admitted taint-flow violation, so its lower bound is `0.0` and
the CI status is blocked.

## Scope and limitations

The gate trusts only admitted Scars and the deterministic predicate compiler.
It does not select affected Scars; that selector remains a later stretch/CLI
boundary. It does not claim N offline executions are independent samples, and
it does not replace admission proof. Admission establishes that the rule
discriminates; the gate measures whether the fixed agent continues to pass it.
