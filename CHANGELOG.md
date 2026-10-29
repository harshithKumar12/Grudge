# Changelog

## 0.1.9 - 2026-10-29

- Report a preserved `statusLine` whose command points at a script that is not on disk: `setup` and `grudge doctor` now name the missing path instead of only saying the status line was preserved. Grudge still never rewrites an existing status line.
- `grudge doctor` finds a user-scope install when run inside a project that has no local `.grudge/`, instead of reporting Grudge as not installed, and no longer demands `.gitignore` entries for a project that has no Grudge state.
- Document the one-install, every-project workflow: user-scope hooks read the project directory from the hook payload.

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
