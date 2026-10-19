# Grudge instruction block

**Purpose:** The exact short instruction block installed into an agent rules file.
**Audience:** Host coding agents and the humans reviewing their proposals.
**Status:** final for Phase 18
**Last updated (phase):** 18

```text
<!-- grudge:begin v1 -->
## Grudge (mistake guard)
- A hook may block a tool call and cite a "scar". Do not retry the same call or work around it. Change approach, or ask the user if you think it is a false positive.
- When the user corrects a repeatable mistake, or something failed because of an action you should never repeat in this repo, record it once:
  `node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'`
- Rule forms: `never call <tool> where <field> ~ "<text>"`, `must call <tool> before <tool>`, `never call <tool> where <field> tainted_by <tool>`. Tools: read_file, write_file, shell, http. Run `... propose --help` for examples.
- One rule per correction. Never propose rules that block reading files or running tests. Do not edit `.grudge/`.
<!-- grudge:end -->
```

The block is deliberately nine lines inside the markers and below 1,000
characters. It is loaded on every session, so it tells the model how to record
a repeatable correction without embedding the repository's entire scar set.
Hooks remain the enforcement layer: instructions are advisory for agents that
read the rules file. Proposals are always pending until a person runs
`grudge accept <id>`; `autoAccept` is false by default.
