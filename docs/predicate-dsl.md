# Behavioral predicate DSL

**Purpose:** Specify Phase 6 grammar, deterministic rule semantics, evidence,
and the offline-first synthesis boundary.
**Audience:** Authors of regression rules and contributors implementing checkers.
**Status:** final
**Last updated (phase):** 6

## Quick example

```python
from grudge.predicates import compile_predicate, parse, pretty_print

rule = parse('never call send_http where body tainted_by read_file(path ~ "keys")')
checker = compile_predicate(rule)
verdict = checker.check(trace)  # trace is a grudge.schema.Trace
print(rule.describe())
print(verdict.violated, [step.idx for step in verdict.evidence])
assert parse(pretty_print(rule)) == rule
```

The demo rule flags the vulnerable leaky agent and passes the fixed agent.
Evidence is the original source `ToolCall`, its successful `ToolResult`, and
each later sink `ToolCall` containing the value. It is not an LLM explanation
or a reconstructed transcript.

## Grammar (EBNF)

Whitespace, including newlines, is allowed between tokens. Keywords are
case-sensitive. Tool/argument names may be identifiers or non-empty JSON strings.
JSON strings use double quotes and normal JSON escapes.

```ebnf
rule          = never_call | must_call | ordering | taint | flow | outcome | group ;
never_call    = "never", "call", name, ["where", conditions] ;
must_call     = "must", "call", name, ["where", conditions] ;
ordering      = "must", "call", name, "before", "call", name ;
taint         = "never", "call", name, "where", name, "tainted_by",
                name, "(", [conditions], ")" ;
flow          = "never", "flow", name, ["field", name], "to", name,
                ["field", name] ;
outcome       = "must", "finish", ("ok" | "failed") ;
group         = ("all_of" | "any_of"), "(", rule, {";", rule}, ")"
              | "not", "(", rule, ")" ;
conditions    = condition, {"and", condition} ;
condition     = name, "=", json_value
              | name, "~", json_string
              | name, "under", nonempty_json_string
              | name, "not", "under", nonempty_json_string ;
name          = identifier | nonempty_json_string ;
identifier    = (letter | "_"), {letter | digit | "_" | "." | "-"} ;
```

Identifiers use ASCII letters. JSON values must be finite: `NaN` and infinity
are rejected. Each field may appear only once in a condition list. `~` is a
case-sensitive substring operator, **not** a regular expression. Fields select
top-level keys; dots in a name are literal, not a nested-field selector.

## Four rule families

### Call shape — implemented

```text
never call delete_file where path not under "workspace/"
must call verify_user
never call send_http where url ~ "attacker.invalid"
```

`CallShape` requires a matching call; a missing required call violates the rule.
`never call` is `PredicateSet.not_(CallShape(...))` and violates when a matching
call exists. Specified arguments are matched; extra actual arguments are allowed.
`=` compares JSON values exactly (booleans do not equal numbers), while `under`
and `not under` compare normalized lexical paths. Separator and `..`
normalization do not read the filesystem or resolve symlinks. Missing or
non-string path arguments do not match path filters.

Argument operators serialize as `$contains`, `$under`, `$not_under`, or `$eq`
objects inside `CallShape.args`. A literal JSON object containing an operator
name is escaped with `$eq`; the canonical printer handles this automatically.

### Ordering — implemented

```text
must call verify_user before call transfer_funds
```

Every target call must have an earlier prerequisite call. Trace **list order**,
not timestamps or numeric index sorting, defines earlier. An absent target is
safe; this is a prerequisite rule, not a requirement to call the target. The
prerequisite need not have returned successfully and is not consumed. Evidence
contains precisely the target calls that lacked their prerequisite.

### Taint flow — MVP-lite implemented

```text
never call send_http where body tainted_by read_file(path ~ "keys")
never call send_http where body tainted_by read_file()
never flow read_file field content to send_http field body
```

Source results are correlated to prior source calls by `call_id`. Failed,
orphan, `null`, and empty-string source results do not introduce taint. A
non-empty source string matches an identical string or substring in a later
sink argument. Nested JSON lists/objects are traversed by their leaf values;
non-string scalars match by typed identity. A later model step does not clear
the source values.

