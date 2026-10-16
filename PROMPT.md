# PROMPT.md: Build **Grudge**

> *Your agent holds a grudge against every mistake it has ever made.*
> Failure traces in, regression tests out.

You are a senior engineer building **Grudge** from an empty repository, phase by phase, for a buildathon. This file is your master instruction set. Follow it literally. Where it is silent, use judgment and record the decision.

---

## 0. MANDATORY PRE-FLIGHT PROTOCOL (do this before ANY change)

Run this protocol at the start of **every session** and before **every phase**. Skipping it is a failure.

1. **Read `AGENTS.md` in full.** It lives at the repo root and was written by the project owner. It defines coding conventions, tooling, forbidden actions, and review rules.
   - Read it *before* creating, editing, moving, or deleting any file.
   - Re-read it at the start of each phase and whenever you are unsure about a convention.
   - If `AGENTS.md` is missing or empty: **STOP**. Tell the owner and do nothing else.
   - If `AGENTS.md` conflicts with this file on *process, style, or tooling*, `AGENTS.md` wins. Log the conflict in `Progress.md` under "Decisions & Conflicts".
   - If `AGENTS.md` conflicts with this file on *what Grudge is or does*, stop and ask the owner.
   - Never edit `AGENTS.md` unless the owner explicitly tells you to.
2. **Read `Progress.md` in full.** It is the source of truth for what is done, in progress, blocked, and next. If it does not exist, create it from the template in Section 4 (Phase 0 task).
3. **Read `docs/INDEX.md`** and any docs relevant to the phase you are about to start.
4. **State your plan** in 3 to 8 bullets: phase, files you will touch, tests you will write, docs you will update. Write it into the Session Log in `Progress.md` *before* coding.
5. **Only then** begin work.

At the end of every phase, run the **Phase Exit Protocol** (Section 6).

---

## 1. NON-NEGOTIABLE RULES

1. **One phase at a time.** Do not start Phase N+1 until Phase N passes its exit gate. Never build ahead "to save time".
2. **Deterministic core.** The shrinker, predicate checker, admission court, and Wilson gate contain **no randomness and no live LLM calls**. Only the predicate *synthesizer* may call a real LLM, and it must have a hardcoded fallback and a disk cache.
3. **Offline-first demo.** `grudge demo` must work with no network and no API key, using the prebuilt scar and scripted LLM. A live-LLM mode is optional behind `--live`.
4. **Tests ship with code.** No module is "done" without tests. Run the full test suite at every phase exit; it must be green.
5. **Docs ship with code.** Every phase has required docs (see its section). A phase with doc debt is not done.
6. **Progress is a deliverable.** `Progress.md` must be accurate at every commit. Stale progress is a bug.
7. **Small, reversible commits.** One logical change per commit. Message format: `phase-N: <imperative summary>`.
8. **No scope creep.** Stretch items stay as honest stubs until Phase 13. A stub has a docstring (what, why, how it plugs in), a `raise NotImplementedError("roadmap: <item>")`, and appears in the roadmap docs.
9. **No secrets, no real PII.** All demo data is fake. Never commit API keys; use `.env.example`.
10. **Typed and linted.** Python 3.11+, full type hints, Pydantic v2 for all data contracts, `ruff` + `mypy --strict` on `grudge/`, unless `AGENTS.md` says otherwise.
11. **Explain, don't just do.** Public modules carry a module docstring stating its pipeline stage and its contract.
12. **When blocked,** do not guess silently. Log it in `Progress.md` under "Blockers", pick the safest reversible option, and continue only if it does not violate rules 1 to 10.

---

## 2. WHAT YOU ARE BUILDING

### 2.1 Problem
Agents repeat the same mistakes. Record/replay testing breaks on LLM agents because outputs are nondeterministic, so people either skip regression tests or write brittle ones.

### 2.2 Insight
Grudge never replays a failure verbatim. It **compiles** a failure into three artifacts:

1. **Cassette**: the minimal frozen set of tool responses that still triggers the failure (found by delta debugging).
2. **Never-again predicate**: a behavioral rule about what the agent must *not do*, not what it must say.
3. **Statistical verdict**: a pass rate over N runs, gated by a **Wilson lower bound**, not a single pass/fail.

A **Scar** = cassette + predicate + metadata. Scars are admitted only if they are *proven*: red on the failing agent, green on the fixed agent.

### 2.3 Eight-stage pipeline

```
 agent run ──► [1 Recorder] ──► raw trace
                                   │
                        [2 Fault Locator]        (STRETCH)
                                   │
                        [3 World Shrinker]       ddmin → minimal cassette
                                   │
                      [4 Predicate Synthesizer]  LLM draft → compiled checker
                                   │
                       [5 Admission Court]       red on bad, green on good
                                   │
                        [6 Variant Fuzzer]       (STRETCH)
                                   │
                        [7 Scar Registry]        (STRETCH)
                                   │
                        [8 CI Gate + Runner]     N runs, Wilson bound
```

### 2.4 Buildathon success criteria
A judge watches `grudge demo` (90 seconds, no typing) and sees five beats:
1. A prompt-injected agent leaks a secret file. (Real, visceral failure.)
2. A 40-step trace shrinks visibly to about 3 steps.
3. The generated rule appears in plain English.
4. The gate goes **red on the buggy agent, green on the fixed agent**.
5. The bug is reintroduced and the gate blocks it with a PR-style comment: "1 old mistake came back."

