<!-- OWNER: lane-c -->
# Grudge npm package

```bash
npx grudge setup --yes --agents claude-code --scope repo
npx grudge doctor
```

This installs the local, offline mistake guard. The installer copies the
zero-dependency `dist/grudge.mjs` runtime into `.grudge/bin/`, merges Claude
Code hooks, and adds a short managed instruction block. It is idempotent,
supports `--dry-run`, creates timestamped backups, and can be reversed with
`npx grudge uninstall`.

Claude Code is the verified **Guard** adapter. Codex, Gemini CLI, GitHub
Copilot, OpenCode, and Windsurf are **Advisory** instruction integrations;
Cursor is currently unverified and writes nothing. See
[`docs/integrations.md`](../../docs/integrations.md).

The runtime requires Node.js 18+ and has no npm runtime dependencies.
