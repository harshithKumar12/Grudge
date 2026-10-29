"""Focused Phase 5 tests for predicate-backed cassette oracles."""

from __future__ import annotations

from typing import Any

import pytest

from examples.leaky_agent.agent import run_agent as run_leaky_agent
from grudge.errors import OracleError
from grudge.predicates.fallback_rules import demo_rule
from grudge.replay.sandbox import world_from_trace
from grudge.schema.cassette import Cassette
from grudge.schema.predicate import CallShape, Outcome, TaintFlow
from grudge.schema.trace import ToolCall, Trace
from grudge.shrinker.oracle import PredicateOracle
from tests.test_leaky_agents import FakeWorld


def _failing_cassette() -> Cassette:
    return world_from_trace(run_leaky_agent(FakeWorld(poisoned=True)))


def _leak(trace: Trace) -> bool:
    return any(
        isinstance(step, ToolCall)
        and step.tool == "send_http"
        and step.args.get("body") == "FAKE_KEY_sk_demo_phase2"
        for step in trace.steps
    )


def test_oracle_memoizes_by_cassette_content_hash() -> None:
    oracle = PredicateOracle(run_leaky_agent, _leak)
    cassette = _failing_cassette()

    first = oracle.reproduces(cassette)
    second = oracle.reproduces(cassette.model_copy(deep=True))

    assert first.reproduced and second.reproduced
    assert oracle.calls == 1
    assert oracle.cache_hits == 1


def test_repeats_require_every_run_to_reproduce() -> None:
    seen = 0

    def predicate(trace: Trace) -> bool:
        nonlocal seen
        seen += 1
        return seen < 2

    oracle = PredicateOracle(run_leaky_agent, predicate, repeats=2)
    result = oracle.reproduces(_failing_cassette())

    assert not result.reproduced
    assert "1/2" in result.reason
    assert seen == 2


def test_budget_guard_raises_a_clear_oracle_error() -> None:
    oracle = PredicateOracle(run_leaky_agent, _leak, max_oracle_calls=1)
    cassette = _failing_cassette()
    oracle.reproduces(cassette)
    cassette.world = cassette.world[:-1]

    with pytest.raises(OracleError, match="max_oracle_calls=1"):
        oracle.reproduces(cassette)


@pytest.mark.parametrize(
    ("predicate", "expected"),
    [
        (
            CallShape(
                tool="send_http",
                args={"url": "https://attacker.invalid/collect"},
            ),
            True,
        ),
        (TaintFlow(source="read_file", sink="send_http", sink_field="body"), True),
        (demo_rule(), True),
        (Outcome(outcome="ok"), True),
        (Outcome(outcome="failed"), False),
    ],
)
def test_phase_one_seed_predicate_shapes_are_evaluated(
    predicate: Any, expected: bool
) -> None:
    result = PredicateOracle(run_leaky_agent, predicate).reproduces(_failing_cassette())

    assert result.reproduced is expected
