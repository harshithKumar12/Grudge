"""Focused Phase 4 tests for cassette-backed, hermetic replay."""

from __future__ import annotations

import time
from typing import Any

import pytest

from examples.leaky_agent.agent import run_agent as run_leaky_agent
from grudge.errors import ReplayMismatch
from grudge.replay.sandbox import CassetteWorld, run_agent, world_from_trace
from grudge.replay.scripted_llm import ScriptedLLM
from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry
from grudge.schema.trace import ToolCall, Trace
from tests.test_leaky_agents import FakeWorld


def _failing_cassette() -> Cassette:
    original = run_leaky_agent(FakeWorld(poisoned=True))
    return world_from_trace(original)


def _send_calls(trace: Trace) -> list[ToolCall]:
    return [
        step
        for step in trace.steps
        if isinstance(step, ToolCall) and step.tool == "send_http"
    ]


def test_full_trace_cassette_replays_the_failure_without_the_example_world() -> None:
    trace = run_agent(
        run_leaky_agent,
        _failing_cassette(),
        ScriptedLLM(),
        timeout=2,
        max_steps=128,
    )

    assert trace.outcome == "ok"
    assert _send_calls(trace)
    assert _send_calls(trace)[0].args["body"] == "FAKE_KEY_sk_demo_phase2"


def test_cassette_without_poisoned_email_changes_the_outcome() -> None:
    cassette = _failing_cassette()
    cassette.world = [
        entry
        for entry in cassette.world
        if not (entry.tool == "read_email" and entry.match.args == {"id": "7"})
    ]

    trace = run_agent(
        run_leaky_agent,
        cassette,
        ScriptedLLM(),
        timeout=2,
        max_steps=128,
    )

    assert trace.outcome == "ok"
    assert _send_calls(trace) == []


def test_strict_world_raises_and_lenient_world_logs_a_miss() -> None:
    cassette = Cassette(
        task="read",
        world=[
            CassetteEntry(
                tool="read_file",
                match=ArgMatcher.exact({"path": "known.txt"}),
                response="known",
            )
        ],
    )
    with pytest.raises(ReplayMismatch):
        CassetteWorld(cassette).read_file("missing.txt")

    lenient = CassetteWorld(cassette, strict=False)
    assert lenient.read_file("missing.txt") == {}
    assert lenient.misses == (("read_file", {"path": "missing.txt"}),)


@pytest.mark.parametrize("operation", ["file", "network"])
def test_sandbox_blocks_filesystem_and_network(operation: str) -> None:
    def agent(world: Any, *, llm: Any = None, **kwargs: Any) -> Trace:
        del world, llm, kwargs
        if operation == "file":
            with open("outside-cassette.txt", encoding="utf-8"):
                pass
        else:
            import socket

            socket.create_connection(("example.invalid", 80))
        raise AssertionError("the operation should have been blocked")

    trace = run_agent(
        agent,
        Cassette(task="guarded"),
        ScriptedLLM(),
        timeout=1,
        max_steps=4,
    )

    assert trace.outcome == "failed"
    assert "PermissionError" in trace.steps[0].meta["failure"]
    Trace.from_jsonl(trace.to_jsonl())


def test_step_limit_returns_a_valid_failure_trace() -> None:
    trace = run_agent(
        run_leaky_agent,
        _failing_cassette(),
        ScriptedLLM(),
        timeout=2,
        max_steps=1,
    )

    assert trace.outcome == "failed"
    assert len(trace.steps) <= 1
    Trace.from_jsonl(trace.to_jsonl())


def test_timeout_returns_a_valid_failure_trace() -> None:
    def slow_agent(world: Any, *, llm: Any = None, **kwargs: Any) -> None:
        del world, llm, kwargs
        time.sleep(0.2)

    trace = run_agent(
        slow_agent,
        Cassette(task="slow"),
        ScriptedLLM(),
        timeout=0.01,
        max_steps=4,
    )

    assert trace.outcome == "failed"
    assert "timeout" in trace.steps[0].meta["failure"]
    Trace.from_jsonl(trace.to_jsonl())


def test_world_from_trace_keeps_every_tool_call_in_order() -> None:
    source = run_leaky_agent(FakeWorld(poisoned=True))
    cassette = world_from_trace(source)

    calls = [step for step in source.steps if isinstance(step, ToolCall)]
    assert cassette.task == source.task
    assert len(cassette.world) == len(calls)
    assert [entry.tool for entry in cassette.world] == [step.tool for step in calls]
    assert [entry.order_hint for entry in cassette.world] == [
        step.idx for step in calls
    ]


def test_same_cassette_and_policy_are_deterministic() -> None:
    cassette = _failing_cassette()
    first = run_agent(
        run_leaky_agent, cassette, ScriptedLLM(), timeout=2, max_steps=128
    )
    second = run_agent(
        run_leaky_agent, cassette, ScriptedLLM(), timeout=2, max_steps=128
    )

    assert first.to_jsonl() == second.to_jsonl()
