"""Focused Phase 5 tests for ordered two-level cassette shrinking."""

from __future__ import annotations

from examples.leaky_agent.agent import run_agent as run_leaky_agent
from grudge.replay.sandbox import world_from_trace
from grudge.schema.cassette import Cassette
from grudge.schema.trace import ToolCall, Trace
from grudge.shrinker.cassette_builder import build_minimal_cassette
from grudge.shrinker.oracle import PredicateOracle
from tests.test_leaky_agents import FakeWorld

SECRET = "FAKE_KEY_sk_demo_phase2"


def _failing_cassette() -> Cassette:
    return world_from_trace(run_leaky_agent(FakeWorld(poisoned=True)))


def _leak(trace: Trace) -> bool:
    return any(
        isinstance(step, ToolCall)
        and step.tool == "send_http"
        and SECRET in str(step.args.get("body", ""))
        for step in trace.steps
    )


def test_builder_runs_entry_reduction_before_content_reduction() -> None:
    result = build_minimal_cassette(
        _failing_cassette(),
        PredicateOracle(run_leaky_agent, _leak),
    )

    levels = [event["level"] for event in result.history]
    assert "entries" in levels and "content" in levels
    assert levels.index("entries") < levels.index("content")
    first_content = levels.index("content")
    assert all(level == "entries" for level in levels[:first_content])


def test_real_leaky_agent_shrinks_to_three_entries_and_under_one_kilobyte() -> None:
    result = build_minimal_cassette(
        _failing_cassette(),
        agent_fn=run_leaky_agent,
        seed_predicate=_leak,
    )

    assert len(result.minimal.world) <= 3
    assert result.minimal.size_bytes() <= 1024
    assert result.stats["minimal_entries"] <= 3
    assert result.stats["minimal_bytes"] <= 1024
    assert result.history
    assert PredicateOracle(run_leaky_agent, _leak).reproduces(result.minimal).reproduced


def test_builder_output_and_history_are_deterministic() -> None:
    first = build_minimal_cassette(
        _failing_cassette(),
        agent_fn=run_leaky_agent,
        seed_predicate=_leak,
    )
    second = build_minimal_cassette(
        _failing_cassette(),
        agent_fn=run_leaky_agent,
        seed_predicate=_leak,
    )

    assert first.minimal.content_hash == second.minimal.content_hash
    assert first.history == second.history
    assert first.stats == second.stats
