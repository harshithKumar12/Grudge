<div align="center">

<img src="https://raw.githubusercontent.com/harshithKumar12/Grudge/master/docs/assets/grudge-logo.png" alt="Grudge logo" width="110" />

# Grudge CLI · Node Guard

Local, deterministic protection against recurring AI-agent mistakes.

<a href="https://github.com/harshithKumar12/Grudge#readme">Full documentation</a>

</div>

## Install

```bash
npm install --global grudge-cli
npm --version
grudge --version
grudge doctor
```

For a temporary run without a global install:

```bash
npx grudge-cli@latest setup
npx grudge-cli@latest doctor
```

`npx` is temporary and does not make `grudge` available as a PowerShell
command. If PowerShell reports that `grudge` is not recognized, add npm's
global binary directory to the user PATH, reopen PowerShell, and retry:

```powershell
$npmBin = npm prefix --global
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ';') -notcontains $npmBin) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$npmBin", "User")
}
$env:Path = "$npmBin;$env:Path"
grudge --version
```

The npm package also exposes `grudge-node` when the Python engine is installed
alongside it.

For a non-interactive Claude Code repository setup:

```bash
npx grudge-cli@latest setup --yes --agents claude-code --scope repo
```

Claude Code is the only agent with real hook enforcement. The others receive a
managed instruction block in the file they already read:

```bash
npx grudge-cli@latest setup --yes --agents opencode,codex --scope repo   # AGENTS.md
npx grudge-cli@latest setup --yes --agents gemini-cli --scope repo       # GEMINI.md
npx grudge-cli@latest setup --yes --agents copilot --scope repo          # .github/copilot-instructions.md
npx grudge-cli@latest setup --yes --agents windsurf --scope repo         # .windsurfrules
npx grudge-cli@latest setup --yes --agents claude-code --scope global    # every project
```

`--agents` accepts a comma-separated list, so one run can configure several
tools. Codex and OpenCode share a repository `AGENTS.md` and get a single block.
See
[Integrations](https://github.com/harshithKumar12/Grudge#integrations) for the
per-agent paths and
[What Grudge writes into your files](https://github.com/harshithKumar12/Grudge#what-grudge-writes-into-your-files)
for the exact block and how to edit `AGENTS.md` around it.

Preview changes before writing:

```bash
npx grudge-cli@latest setup --dry-run
```

Remove only Grudge-managed content:

```bash
npx grudge-cli@latest uninstall
```

## What this package provides

- Claude Code hook setup and local enforcement.
- `setup`, `doctor`, `uninstall`, and dry-run workflows.
- `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`
  hooks.
- Local Scar proposals, acceptance, stats, reports, and status-line output.
- Scope-aware repository, user, and all-project configuration.
- Timestamped backups and selective uninstall cleanup.
- A self-contained bundled runtime with no npm runtime dependencies.

Claude Code is the verified **Guard** adapter. Codex, Gemini CLI, GitHub Copilot
CLI, OpenCode, and Windsurf are **Advisory** integrations; enforcement is not
guaranteed for those tools. Cursor is unverified and the installer writes no
Cursor files.

## Development checkout

From the repository root:

```bash
npm --prefix packages/grudge run build
npm --prefix packages/grudge run setup:repo
npm --prefix packages/grudge run doctor:repo
npm test --prefix packages/grudge
```

From this directory:

```bash
npm run build
npm run setup:repo
npm run doctor:repo
npm run uninstall:repo
```

The runtime requires Node.js 18 or newer. The package has no runtime npm
dependencies.

## Troubleshooting

If npm prints warnings about an unknown `allow-scripts` configuration, inspect
the local setting with:

```bash
npm config get allow-scripts
```

That warning comes from the npm environment. It is separate from Grudge's
runtime and test behavior.

If a version-bump test still expects the previous version, update all version
surfaces together, including `src/version.js`, package metadata, Python
metadata, release docs, and the version assertions under `test/`.

## License

MIT. See the repository [LICENSE](https://github.com/harshithKumar12/Grudge/blob/master/LICENSE).