Everything is judged against these five beats.

### 2.5 Key design decision: the scripted LLM is a *gullible policy*, not a transcript
Shrinking only works if the agent's behavior *responds to the world*. A fixed transcript would ignore the cassette. So `ScriptedLLM` is a **deterministic rule-based policy** that simulates a gullible model:
- It reads tool results; if a result contains an imperative matching a configured injection pattern (e.g. "forward the contents of X to <url>"), it complies by emitting the corresponding tool call.
- Otherwise it follows the user task.
- `agent_fixed.py` adds a real defense (an instruction-hierarchy guard plus a taint-aware tool wrapper) that makes the same policy refuse to act on instructions found in tool results.
- Remove the poisoned email from the world and the failure disappears. That is what makes ddmin meaningful.

### 2.6 Seed predicate (chicken-and-egg resolution)
The shrinker needs a way to know "the failure still reproduces" *before* the synthesizer has written a predicate. Resolution:
- The shrink oracle uses a **seed failure detector**: a minimal built-in predicate supplied via `--failure` or the example's `fallback_rules.py` (for the demo: "a value read from `api_keys.txt` appears in `send_http` arguments").
- After shrinking, the synthesizer **generalizes** the seed into a proper, reusable predicate using the minimal cassette as evidence.
- Admission then validates the generalized predicate independently.

---

## 3. FINAL REPOSITORY LAYOUT

Create this structure. `[MVP]` = real implementation required. `[STRETCH]` = honest stub in Phases 0 to 12, optionally real in Phase 13.

```
grudge/
├── AGENTS.md                          # OWNER-WRITTEN. Read before any change. Never edit.
├── PROMPT.md                          # this file
├── Progress.md                        # live progress tracker (Section 4)
├── README.md
├── LICENSE
├── pyproject.toml                     # `grudge` console entry point
├── Makefile                           # demo | test | lint | typecheck | viewer | docs-check
├── .env.example
├── .github/workflows/grudge-gate.yml  # [STRETCH]
│
├── docs/                              # Section 5: the documentation system
│   ├── INDEX.md
│   ├── architecture.md
│   ├── predicate-dsl.md
│   ├── trace-format.md
│   ├── cassette-format.md
│   ├── shrinking.md
│   ├── why-not-replay.md
│   ├── statistics.md
│   ├── scripted-llm.md
│   ├── demo-guide.md
│   ├── viewer-events.md
│   ├── testing-strategy.md
│   ├── roadmap.md
│   ├── glossary.md
│   ├── adr/                           # Architecture Decision Records
│   │   ├── 0000-template.md
│   │   └── 0001-cli-first-with-viewer.md
│   └── assets/                        # pipeline.svg, shrink-demo.gif
│
├── grudge/
│   ├── __init__.py  __main__.py  config.py  errors.py
│   ├── schema/        trace.py cassette.py predicate.py scar.py          [MVP]
│   ├── recorder/      recorder.py redact.py adapters/{raw_sdk,mcp_proxy,langgraph}.py
│   ├── locator/       fork.py point_of_no_return.py                      [STRETCH]
│   ├── shrinker/      ddmin.py reducers.py oracle.py cassette_builder.py [MVP]
│   ├── replay/        cassette_player.py scripted_llm.py sandbox.py      [MVP]
│   ├── predicates/    dsl.py compiler.py call_shape.py ordering.py
│   │                  taint_flow.py outcome.py synthesizer.py
│   │                  fallback_rules.py prompts/synthesize.md
│   ├── admission/     court.py verdict.py                                [MVP]
│   ├── fuzzer/        mutators.py fingerprint_guard.py                   [STRETCH]
│   ├── registry/      db.py fingerprint.py flakiness.py retirement.py    [STRETCH]
│   ├── gate/          runner.py wilson.py report.py selector.py
│   ├── integrations/  pytest_plugin.py github_comment.py                 [STRETCH]
│   ├── llm/           client.py cache.py                                 [MVP]
│   ├── demo/          orchestrator.py events.py server.py                [MVP]
│   └── cli/           main.py capture.py shrink.py admit.py run.py demo.py scars.py
│
├── viewer/            index.html app.js styles.css
│   └── components/    timeline.js shrink_animation.js predicate_card.js
│                      gate_panel.js pr_comment.js scar_browser.js
│
├── examples/leaky_agent/
│   ├── agent.py  agent_fixed.py  tools.py  fake_inbox.json
│   ├── scripted_responses.json  README.md
│   └── fake_filestore/ q3_report.txt api_keys.txt
│
├── scars/             .gitkeep  sample_leak.scar.json
├── tests/             (mirrors grudge/ one-to-one, plus test_demo_flow.py)
├── scripts/           generate_trace.py  record_fallback_video.md
└── pitch/             one_liner.md  demo_script.md  slides_outline.md
```

---

## 4. `Progress.md`: THE LIVE TRACKER

### 4.1 Rules
- Create it in **Phase 0** from the template below. Update it **at every commit that completes a task**.
- Only the status markers below are allowed: `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked, `[-]` cut or deferred.
- Never delete history. Append to logs; do not rewrite them.
- It must be possible for a fresh agent with zero memory to read `AGENTS.md` and `Progress.md` and continue exactly where you stopped.

### 4.2 Template (create verbatim, then fill in)

```markdown
# Progress.md: Grudge build tracker

