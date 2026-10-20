<!-- OWNER: lane-c -->
# Grudge npm package

From the repository root, exercise this checkout with:

```bash
npm --prefix packages/grudge run build
node packages/grudge/dist/grudge.mjs setup --yes --agents claude-code --scope repo
node packages/grudge/dist/grudge.mjs doctor
```

From this directory, use `node dist/grudge.mjs`. To install into the repository
root rather than `packages/grudge` itself, pass `--cwd ../..` to both commands:

```bash
node dist/grudge.mjs setup --cwd ../.. --yes --agents claude-code --scope repo
node dist/grudge.mjs doctor --cwd ../..
```

This installs the local, offline mistake guard. The installer copies the
zero-dependency `dist/grudge.mjs` runtime into `.grudge/bin/`, merges Claude
Code hooks, and adds a short managed instruction block. It is idempotent,
supports `--dry-run`, creates timestamped backups, and can be reversed with
`node packages/grudge/dist/grudge.mjs uninstall` from the repository root, or
`node dist/grudge.mjs uninstall --cwd ../..` from this directory. The `npx
grudge ...` form is for an installed or published package, not an unlinked
repository checkout.

Claude Code is the verified **Guard** adapter. Codex, Gemini CLI, GitHub
Copilot, OpenCode, and Windsurf are **Advisory** instruction integrations;
Cursor is currently unverified and writes nothing. See
[`docs/integrations.md`](../../docs/integrations.md).

The runtime requires Node.js 18+ and has no npm runtime dependencies.
