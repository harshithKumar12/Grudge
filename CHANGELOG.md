# Changelog

## 0.2.0 - 2026-10-29

- Add `grudge verify`: one offline command that installs the guard into a temporary project, proposes and accepts a harmless rule, feeds the installed hook runner real Claude Code `PreToolUse` payloads over stdin, and checks that a matching `Bash` call exits `2`, a benign call exits `0`, malformed input fails open, exactly one block is logged, and `grudge report` shows it. Prints one PASS/FAIL line per check, exits non-zero on failure, keeps the temp project on failure (and with `--keep`), and supports `--json`.
- A PreToolUse deny now exits `2` and also writes `grudge: blocked by <id>: <reason>` to stderr. The deny JSON is still printed, so the reason survives either path.
- `propose` now reports the truth: a pending scar returns `accepted: false`, `enforced: false`, `status: "pending"`, and the human output says `PENDING. Not enforced until you run: grudge accept <id>`.
- Add `grudge propose --accept` (and `autoAccept` config) so one command can produce an enforced rule. Default stays pending; the trade-off is documented.
- Reject unknown options with exit code `2` and the list of valid flags instead of ignoring them. `--help` now lists `verify`, `--rule-stdin`, `--preventive`, and `--accept`.
- Complete the Claude Code tool map: `PowerShell` to `shell`, `NotebookRead` to `read_file`, `NotebookEdit` to `write_file`, matched case-insensitively. Unmapped host tools such as `Glob` keep their own name rather than being coerced.
- `grudge doctor` states that file checks cannot prove blocking and points at `grudge verify`.
- The managed instruction block tells the model to show the exact command output and never to claim a rule is active unless that output says accepted (977 characters, 9 lines, under the 1,000/12 caps).
- Document that third-party plugin hook errors are not Grudge's, and that `doctor` reports preserved third-party settings informationally.

## 0.1.9 - 2026-10-29

- Report a preserved `statusLine` whose command points at a script that is not on disk: `setup` and `grudge doctor` now name the missing path instead of only saying the status line was preserved. Grudge still never rewrites an existing status line.
- `grudge doctor` finds a user-scope install when run inside a project that has no local `.grudge/`, instead of reporting Grudge as not installed, and no longer demands `.gitignore` entries for a project that has no Grudge state.
- Document the one-install, every-project workflow: user-scope hooks read the project directory from the hook payload.
- Document per-agent setup in the README: where each of Claude Code, OpenCode, Codex, Gemini CLI, GitHub Copilot CLI, Windsurf, and Cursor gets configured, the exact managed block written into `AGENTS.md`, and how to turn the guard off without uninstalling.

## 0.1.8 - 2026-10-29

- Fix `grudge scars show` crashing instead of printing the pending or admitted Scar.
- Give the Node CLI a real `--help` screen and short flags (`-h`, `-v`, `-j`, `-y`, `-a`, `-s`, `-c`).
- Ship the demo data inside the Python wheel so `grudge-engine demo` works on a clean install.
- Default `grudge-engine admit --controls` to the packaged example controls.
- Evaluate filtered taint seeds so `grudge-engine shrink --failure demo` works.
- Keep the terminal gate report ASCII-safe on legacy Windows consoles.
- Add `grudge-engine --version` and short flags (`-j`, `-s`, `-a`, `-o`, `-r`, `-f`, `-c`).
- Document the short command forms in the README.

## 0.1.7 - 2026-10-23

- Replace default raw JSON command output with structured human-readable output.
- Preserve the existing JSON shape behind `--json` and keep hook stdout machine-readable.
- Make repository setup the default scope and preselect Claude Code as the Guard adapter.
- Add CLI output documentation and a clear not-installed doctor state.

## 0.1.6 - 2026-10-23
- "Write from previous history"
-
-

## 0.1.5 - 2026-10-23

- Make uninstall remove only Grudge-managed marker content and preserve user files.
- Write the Claude Code instruction block to the scope-matching `CLAUDE.md`.
- Warn about duplicate user/project hook installs and deduplicate hook accounting by session and event payload.

## 0.1.4 - 2026-10-23

- Make `npx grudge-cli setup` work from any directory.
- Default setup from an unmarked directory to the **All projects** scope while keeping repository setup as the default inside marked projects.

## 0.1.3 - 2026-10-22

- Prepared the cross-registry release metadata and bundled runtime after the 0.1.2 hardening work.

## 0.1.2 - 2026-10-22

- Harden the Node guard installer and runtime validation for the Phase 22-24 release walkthrough.
- Add savings reporting and release-readiness documentation for the offline Guard proof.