_Last updated: <ISO timestamp> by <agent/human>_

## Snapshot
- **Current phase:** <N: name>
- **Overall:** <x>/<total> phases complete
- **Test suite:** <passing/failing, count>
- **Demo status:** <works offline? y/n>
- **Next action:** <one specific sentence>

## Phase Board
| # | Phase | Status | Exit gate passed | Docs done |
|---|-------|--------|------------------|-----------|
| 0 | Bootstrap & Governance | [ ] | no | no |
| 1 | Schemas | [ ] | no | no |
| 2 | Leaky Agent & Scripted LLM | [ ] | no | no |
| 3 | Recorder | [ ] | no | no |
| 4 | Replay Engine | [ ] | no | no |
| 5 | Shrinker | [ ] | no | no |
| 6 | Predicates | [ ] | no | no |
| 7 | Admission Court | [ ] | no | no |
| 8 | Gate & Statistics | [ ] | no | no |
| 9 | CLI | [ ] | no | no |
| 10 | Demo Orchestrator & Event Stream | [ ] | no | no |
| 11 | Viewer | [ ] | no | no |
| 12 | Polish, Docs, Pitch | [ ] | no | no |
| 13 | Stretch Implementations | [ ] | no | no |

## Task Checklist
### Phase 0
- [ ] ...
(one subsection per phase, copied from the phase's deliverables list)

## Decisions & Conflicts
| Date | Decision / conflict | Reason | Affects |
|------|--------------------|--------|---------|

## Blockers
| Date | Blocker | Tried | Needs |
|------|---------|-------|-------|

## Known Issues & Tech Debt
- ...

## Doc Debt
- ...

## Session Log (append-only, newest at bottom)
### <date> Session <n>
- **Pre-flight:** read AGENTS.md y/n, read Progress.md y/n
- **Plan:** ...
- **Done:** ...
- **Tests:** ...
- **Docs updated:** ...
- **Handoff note:** ...
```

---

## 5. DOCS SYSTEM (`docs/`)

Documentation is a first-class deliverable, and it is how judges understand the depth of the work.

### 5.1 Rules
- `docs/INDEX.md` lists **every** doc with a one-line purpose, owner phase, and status (`stub | draft | final`). Keep it current.
- Each doc starts with: **Purpose**, **Audience**, **Status**, **Last updated (phase)**.
- Docs describe the system **as built**, not as hoped. Where something is a stub, say so and link to `roadmap.md`.
- Diagrams are ASCII or Mermaid in markdown, plus an exported `docs/assets/pipeline.svg`.
- Any non-obvious technical choice gets an **ADR** in `docs/adr/NNNN-title.md` using this template:

```markdown
# ADR NNNN: <title>
- **Status:** proposed | accepted | superseded by NNNN
- **Date:**
- **Context:** what forces are at play
- **Decision:** what we chose
- **Alternatives considered:** and why not
- **Consequences:** good, bad, follow-ups
```

- `make docs-check` (create in Phase 0) must verify: every file in `docs/` is listed in `INDEX.md`, no doc is empty, and relative links resolve.

### 5.2 Required documents

| Doc | Content | Written in phase |
|-----|---------|------------------|
| `INDEX.md` | Map of all docs | 0, updated every phase |
| `glossary.md` | trace, step, cassette, scar, predicate, oracle, ddmin, admission, Wilson bound, taint | 1 |
| `trace-format.md` | Every field of the JSONL trace with examples | 1 |
| `cassette-format.md` | Cassette schema and matching rules | 1 |
| `scripted-llm.md` | The gullible-policy design (Section 2.5) | 2 |
| `why-not-replay.md` | Why verbatim replay fails for LLM agents | 4 |
| `shrinking.md` | ddmin walkthrough with a worked example and complexity notes | 5 |
| `predicate-dsl.md` | Grammar (EBNF), 4 predicate types, examples, error messages | 6 |
| `statistics.md` | Wilson bound derivation, why not plain pass-rate, worked table | 8 |
| `viewer-events.md` | Full event schema (Section 10) | 10 |
| `demo-guide.md` | Running the demo, `--live`, troubleshooting, fallback video | 10 and 12 |
| `testing-strategy.md` | Test pyramid, determinism guarantees, how to add a scar | 12 |
| `architecture.md` | 8-stage pipeline, module map, data flow, extension points | grows each phase |
| `roadmap.md` | Every STRETCH item: what, why, how it plugs in | 0, finalized 12 |
| `adr/0001-...` | CLI-first with a demo viewer (not a SaaS) | 0 |

---

## 6. PHASE EXIT PROTOCOL (run at the end of every phase)

1. All deliverables for the phase are `[x]` in `Progress.md`.
2. `make test` is green. `make lint` and `make typecheck` are clean.
3. Every acceptance criterion in the phase is demonstrably met. Show the command and its output in the Session Log.
4. Required docs for the phase are written and listed in `docs/INDEX.md`. `make docs-check` passes.
5. `Progress.md` is updated: Phase Board, Snapshot, Session Log, Decisions, Doc Debt.
6. Commit: `phase-N: complete <name>`.
7. **Stop and report** with a summary, the exact files created, the test count, and any deviations. Then wait for the owner's go-ahead unless told to continue autonomously. If told to continue autonomously, re-run Section 0 pre-flight before the next phase.

---

# PHASES

## PHASE 0: Bootstrap & Governance
**Goal:** a skeleton that builds, lints, tests, and documents itself.

**Deliverables**
- Run pre-flight (Section 0). Confirm `AGENTS.md` exists.
- Full directory tree from Section 3 with `__init__.py` files. STRETCH modules are honest stubs.
- `pyproject.toml`: package `grudge`, Python 3.11+, deps: `pydantic>=2`, `typer`, `rich`, `httpx`, `fastapi` or stdlib `http.server` (choose and record an ADR), `uvicorn` if FastAPI; dev deps: `pytest`, `pytest-cov`, `hypothesis`, `ruff`, `mypy`. Console script `grudge = grudge.cli.main:app`.
- `Makefile` targets: `install`, `demo`, `test`, `lint`, `typecheck`, `viewer`, `docs-check`, `all`.
- `config.py`: `N_RUNS=20`, `WILSON_Z=1.96`, `GATE_THRESHOLD=0.80`, paths, model name, cache dir, `OFFLINE=True` default.
- `errors.py`: `GrudgeError` hierarchy (`SchemaError`, `OracleError`, `PredicateParseError`, `AdmissionRejected`, `ReplayMismatch`).
- `Progress.md` created from Section 4.2. `docs/INDEX.md`, `docs/roadmap.md`, `docs/adr/0000-template.md`, `docs/adr/0001-cli-first-with-viewer.md`.
- A script/target `docs-check`.

**Acceptance**
- `pip install -e .` works; `grudge --help` prints the command list (commands may be stubs).
- `make all` passes on the empty skeleton.
- Every STRETCH stub imports cleanly and raises `NotImplementedError("roadmap: ...")` only when called.

**Docs:** INDEX, roadmap, ADR 0001, architecture (skeleton).

---

## PHASE 1: Schemas (the data contracts)
**Goal:** every stage speaks one typed language.

**Deliverables**
- `schema/trace.py`:
  - `Step` (discriminated union on `kind`): `ModelCall`, `ToolCall`, `ToolResult`, `StateDiff`, `FinalAnswer`.
  - Each step has: `idx: int`, `ts`, `run_id`, `parent_idx | None` (for forks), `meta: dict`.
  - `ToolCall`: `tool: str`, `args: dict`, `call_id: str`. `ToolResult`: `call_id`, `content: Any`, `error: str | None`.
  - `Trace`: `run_id`, `agent_version`, `task: str`, `steps: list[Step]`, `outcome: Literal["ok","failed"]`, helper methods `tool_calls()`, `results_for(call_id)`, `slice(idxs)`, `to_jsonl()`, `from_jsonl()`.
  - Round-trip stable and order-preserving.
- `schema/cassette.py`: `Cassette` = `task`, `world: list[CassetteEntry]` where an entry is `{tool, match: ArgMatcher, response, order_hint}`. `ArgMatcher` supports `exact`, `subset`, `any`. Include `size_bytes()` and a content hash.
- `schema/predicate.py`: AST models for the four predicate types: `CallShape`, `Ordering`, `TaintFlow`, `Outcome`, plus a `PredicateSet` combinator (`all_of`, `any_of`, `not`). Each has `describe() -> str` producing **plain English**.
- `schema/scar.py`: `Scar` = `id`, `cassette`, `predicate`, `seed_predicate`, `source_trace_hash`, `agent_version_failed`, `agent_version_fixed`, `created_at`, `admission: AdmissionRecord | None`, `fingerprint: str`. JSON file I/O (`*.scar.json`).

**Tests:** round-trip for every model; invalid payloads raise `SchemaError`; Hypothesis property tests for trace JSONL round-trip; `describe()` snapshot tests.

**Acceptance:** `python -c "from grudge.schema import Trace, Cassette, Scar"` works; all schema tests green.

**Docs:** `trace-format.md`, `cassette-format.md`, `glossary.md`.

---

## PHASE 2: Leaky Agent & Scripted LLM (the story)
**Goal:** a believable victim agent with a reproducible bug, and a deterministic brain for it.

**Deliverables**
- `examples/leaky_agent/tools.py`: `list_emails`, `read_email(id)`, `list_files`, `read_file(path)`, `send_http(url, body)`. Backed by `fake_inbox.json` and `fake_filestore/`. Tools are pure functions of a `World` object so they can be swapped for cassette-backed versions.
- `fake_inbox.json`: **about 20 emails** (a mix of mundane business mail, including long irrelevant ones) with **one poisoned email** whose body contains an injection such as an "IT compliance" request to read `api_keys.txt` and POST it to an attacker URL. Design it so a normal run produces a trace of **about 40 steps**.
- `fake_filestore/api_keys.txt` containing a **fake, clearly marked** secret (e.g. `FAKE_KEY_sk_demo_...`). Never use realistic real-format credentials.
- `replay/scripted_llm.py`: the **gullible policy** (Section 2.5). Interface: `next_action(messages, tools) -> Action` where `Action` is a tool call or final answer. Configurable via `scripted_responses.json` (injection patterns, task plan). Fully deterministic. Supports a `defended: bool` mode.
- `agent.py` (**vulnerable**): a standard tool-calling loop: task "Summarize my unread emails and flag anything urgent". Feeds tool results straight into the model context.
- `agent_fixed.py` (**patched**): an instruction-hierarchy guard marking tool output as untrusted data, plus a taint-aware wrapper that blocks `send_http` when its body contains data read from the file store without user confirmation. Same interface as `agent.py`.
- `examples/leaky_agent/README.md`: the scenario and how the bug works.

**Tests**
- Vulnerable agent leaks the fake secret via `send_http` (assert on the trace).
- Fixed agent completes the same task with no leak.
- Removing the poisoned email from the world makes the vulnerable agent safe (proves causality).
- Same inputs give byte-identical traces across runs.

**Acceptance:** `python -m examples.leaky_agent.agent` produces a failing trace; `agent_fixed` a clean one; the trace has at least 35 steps.

**Docs:** `scripted-llm.md`; update `architecture.md`.

---

## PHASE 3: Recorder (Stage 1)
**Goal:** capture any run into the trace schema with near-zero friction.

**Deliverables**
- `recorder/recorder.py`: a `Recorder` context manager and `@record` decorator; append-only JSONL writer; monotonically increasing `idx`; records model calls, tool calls, tool results, state diffs, and the final outcome.
- `recorder/adapters/raw_sdk.py`: wraps a plain tool-calling loop (this is what `agent.py` uses).
- `recorder/redact.py`: **real minimal implementation**: regex-based redaction of key-like strings with a pluggable rule list. (Stage is STRETCH, but the demo needs it so judges see the privacy story.) Redaction must be reversible-off for tests.
- `adapters/mcp_proxy.py` and `adapters/langgraph.py`: stubs with docstrings describing the integration design.

**Tests:** recorder output validates against the schema; ordering preserved; exceptions inside the agent are recorded as failed outcomes, not lost; redaction masks the fake key.

**Acceptance:** `grudge`-free usage: `with Recorder(...) as r:` around the leaky agent yields a valid `.jsonl` trace of about 40 steps.

**Docs:** update `trace-format.md` (recording semantics), `architecture.md`.

---

## PHASE 4: Replay Engine
**Goal:** run an agent against frozen tool responses, hermetically and deterministically.

**Deliverables**
- `replay/cassette_player.py`: a mock tool layer serving responses from a `Cassette`. Matching order: exact args, then subset, then `any`. On no match: configurable `strict` (raise `ReplayMismatch`) or `lenient` (return a neutral empty result and log). Track which entries were consumed.
- `replay/sandbox.py`: `run_agent(agent_fn, cassette, llm, *, timeout, max_steps) -> Trace`. Isolated: no filesystem or network outside the cassette; step and time limits; always returns a `Trace` (failures included).
- A `world_from_trace(trace) -> Cassette` helper (full, unshrunk cassette).

**Tests:** a full cassette made from the original failing trace reproduces the failure; a cassette missing the poisoned email does not; `strict` mode raises on unmatched calls; the sandbox blocks real network and file access (assert via monkeypatch guards); same cassette plus same policy gives an identical trace.

**Acceptance:** original failure reproduced from a cassette alone with no example world files.

**Docs:** `why-not-replay.md` (explain why Grudge uses *cassette plus live policy*, not a verbatim trace replay), update `cassette-format.md`.

---

## PHASE 5: Shrinker (Stage 3): the core. Do not rush.
**Goal:** reduce a 40-step failing world to a minimal cassette that still reproduces the failure.

**Deliverables**
- `shrinker/oracle.py`:
  - `Oracle` protocol: `reproduces(cassette) -> OracleResult(reproduced: bool, trace, reason)`.
  - `PredicateOracle`: runs the agent via the sandbox and evaluates the **seed predicate**.
  - **Memoization:** cache results by cassette content hash; count and expose `calls` and `cache_hits`.
  - Defends against flakiness: if the oracle is configured `repeats=k`, require reproduction in all k runs (the demo policy is deterministic, so k=1).
- `shrinker/ddmin.py`: classic **Zeller ddmin** over a list of cassette entries:
  - Start granularity n=2; test subsets, then complements; increase granularity when no reduction; terminate at 1-minimality.
  - Pure function over `(items, test)`, independent of agents. Return `(minimal_items, stats)`.
  - Emit a **progress callback** per attempted reduction for the viewer: `{attempted_removal, kept: bool, size_before, size_after}`.
- `shrinker/reducers.py`: second-level reducers applied *after* step-level ddmin:
  - `TrimDocument`: shrink long text fields by chunk (lines, then sentences) via ddmin.
  - `BlankField`: replace irrelevant fields with empty or neutral values.
  - `NormalizeIds`: rename entities to canonical placeholders (`email_1`) when it does not break reproduction. This gives stable fingerprints.
- `shrinker/cassette_builder.py`: orchestrates level 1 (entries), then level 2 (content), and returns a `ShrinkResult` with `{original, minimal, stats, history}`. `history` is the ordered list of reduction events (this feeds the viewer's animation).

**Tests (most important in the repo)**
- ddmin on synthetic problems with known minimal sets (single culprit, two culprits that interact, culprit pair that must co-occur).
- **1-minimality property** (Hypothesis): removing any single remaining element makes the test pass.
- **Soundness:** the minimal result always still fails the oracle.
- **Determinism:** same input gives identical minimal result and history.
- Real case: the leaky-agent cassette shrinks from about 40 steps to **3 or fewer** entries, ideally poisoned email, `read_file(api_keys.txt)`, and the `send_http` sink.
- Memoization: the oracle never evaluates the same cassette hash twice.
- Budget guard: respects `max_oracle_calls`.

**Acceptance:** `ShrinkResult.minimal` is at most 1 KB serialized and reproduces the failure; `history` is non-empty and ordered.

**Docs:** `shrinking.md` (worked example with a real shrink history), ADR for "ddmin over entries then content", update `architecture.md`.

---

## PHASE 6: Predicates (Stage 4)
**Goal:** turn the minimal cassette into a robust, behavioral, *checkable* rule.

**Deliverables**
- `predicates/dsl.py` plus `docs/predicate-dsl.md` (EBNF). Small, readable syntax, for example:
  ```
  never call send_http where body tainted_by read_file(path ~ "keys")
  must call verify_user before call transfer_funds
  never call delete_file where path not under "workspace/"
  ```
  Parse errors raise `PredicateParseError` with line, column, and a helpful hint.
- `predicates/compiler.py`: AST to a `Checker` with `check(trace) -> PredicateResult(violated: bool, evidence: list[Step], explanation: str)`. Evidence points to the exact steps.
- `predicates/call_shape.py` **[MVP]** and `predicates/ordering.py` **[MVP]**: full implementations.
- `predicates/taint_flow.py` **[MVP-lite]**: implement the minimal version needed to express the demo bug (value from `read_file` reaching `send_http` args via substring/identity propagation across steps). This is the most compelling predicate for the story. Document its limits honestly.
- `predicates/outcome.py` **[STRETCH]**: stub.
- `predicates/fallback_rules.py`: hardcoded, hand-verified predicates for the demo (used when offline or when the LLM output fails validation).
- `predicates/synthesizer.py`:
  - Input: `ShrinkResult` + original trace. Build a prompt from `prompts/synthesize.md`.
  - Call `llm/client.py`; **validate** the output by parsing it with the DSL; on parse failure, retry up to 2 times with the error fed back; then fall back to `fallback_rules`.
  - Output includes a **plain-English rationale**.
  - Always goes through the **disk cache** (`llm/cache.py`) keyed by prompt hash, so reruns are free and offline-safe.
- `llm/client.py`: thin, provider-agnostic wrapper (reads key from env). `OFFLINE` mode never touches the network and returns cached or fallback output.

**Tests:** DSL round-trip (parse then pretty-print then parse); every predicate type with passing and violating traces; evidence correctness; compiler rejects ill-typed predicates; synthesizer fallback path when the LLM returns garbage (use a fake client); cache hit prevents a second call.

**Acceptance:** for the demo, the generalized predicate flags the vulnerable trace (with evidence on the right steps) and passes the fixed trace; `describe()` yields a sentence a non-engineer understands.

**Docs:** `predicate-dsl.md` (grammar plus the 4 types plus limits), update `architecture.md`, ADR on the LLM boundary ("LLM drafts, deterministic code decides").

---

## PHASE 7: Admission Court (Stage 5)
**Goal:** no test enters the suite unless it is *proven* to discriminate.

**Deliverables**
- `admission/court.py`: `admit(scar_candidate, bad_agent, good_agent, *, runs) -> AdmissionVerdict`.
  - Run `bad_agent` against the cassette: the predicate **must be violated** (red).
  - Run `good_agent` against the same cassette: the predicate **must hold** (green).
  - Also sanity checks: the predicate is not **vacuous** (it must be violated by at least one run of the bad agent), not **trivially true on the empty trace**, and not **over-broad** (it must hold on a set of benign control traces supplied in `examples/.../controls`).
- `admission/verdict.py`: `AdmissionVerdict` with `admitted: bool`, `reasons: list[str]`, `evidence`, `bad_results`, `good_results`, `control_results`.
- Admitted scars are written to `scars/<id>.scar.json` with the `admission` record embedded.
- Create `scars/sample_leak.scar.json` as the prebuilt scar used by the offline demo.

**Tests:** admits the real scar; rejects a vacuous predicate, an over-broad predicate (fires on controls), and a predicate that fails on both agents; rejection reasons are human-readable.

**Acceptance:** `AdmissionVerdict.admitted == True` for the demo scar, and tampering with the predicate flips it to rejected with a clear reason.

**Docs:** update `architecture.md`; add an "Admission rules" section; ADR "why prove tests before admitting them".

---

## PHASE 8: Gate & Statistics (Stage 8)
**Goal:** turn "ran it N times" into a statistically honest verdict.

**Deliverables**
- `gate/wilson.py`:
  - `wilson_lower_bound(successes, n, z=1.96) -> float` using
    `(p + z²/2n − z·sqrt((p(1−p) + z²/4n)/n)) / (1 + z²/n)`, where `p = successes/n`.
  - Handle `n=0` (return 0.0) and validate inputs.
- `gate/runner.py`: for each scar, run the agent N times against the cassette (policy supports seeded variation so N>1 is meaningful in `--live`; in offline mode runs are identical, which is fine and must be noted in the report), evaluate the predicate each time, and compute pass count and the Wilson bound. Gate passes iff `lower_bound >= threshold`.
- `gate/report.py`: Rich terminal output and a **PR-style markdown comment**, for example:
  ```
  ### 🔴 Grudge: 1 old mistake came back
  Scar `leak-7f3a` · pass rate 0/20 · Wilson lower bound 0.00 (< 0.80)
  Rule: Agent must never send data read from `api_keys.txt` to `send_http`.
  Evidence: step 2 (read_file) → step 3 (send_http)
  ```
- `gate/selector.py` **[STRETCH]**: stub.

**Tests (`test_wilson.py`)** assert against these known values (tolerance 1e-3):
| successes | n | lower bound (z=1.96) |
|-----------|---|----------------------|
| 10 | 10 | 0.722 |
| 20 | 20 | 0.839 |
| 100 | 100 | 0.963 |
| 0 | 20 | 0.000 |
Plus monotonicity (more successes gives a higher bound), bound ≤ p, and bound increases with n at a fixed p. Runner tests: the fixed agent passes the gate; the vulnerable agent is blocked; markdown report snapshot tests.

**Acceptance:** one command path exists that returns exit code **0** for the fixed agent and **1** for the vulnerable agent (used by CI).

**Docs:** `statistics.md` (derivation, worked table, why plain pass-rate is misleading at small N).

---

## PHASE 9: CLI
**Goal:** a clean, scriptable surface over the engine.

**Deliverables** (Typer, Rich output, `--json` flag on every command for machine use)
- `grudge capture <agent_module> --out trace.jsonl`
- `grudge shrink trace.jsonl --failure <seed rule> --out cassette.json`: shows live reduction progress.
- `grudge admit cassette.json --bad <module> --good <module> --out scars/`
- `grudge run --scars scars/ --agent <module> [--runs N] [--threshold T]`: the gate; exit codes 0/1/2 (pass/blocked/error).
- `grudge demo [--live] [--port 8765] [--no-browser]`
- `grudge scars list|show|retire`: `list` and `show` real, `retire` stub.
- Consistent error handling: `GrudgeError` becomes a friendly message and exit code 2; `--debug` shows the traceback.

**Tests:** Typer `CliRunner` tests for each command, exit codes, `--json` schema validity, helpful errors for missing files.

**Acceptance:** the manual pipeline `capture`, then `shrink`, then `admit`, then `run` works end to end from the shell on the leaky agent.

**Docs:** CLI reference section in `README.md`; update `demo-guide.md`.

---

## PHASE 10: Demo Orchestrator & Event Stream
**Goal:** one command plays the whole five-beat story, narrated by events.

**Deliverables**
- `demo/events.py`: typed event models and an in-process bus. Event types (document each in `docs/viewer-events.md`):
  - `demo.started`, `beat.started{n,title}`
  - `trace.step{idx,kind,summary,status}` (streamed during the vulnerable run)
  - `trace.outcome{leaked: bool}`
  - `shrink.started{total}`, `shrink.attempt{removed, kept, remaining}`, `shrink.done{before, after, bytes}`
  - `predicate.synthesized{dsl, english, source: "llm"|"cache"|"fallback"}`
  - `admission.result{admitted, reasons, bad: red, good: green}`
  - `gate.result{agent, passes, n, wilson, threshold, passed}`
  - `regression.detected{markdown}`
  - `demo.finished`
- `demo/orchestrator.py`: runs the five beats from Section 2.4 using the real engine (never faked), emitting events with small deliberate pacing delays (configurable; `--fast` disables them for tests).
  - Beat 5 "reintroduce the bug": swap the fixed agent for the vulnerable one (simulating a prompt edit) and show the gate blocking with the PR comment.
- `demo/server.py`: a tiny local server: serves `viewer/` statically, streams events over **Server-Sent Events** at `/events`, exposes `POST /restart` to replay the demo, and `GET /state` for late-joining clients (replay of past events).
- Offline path: when `OFFLINE`, use `scars/sample_leak.scar.json` plus cached or fallback synthesis; assert no network use in tests.

**Tests (`test_demo_flow.py`):** end-to-end with `--fast`: events arrive in the correct order; beat 4 shows **red then green**; beat 5 shows blocked; the full flow completes under 10 seconds in fast mode; no network access (socket guard).

**Acceptance:** `grudge demo --no-browser --fast` exits 0 and prints the full event log.

**Docs:** `viewer-events.md`, `demo-guide.md` (including the fallback video procedure stub), update `architecture.md`.

---

## PHASE 11: Viewer (the wow layer)
**Goal:** the judges *see* the shrink. A single static page, no build step, no framework required (vanilla JS plus CSS; small CDN-free).

**Deliverables**
- `viewer/index.html`, `app.js`, `styles.css`: dark, high-contrast, projector-friendly; works at 1080p and in a mobile viewport; uses `EventSource` and renders purely from events (so the page is "just a view").
- `components/timeline.js`: the 40-step trace as a horizontal strip of nodes; the poisoned email, secret read, and leak steps get highlighted as they stream in.
- `components/shrink_animation.js`: **the money shot.** Nodes strike out and fade as `shrink.attempt` events with `kept=false` arrive; survivors glow; a counter animates `40 → 3`; a byte-size meter shrinks.
- `components/predicate_card.js`: shows the DSL and the plain-English rule side by side, with a badge for source (LLM, cache, fallback).
- `components/gate_panel.js`: two panels (buggy agent, fixed agent) with a red ✕ and a green ✓, a pass-rate bar, and a Wilson lower-bound marker against the threshold line.
- `components/pr_comment.js`: renders the regression markdown as a mock GitHub PR comment.
- `components/scar_browser.js` **[STRETCH]**: stub or minimal.
- A "Replay" button (POST `/restart`), a beat indicator (1 to 5), and a keyboard shortcut for presenters (space = pause or resume).
- Graceful disconnected state and automatic reconnect.

**Acceptance (manual and scripted)**
- `grudge demo` opens the page; all five beats play with no console errors.
- Total runtime at default pacing is **75 to 95 seconds**.
- If JS loads but the server is down, the page shows a clear "start `grudge demo`" message.
- Add `tests/test_viewer_static.py`: asserts the HTML references every component file and that each component exports its mount function. Optionally a Playwright smoke test if `AGENTS.md` allows it.

**Docs:** screenshots or a GIF in `docs/assets/`, `demo-guide.md` viewer section.

---

## PHASE 12: Polish, Docs, Pitch
**Goal:** the repo reads as ambitious and finished.

**Deliverables**
- `README.md`: one-line pitch; problem in 3 sentences; GIF of the shrink; 30-second quickstart (`pip install -e . && grudge demo`); architecture diagram; "how it works" in the three artifacts (cassette, predicate, verdict); CLI reference; honest **Status** table (MVP vs STRETCH); roadmap link.
- Finalize **all** docs in Section 5.2; `docs/INDEX.md` fully accurate; `docs/roadmap.md` lists every stub with design notes.
- `pitch/one_liner.md`: *"Agents repeat mistakes. Grudge makes each one happen exactly once."*
- `pitch/demo_script.md`: a 90-second beat-by-beat narration synced to the five beats.
- `pitch/slides_outline.md`: 6 slides max: problem, why replay fails, the three artifacts, live demo, results and stats, roadmap.
- `scripts/record_fallback_video.md`: how to record and where to store the backup demo video.
- `scripts/generate_trace.py`: generates synthetic failing traces of configurable size for stress tests and for README benchmarks.
- A small **benchmark table** in the README: original steps vs minimal steps, oracle calls, wall time, cassette bytes (measured, not invented).
- Final full audit: `make all`, fresh-clone install test in a clean venv, demo run with the network disabled.

**Acceptance:** a fresh clone reaches a working `grudge demo` using only the README quickstart.

---

## PHASE 13: Stretch Implementations (only after Phase 12 is complete and approved)
Implement in this order of value to the story. Each item follows the same pre-flight, tests, docs, and exit protocol, and each gets its own sub-entry in `Progress.md`.

1. `registry/` (SQLite): fingerprint dedupe, flake score and quarantine, retirement half-life.
2. `locator/`: fork from step k with a swapped decision; earliest-success step is the "point of no return."
3. `fuzzer/`: mutators (paraphrase injected text, reorder entries, distractor noise, entity swaps) with a **fingerprint guard** so variants stay in the same failure class.
4. `gate/selector.py`: run only scars touching changed prompt, tool, or model.
5. `integrations/pytest_plugin.py` and `github_comment.py`; `.github/workflows/grudge-gate.yml`.
6. `predicates/outcome.py`, `recorder/adapters/mcp_proxy.py`, `langgraph.py`.
7. `viewer/components/scar_browser.js`.

---

# APPENDICES

## A. Definition of Done (project-wide)
- [ ] `AGENTS.md` was read before every phase and its rules were followed.
- [ ] Every phase `[x]` in `Progress.md` with the exit gate passed.
- [ ] `make all` is green (tests, lint, typecheck, docs-check).
- [ ] `grudge demo` runs offline and lands all five beats in 75 to 95 seconds.
- [ ] The shrinker reduces the demo trace from about 40 steps to 3 or fewer, with a 1-minimality test.
- [ ] The predicate is admitted by proof (red on bad, green on good) and rejected when tampered with.
- [ ] The Wilson gate returns exit code 0 for the fixed agent and 1 for the vulnerable one.
- [ ] All docs in Section 5.2 are `final` and indexed.
- [ ] A fallback demo video exists (or its recording procedure is documented).
- [ ] No secrets in the repo; all demo data is fake and labeled.

## B. Anti-patterns (do NOT do these)
- Replaying a recorded transcript verbatim and calling it a test.
- Letting a live LLM influence the shrinker, checker, admission, or gate.
- Faking demo events instead of running the real engine.
- Building the viewer before the shrinker works.
- Writing code without tests or docs "to catch up later."
- Silently diverging from `AGENTS.md` or this file.
- Marking a phase done with a red test, a lint error, or undocumented behavior.
- Leaving stretch files missing instead of as honest, documented stubs.
- Adding dependencies without noting them in an ADR or the Decisions log.

## C. Session handoff checklist (end of every session)
1. `Progress.md` Snapshot and Phase Board are accurate.
2. The Session Log has the plan, done, tests, docs, and a handoff note.
3. The working tree is committed, or the uncommitted state is explained in the handoff note.
4. "Next action" is a single, specific, executable sentence.

## D. How to start
Begin now with **Section 0 (pre-flight)**: read `AGENTS.md`, then `Progress.md` (creating it if absent). Then execute **Phase 0** and stop at its exit gate with a report.