Source filters narrow which reads count. `FilteredTaintFlow` persists these
filters in the shared predicate union, so parsed rules and groups round-trip
through Scar JSON without losing the filter. An unfiltered `TaintFlow` selects
all matching source tools and can select a result field or all sink arguments.

**Limits:** this is value matching, not complete information-flow tracking.
Coincidentally identical values can cause false positives. Hashing, encoding,
splitting/reassembly, implicit flows, and transformations that remove the
source substring are not followed. It checks attempted sink calls, not whether
the remote service accepted them; sink failures are still relevant evidence.

### Outcome — parsed, checking deferred

```text
must finish ok
must finish failed
```

Outcome ASTs round-trip, but compiling one raises
`NotImplementedError("roadmap: predicates.outcome")`. The checker remains a
Phase 13 stretch item. Synthesis rejects such drafts and retries or falls back
rather than handing an unusable checker to the caller.

## Groups, errors, and checker results

`all_of(a; b)` requires every child to hold; `any_of(a; b)` requires at least
one; `not(a)` negates satisfaction. Empty groups and multiple children in
`not` are invalid. Group evidence is deduplicated and kept in trace order.

`parse()` / `parse_predicate()` raise `PredicateParseError` (catchable from
`grudge.errors`) with one-based `line`, `column`, and a repair `hint`:

```text
never send_http
line 1, column 7: expected 'call'. Hint: insert 'call' here
```

`compile_predicate()` takes a typed AST, not raw text or arbitrary mappings.
It rejects unknown operators, non-JSON values, and malformed fields with
`TypeError`. Compiled checkers snapshot the AST, so later edits cannot change
an already compiled rule. `check(trace)` returns a Pydantic `PredicateResult`
with `violated`, `evidence: list[Step]`, and `explanation`. Missing-event rules
can violate with no evidence steps because the missing step does not exist.

## Synthesis and cache

`synthesize(shrink_result, original_trace)` uses the packaged
`grudge/predicates/prompts/synthesize.md` template and canonical JSON evidence.
Only the synthesis/client boundary can contact a provider. Checkers and the
parser contain no network calls or model decisions.

1. Look up a completion in `.grudge/cache` by SHA-256 of the exact prompt.
2. Offline: use the cached draft or the hand-verified demo fallback; never call
   a provider, including an injected client.
3. Online: draft a rule using an OpenAI-compatible HTTP endpoint or an injected
   provider adapter. Parse and compile it locally.
4. Feed validation errors back for at most two retries (three drafts total).
5. If validation still fails, use the demo rule. Cache a valid corrected draft
   under the original prompt so the same evidence needs no additional call.

The returned `SynthesisResult` has `predicate`, `dsl`, a plain-English
`rationale` derived from `describe()`, `source` (`llm`, `cache`, or `fallback`),
and `attempts`. Fallback output is not cached as model output. Cached drafts
are revalidated too. Deterministic validity does not prove that a rule is
useful: red/green admission proof is Phase 7, not part of synthesis.

All examples and tests run offline by default. Optional online setup uses
`.env.example` variable names (the app reads the process environment, not an
automatic dotenv loader):

```bash
export GRUDGE_OFFLINE=false
export GRUDGE_MODEL="YOUR_MODEL"
export GRUDGE_LLM_URL="https://YOUR_PROVIDER/v1/chat/completions"
# Supply GRUDGE_LLM_API_KEY securely in your environment; never commit it.
```

Do not submit sensitive traces to an external provider without authorization.
The prompt labels evidence untrusted, but that instruction is not a security
boundary. Local parsing/compilation accepts only the closed rule grammar;
it never executes generated Python or shell commands.

## Verification

From the project root in the activated Python environment:

```bash
python -m pytest tests/test_predicates_dsl.py tests/test_predicate_compiler.py tests/test_predicate_synthesizer.py
make all
```

Tests cover round trips and error locations; required/forbidden calls;
ordering and path traversal; taint evidence and negative cases; shared schema
persistence; offline/network guards; retry/fallback and cache hits; and the
real vulnerable/fixed example traces. See
[`adr/0003-llm-drafts-deterministic-code-decides.md`](adr/0003-llm-drafts-deterministic-code-decides.md)
for the synthesis boundary decision.
