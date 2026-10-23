# Changelog

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
