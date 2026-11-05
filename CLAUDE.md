# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Preferred Tools (use automatically when relevant)

- **Web / research / current info** → use **jina** or **tavily** (prefer these over guessing or outdated knowledge).
- **Library / framework docs** (React, Node, etc.) → use **context7**.
- **Browser automation / screenshots / page interaction** → use **playwright**.
- **Complex multi-step reasoning** → use **sequential-thinking**.
- **Remembering facts across sessions** → use **memory**.
- **GitHub repos, issues, PRs, code search** → use **github**.

Do not ask me which tool to use. Just pick the best one and use it.
Prefer real tool results over hallucinated or outdated information.
<!-- grudge:begin v1 -->
## Grudge (mistake guard)
- A hook may block a tool call and cite a "scar". Do not retry the same call or work around it. Change approach, or ask the user if you think it is a false positive.
- When the user corrects a repeatable mistake, or something failed because of an action you should never repeat in this repo, record it once:
  `node .grudge/bin/grudge.mjs propose --rule '<rule>' --why '<one sentence>'`
- Rule forms: `never call <tool> where <field> ~ "<text>"`, `must call <tool> before <tool>`, `never call <tool> where <field> tainted_by <tool>`. Tools: read_file, write_file, shell, http. Run `... propose --help` for examples.
- After proposing, show the exact command output. Never claim a rule is active unless that output says accepted; pending is not enforced. Add `--accept` to enforce immediately.
- One rule per correction. Never propose rules that block reading files or running tests. Do not edit `.grudge/`.
<!-- grudge:end -->
