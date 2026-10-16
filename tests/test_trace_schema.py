"""Focused contract tests for the Phase 1 trace schema."""

from datetime import UTC, datetime

import pytest

from grudge.errors import SchemaError
from grudge.schema.trace import (
    FinalAnswer,
    ModelCall,
    StateDiff,
    ToolCall,
    ToolResult,
    Trace,
)

TS = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)


def make_trace() -> Trace:
    """Build a representative trace with every Phase 1 step kind."""

    return Trace(
        run_id="run-1",
        agent_version="agent-1",
        task="summarize mail",
        outcome="ok",
        steps=[
            ModelCall(
                idx=0,
                ts=TS,
                run_id="run-1",
                model="test-model",
                prompt="hello",
            ),
            ToolCall(
                idx=1,
                ts=TS,
                run_id="run-1",
                tool="read_file",
                args={"path": "report.txt"},
                call_id="call-1",
            ),
            ToolResult(
                idx=2,
                ts=TS,
                run_id="run-1",
                call_id="call-1",
                content={"text": "ok"},
            ),
            StateDiff(
                idx=3,
                ts=TS,
                run_id="run-1",
                diff={"unread": 0},
            ),
            FinalAnswer(
                idx=4,
                ts=TS,
                run_id="run-1",
                answer="Done",
            ),
        ],
    )


def test_trace_helpers_and_jsonl_round_trip_preserve_order() -> None:
    trace = make_trace()

    assert [step.idx for step in trace.tool_calls()] == [1]
    assert [step.idx for step in trace.results_for("call-1")] == [2]
    assert [step.idx for step in trace.slice([4, 1]).steps] == [1, 4]

    encoded = trace.to_jsonl()
    assert encoded == trace.to_jsonl()
    restored = Trace.from_jsonl(encoded)
    assert restored.model_dump(mode="json") == trace.model_dump(mode="json")
    assert [step.kind for step in restored.steps] == [step.kind for step in trace.steps]


def test_trace_invalid_public_payloads_raise_schema_error() -> None:
    with pytest.raises(SchemaError):
        Trace.model_validate(
            {
                "run_id": "run-1",
                "agent_version": "agent-1",
                "task": "task",
                "outcome": "unknown",
                "steps": [],
            }
        )

    with pytest.raises(SchemaError):
        Trace.from_jsonl('{"type":"trace","run_id":"run-1"}\nnot-json\n')

    with pytest.raises(SchemaError):
        ToolCall(
            idx=0,
            ts=TS,
            run_id="run-1",
            tool="",
            args={},
            call_id="call-1",
        )
