# Integrations

**Purpose:** Explain where Grudge writes agent instructions and hooks.
**Audience:** Developers installing the npm package.
**Status:** final
**Last updated (phase):** 19/21

`grudge setup` is local and offline. It parses before merging, backs up changed
files under `.grudge/backups/<timestamp>/`, preserves unrelated JSON keys, and
uses versioned markers for instruction text. `--dry-run` computes the same plan
but writes nothing. `grudge uninstall` removes only managed content.

| Agent | Tier | Status | Documented target | Source checked |
|---|---|---|---|---|
| Claude Code | Guard | **Verified** | `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`; `AGENTS.md` | [settings](https://code.claude.com/docs/en/settings), 2026-10-19 |
| Codex | Advisory | **Verified** | `AGENTS.md` or `~/.codex/AGENTS.md` | [AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md), 2026-10-19 |
| Gemini CLI | Advisory | **Verified** | `GEMINI.md` or `~/.gemini/GEMINI.md` | [GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md), 2026-10-19 |
| GitHub Copilot | Advisory | **Verified** | `.github/copilot-instructions.md` | [custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions), 2026-10-19 |
| OpenCode | Advisory | **Verified** | `AGENTS.md` or `~/.config/opencode/AGENTS.md` | [rules](https://opencode.ai/docs/rules/), 2026-10-19 |
| Windsurf | Advisory | **Verified** | `.windsurfrules` workspace fallback | [memories and rules](https://docs.windsurf.com/windsurf/cascade/memories), 2026-10-19 |
| Cursor | Advisory | **Unverified** | No write target | [rules](https://docs.cursor.com/context/rules), 2026-10-19 |

Cursor's current public page did not expose a stable exact filename/config
contract during verification. Its adapter prints the snippet and URL but
deliberately writes no Cursor files.

```bash
# from the repository root
npm --prefix packages/grudge run setup:repo
npm --prefix packages/grudge run doctor:repo
npm --prefix packages/grudge run uninstall:repo

# from packages/grudge, targeting the repository root
npm run setup:repo
npm run doctor:repo
```

For a dry run or another adapter, use the direct command from the repository
root: `node packages/grudge/dist/grudge.mjs setup --dry-run --agents codex
--scope repo`.
The `npx grudge-cli setup` form launches the interactive selector for an
installed or published package. Use the arrow keys to move, Space to select
agents, and Enter to confirm. It does not select this checkout automatically.
Relative paths are resolved from the current directory, so
`packages/grudge/dist/grudge.mjs` must not be used after `cd packages/grudge`.

Hooks call `node .grudge/bin/grudge.mjs` directly; they never invoke `npx`,
Python, a server, or a network.
