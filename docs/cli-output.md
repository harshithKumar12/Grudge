# CLI output contract

**Purpose:** Document the default human-readable output and the stable JSON mode.
**Audience:** Users, scripts, integration authors, and release reviewers.
**Status:** final for 0.1.7
**Last updated (phase):** 25 - 2026-10-29

## Output rules

- Every normal command prints a header: `Grudge <command> v<version>`.
- Default output is readable text with grouped checks, marks, a summary, and a
  `Next:` command.
- `--json` prints the existing JSON object with two-space indentation. The
  object shape is unchanged.
- Human-readable output is ASCII-only: `[ok]`, `[fail]`, `[warn]`, and
  `[skip]`. It never emits ANSI color codes, so piped output, CI logs, and
  legacy Windows consoles render identically. `--ascii` and `NO_COLOR=1` are
  accepted for compatibility and change nothing.
- Hook stdout is an exception: Claude Code hook responses remain machine JSON.
- Errors use `Error: ...` and `Fix: ...`; stack traces require `--debug`.

## Command matrix

| Command | Before 0.1.7 default | 0.1.7 default | JSON mode |
|---|---|---|---|
| `setup` / `init` | File changes and warnings, with inconsistent summaries | Header, scope/agent/files groups, warnings, summary, next command | Existing setup result, pretty-printed |
| `doctor` | One raw JSON line or individual check lines | Grouped checks, collapsed Budgets group, Healthy/Needs attention verdict, fixes, and a line that file checks cannot prove blocking | Existing doctor object, including measurements |
| `verify` | Did not exist | One `[ok]`/`[fail]` line per check, then `Result: PASS/FAIL (n/10 checks)` and cleanup note; non-zero exit on failure | `{ok, checks, root, kept}` |
| `uninstall` | Removed paths or a compact summary | Restored/removed groups, summary, next setup command | Existing uninstall result |
| `stats` | Raw JSON through the top-level CLI | Counters, scars, estimated savings, summary | Existing stats object |
| `report` | Raw JSON through the top-level CLI | Session/lifetime savings groups and summary | Existing report object |
| `status` | Five ad-hoc lines | Standard status header, checks, summary, next command | Doctor object when explicitly requested |
| `statusline` | Compact status line | Compact one-line status contract for host-agent polling | Not intended for scripts; use `stats --json` |
| `propose` | Raw result object | Proposal mark and a status line that says `PENDING` (or `accepted and enforced`), summary, next acceptance command | Existing proposal object, now with `accepted: false` while pending |
| `accept` | Raw result object | Scar acceptance mark and next compile command | Existing acceptance object |
| `reject` / `scars` actions | Raw result or ad-hoc lines | Action result or grouped Scar list | Existing result object |
| `compile` | Compact sentence in Python CLI | Header, compiled rules, output path, summary | Existing compile object |
| `hook` | Machine-readable hook stdout | Unchanged machine-readable stdout | Unchanged hook contract |

## Example: doctor

```text
Grudge doctor v0.1.7
Grudge is not installed here.
Next: grudge setup --scope repo
1 passed, 0 failed, 0 warnings
```

For an installed but broken repository, only failing checks and their fixes are
shown:

```text
Grudge doctor v0.1.7
✗ Runtime: missing
  Fix: grudge setup --scope repo
✗ .gitignore: 0/3 entries
  Fix: grudge setup --scope repo
Needs attention (2 issues)
4 passed, 2 failed, 0 warnings
Next: grudge setup --scope repo --agents claude-code
```

Use `grudge doctor --json` when another program needs the complete check and
measurement objects.
