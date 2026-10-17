"""Focused contract tests for the Phase 3 recorder core."""

from __future__ import annotations

from pathlib import Path

import pytest

from grudge.recorder import Recorder as ExportedRecorder
from grudge.recorder.adapters.raw_sdk import record_raw_sdk
from grudge.recorder.recorder import Recorder, record
from grudge.schema.trace import Trace


def test_recorder_writes_valid_jsonl_in_monotonic_order(tmp_path: Path) -> None:
    """Every recorder API maps to a valid, ordered Phase 1 trace step."""

    output = tmp_path / "run.jsonl"
    with Recorder(
        output,
        run_id="run-1",
        agent_version="agent-1",
        task="summarize",
    ) as recorder:
        recorder.record_model_call(model="model", prompt="hello")
        call = recorder.record_tool_call("read_file", {"path": "report.txt"})
        recorder.record_tool_result(call.call_id, {"text": "ok"})
        recorder.record_state_diff({"unread": 0})
        recorder.record_final_answer("Done")

    trace = Trace.from_jsonl(output.read_text(encoding="utf-8"))
    assert trace.outcome == "ok"
    assert [step.idx for step in trace.steps] == list(range(5))
    assert [step.kind for step in trace.steps] == [
        "model_call",
        "tool_call",
        "tool_result",
        "state_diff",
        "final_answer",
    ]
    assert ExportedRecorder is Recorder


def test_recorder_captures_context_exception_as_failed_trace(tmp_path: Path) -> None:
    """A failed context persists prior steps and marks the run failed."""

    output = tmp_path / "failed.jsonl"
    with pytest.raises(RuntimeError, match="boom"):
        with Recorder(
            output,
            run_id="run-2",
            agent_version="agent-1",
            task="fail",
        ) as recorder:
            recorder.record_final_answer(None)
            raise RuntimeError("boom")

    trace = Trace.from_jsonl(output.read_text(encoding="utf-8"))
    assert trace.outcome == "failed"
    assert [step.idx for step in trace.steps] == [0]


def test_raw_sdk_adapter_preserves_plain_event_order(tmp_path: Path) -> None:
    """The adapter translates Phase 2-style mappings without SDK imports."""

    output = tmp_path / "sdk.jsonl"
    with Recorder(
        output,
        run_id="run-3",
        agent_version="agent-1",
        task="sdk loop",
    ) as recorder:
        recorded = record_raw_sdk(
            recorder,
            lambda: [
                {"type": "model_call", "model": "model", "prompt": "hello"},
                {
                    "kind": "tool_call",
                    "name": "read_file",
                    "arguments": {"path": "report.txt"},
                    "call_id": "call-1",
                },
                {
                    "kind": "tool_result",
                    "tool_call_id": "call-1",
                    "content": {"text": "ok"},
                },
                {"kind": "final_answer", "answer": "Done"},
            ],
        )

    assert [step.kind for step in recorded] == [
        "model_call",
        "tool_call",
        "tool_result",
        "final_answer",
    ]
    trace = Trace.from_jsonl(output.read_text(encoding="utf-8"))
    assert [step.idx for step in trace.steps] == [0, 1, 2, 3]


def test_record_decorator_injects_recorder_and_captures_failure(tmp_path: Path) -> None:
    """The decorator supplies a recorder-aware function with the same boundary."""

    output = tmp_path / "decorated.jsonl"

    @record(output, run_id="run-4", agent_version="agent-1", task="decorated")
    def run(*, recorder: Recorder) -> None:
        recorder.record_final_answer("before failure")
        raise ValueError("decorated failure")

    with pytest.raises(ValueError, match="decorated failure"):
        run()

    trace = Trace.from_jsonl(output.read_text(encoding="utf-8"))
    assert trace.outcome == "failed"
    assert trace.steps[0].kind == "final_answer"
