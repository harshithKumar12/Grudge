<!-- OWNER: lane-c -->
# Grudge npm package

From the repository root, exercise this checkout with:

```bash
npm --prefix packages/grudge run build
npm --prefix packages/grudge run setup:repo
npm --prefix packages/grudge run doctor:repo
```

From this directory, the short commands are:

```bash
npm run setup:repo
npm run doctor:repo
```

These target the repository root. The direct equivalent is `node dist/grudge.mjs
...` from this directory, or `node packages/grudge/dist/grudge.mjs ...` from
the repository root.

This installs the local, offline mistake guard. The installer copies the
zero-dependency `dist/grudge.mjs` runtime into `.grudge/bin/`, merges Claude
Code hooks, and adds a short managed instruction block. It is idempotent,
supports `--dry-run`, creates timestamped backups, and can be reversed with
`npm --prefix packages/grudge run uninstall:repo` from the repository root, or
`npm run uninstall:repo` from this directory. The `npx
grudge-cli ...` form is for an installed or published package, not an unlinked
repository checkout. Uninstall prints a readable summary by default; pass
`--json` when a script needs machine-readable output.

Claude Code is the verified **Guard** adapter. Codex, Gemini CLI, GitHub
Copilot, OpenCode, and Windsurf are **Advisory** instruction integrations;
Cursor is currently unverified and writes nothing. See the
[integration matrix](https://github.com/harshithKumar12/Grudge/blob/master/docs/integrations.md).

The runtime requires Node.js 18+ and has no npm runtime dependencies.
