"""Deterministic Phase 6 rule semantics and exact-evidence acceptance tests."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from examples.leaky_agent.agent import run_agent
from examples.leaky_agent.agent_fixed import run_agent as run_fixed_agent
from grudge.predicates import compile_predicate, parse_predicate
from grudge.schema.predicate import (
    CallShape,
    Ordering,
    Outcome,
    PredicateSet,
    TaintFlow,
)
from grudge.schema.trace import ModelCall, Step, ToolCall, ToolResult, Trace

_TIME = datetime(2026, 1, 1, tzinfo=UTC)
_RULE = 'never call send_http where body tainted_by read_file(path ~ "keys")'


def _call(idx: int, tool: str, **args: Any) -> ToolCall:
    return ToolCall(
        idx=idx, ts=_TIME, run_id="test", call_id=f"c{idx}", tool=tool, args=args
    )


def _result(
    idx: int, call: ToolCall, content: Any, error: str | None = None
) -> ToolResult:
    return ToolResult(
        idx=idx,
        ts=_TIME,
        run_id="test",
        call_id=call.call_id,
        content=content,
        error=error,
    )


def _trace(*steps: Step) -> Trace:
    return Trace(
        run_id="test",
        agent_version="test",
        task="test",
        steps=list(steps),
        outcome="ok",
    )


def test_positive_and_negative_call_shape_and_exact_evidence() -> None:
    noise = _call(0, "send_http", body="safe")
    first = _call(1, "send_http", body="secret", extra=True)
    second = _call(2, "send_http", body="secret")
    trace = _trace(noise, first, second)
    predicate = CallShape(tool="send_http", args={"body": "secret"})
    positive = compile_predicate(predicate).check(trace)
    assert not positive.violated
    assert positive.evidence == [first, second]
    assert positive.evidence[0] is first
    negative = compile_predicate(PredicateSet.not_(predicate)).check(trace)
    assert negative.violated
    assert negative.evidence == [first, second]
    assert (
        not compile_predicate(PredicateSet.not_(predicate))
        .check(_trace(noise))
        .violated
    )
    missing = compile_predicate(predicate).check(_trace())
    assert missing.violated and missing.evidence == []
    assert missing.explanation


@pytest.mark.parametrize(
    ("path", "violated"),
    [
        ("workspace/file.txt", False),
        ("workspace/sub/../file.txt", False),
        ("workspace", False),
        ("./workspace/file.txt", False),
        ("workspace\\file.txt", False),
        ("workspace/../secret", True),
        ("workspace2/file.txt", True),
        ("../workspace/file.txt", True),
        ("/workspace/file.txt", True),
        ("C:/workspace/file.txt", True),
    ],
)
def test_path_boundaries_and_traversal(path: str, violated: bool) -> None:
    checker = compile_predicate(
        parse_predicate('never call delete_file where path not under "workspace/"')
    )
    call = _call(0, "delete_file", path=path)
    result = checker.check(_trace(call))
    assert result.violated is violated
    assert result.evidence == ([call] if violated else [])


def test_call_filters_require_present_typed_arguments_and_match_json_exactly() -> None:
    checker = compile_predicate(
        parse_predicate('never call delete_file where path not under "workspace/"')
    )
    assert not checker.check(_trace(_call(0, "delete_file"))).violated
    assert not checker.check(_trace(_call(0, "delete_file", path=None))).violated
    assert (
        not compile_predicate(CallShape(tool="x", args={"v": True}))
        .check(_trace(_call(0, "x", v=True)))
        .violated
    )
    assert (
        compile_predicate(CallShape(tool="x", args={"v": True}))
        .check(_trace(_call(0, "x", v=1)))
        .violated
    )
    assert (
        not compile_predicate(
            parse_predicate('must call x where v = {"$contains": "literal"}')
        )
        .check(_trace(_call(0, "x", v={"$contains": "literal"})))
        .violated
    )


def test_ordering_checks_each_target_and_uses_list_order_not_indexes() -> None:
    checker = compile_predicate(Ordering(before="verify_user", after="transfer_funds"))
    transfer = _call(99, "transfer_funds")
    verify = _call(1, "verify_user")
    later = _call(0, "transfer_funds")
    result = checker.check(_trace(transfer, verify, later))
    assert result.violated and result.evidence == [transfer]
    assert result.evidence[0] is transfer
    assert not checker.check(_trace(verify, transfer, later)).violated
    assert not checker.check(_trace(verify)).violated
    assert not checker.check(_trace()).violated
    assert checker.check(_trace(transfer)).evidence == [transfer]


def test_same_tool_ordering_needs_an_earlier_call() -> None:
    call = _call(0, "x")
    result = compile_predicate(Ordering(before="x", after="x")).check(_trace(call))
    assert result.violated and result.evidence == [call]


@pytest.mark.parametrize(
    "body", ["FAKE_SECRET", "prefix FAKE_SECRET suffix", {"x": ["FAKE_SECRET"]}]
)
def test_taint_tracks_identity_substrings_and_nested_values_with_exact_evidence(
    body: Any,
) -> None:
    source = _call(5, "read_file", path="api_keys.txt")
    returned = _result(2, source, {"text": "FAKE_SECRET"})
    noise = ModelCall(idx=0, ts=_TIME, run_id="test", response="ignored")
    sink = _call(1, "send_http", body=body)
    trace = _trace(source, returned, noise, sink)
    checker = compile_predicate(parse_predicate(_RULE))
    result = checker.check(trace)
    assert result.violated
    assert result.evidence == [source, returned, sink]
    assert all(
        a is b for a, b in zip(result.evidence, (source, returned, sink), strict=True)
    )
    assert result == checker.check(trace)


@pytest.mark.parametrize(
    "reason",
    [
        "before",
        "unreturned",
        "error",
        "path",
        "sink_field",
        "empty",
        "none",
        "unrelated",
    ],
)
def test_taint_avoids_unrelated_or_unavailable_values(reason: str) -> None:
    source = _call(
        0, "read_file", path="report.txt" if reason == "path" else "keys.txt"
    )
    returned = _result(
        1,
        source,
        "" if reason == "empty" else None if reason == "none" else "SECRET",
        error="failed" if reason == "error" else None,
    )
    sink = _call(
        2,
        "send_http",
        body="safe" if reason in {"sink_field", "unrelated"} else "SECRET",
        url="SECRET",
    )
    if reason == "before":
        trace = _trace(source, sink, returned)
    elif reason == "unreturned":
        trace = _trace(source, sink)
    else:
        trace = _trace(source, returned, sink)
    result = compile_predicate(parse_predicate(_RULE)).check(trace)
    assert not result.violated
    assert result.evidence == []


def test_schema_taint_selects_result_field_and_any_sink_argument() -> None:
    source = _call(0, "read_file")
    returned = _result(1, source, {"secret": 42, "noise": "public"})
    sink = _call(2, "send_http", body={"values": [42]})
    checker = compile_predicate(
        TaintFlow(source="read_file", sink="send_http", source_field="secret")
    )
    assert checker.check(_trace(source, returned, sink)).evidence == [
        source,
        returned,
        sink,
    ]
    assert not checker.check(
        _trace(source, returned, _call(3, "send_http", body=True))
    ).violated


def test_taint_correlates_interleaved_results_and_deduplicates_evidence() -> None:
    first = _call(0, "read_file", path="keys-a")
    second = _call(1, "read_file", path="keys-b")
    second_result = _result(2, second, "OTHER")
    first_result = _result(3, first, "SECRET")
    sink = _call(4, "send_http", body="SECRET")
    later = _call(5, "send_http", body="prefix SECRET")
    result = compile_predicate(parse_predicate(_RULE)).check(
        _trace(first, second, second_result, first_result, sink, later)
    )
    assert result.evidence == [first, first_result, sink, later]


def test_taint_ignores_orphan_results_and_tracks_values_across_model_steps() -> None:
    source = _call(0, "read_file", path="keys")
    returned = _result(1, source, "SECRET")
    intermediate = ModelCall(idx=2, ts=_TIME, run_id="test", response="prefix SECRET")
    sink = _call(3, "send_http", body="prefix SECRET")
    checker = compile_predicate(parse_predicate(_RULE))
    assert checker.check(_trace(returned, source, sink)).evidence == []
    assert checker.check(_trace(source, returned, intermediate, sink)).evidence == [
        source,
        returned,
        sink,
    ]


def test_dsl_groups_support_filtered_taint_alongside_schema_rules() -> None:
    source = _call(0, "read_file", path="keys")
    returned = _result(1, source, "SECRET")
    sink = _call(2, "send_http", body="SECRET")
    checker = compile_predicate(parse_predicate(f"all_of({_RULE}; never call erase)"))
    result = checker.check(_trace(source, returned, sink))
    assert result.violated and result.evidence == [source, returned, sink]
    assert not checker.check(_trace(source, returned)).violated


def test_predicate_sets_combine_satisfaction_and_exact_witnesses() -> None:
    a, b = _call(0, "a"), _call(1, "b")
    forbidden_a = PredicateSet.not_(CallShape(tool="a"))
    forbidden_b = PredicateSet.not_(CallShape(tool="b"))
    conjunction = compile_predicate(PredicateSet.all_of(forbidden_a, forbidden_b))
    disjunction = compile_predicate(PredicateSet.any_of(forbidden_a, forbidden_b))
    assert conjunction.check(_trace(a)).violated
    assert conjunction.check(_trace(a)).evidence == [a]
    assert not disjunction.check(_trace(a)).violated
    both = disjunction.check(_trace(a, b))
    assert both.violated and both.evidence == [a, b]
    nested = compile_predicate(
        PredicateSet.not_(PredicateSet.all_of(forbidden_a, forbidden_b))
    )
    assert not nested.check(_trace(a)).violated
    assert nested.check(_trace()).violated


@pytest.mark.parametrize(
    "predicate",
    [
        "never call send_http",
        {"kind": "call_shape", "tool": "send_http"},
        object(),
        CallShape(tool="x", args={"v": {"$contains": 4}}),
        CallShape(tool="x", args={"v": {"$unknown": "x"}}),
        CallShape(tool="x", args={"v": {"$under": ""}}),
        CallShape(tool="x", args={"v": object()}),
        CallShape(tool="x", args={"v": float("nan")}),
        CallShape.model_construct(tool=4),
        Ordering.model_construct(before="", after="b"),
        TaintFlow(source="a", sink="b", sink_field=""),
        PredicateSet.model_construct(kind="not", predicates=[]),
    ],
)
def test_compiler_rejects_wrong_types_and_ill_typed_operators(predicate: Any) -> None:
    with pytest.raises(TypeError):
        compile_predicate(predicate)


def test_compilation_snapshots_mutable_ast_and_outcome_is_honest_stub() -> None:
    predicate = CallShape(tool="x", args={"v": "before"})
    checker = compile_predicate(predicate)
    predicate.args["v"] = "after"
    assert not checker.check(_trace(_call(0, "x", v="before"))).violated
    with pytest.raises(NotImplementedError, match="roadmap: predicates.outcome"):
        compile_predicate(Outcome(outcome="ok"))


def test_generalized_rule_is_red_on_vulnerable_and_green_on_fixed_leaky_agent() -> None:
    checker = compile_predicate(parse_predicate(_RULE))
    bad = run_agent()
    good = run_fixed_agent()
    result = checker.check(bad)
    assert result.violated
    source = next(
        c
        for c in bad.tool_calls()
        if c.tool == "read_file" and "keys" in c.args["path"]
    )
    returned = bad.results_for(source.call_id)[0]
    sink = next(c for c in bad.tool_calls() if c.tool == "send_http")
    assert result.evidence == [source, returned, sink]
    assert not checker.check(good).violated
    assert checker.check(good).evidence == []
