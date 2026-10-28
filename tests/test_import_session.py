"""Phase 16a tests for importing redacted hook sessions."""

import json
from pathlib import Path

from grudge.guard.import_session import import_session
from grudge.schema import ToolCall, ToolResult


def test_import_session_preserves_order_and_round_trips(tmp_path: Path) -> None:
    path = tmp_path / "session-1.jsonl"
    path.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "tool": "read_file",
                        "args": {"path": "keys.txt"},
                        "result": "[REDACTED]",
                        "timestamp": "2026-01-01T00:00:00Z",
                    }
                ),
                "not json",
                json.dumps(
                    {
                        "tool": "http",
                        "args": {"body": "[REDACTED]"},
                        "result": "ok",
                        "timestamp": "2026-01-01T00:00:01Z",
                    }
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    trace = import_session(path, run_id="session-1")
    assert [step.kind for step in trace.steps] == [
        "tool_call",
        "tool_result",
        "tool_call",
        "tool_result",
    ]
    assert isinstance(trace.steps[0], ToolCall)
    assert isinstance(trace.steps[1], ToolResult)
    assert trace.steps[0].tool == "read_file"
    assert isinstance(trace.steps[2], ToolCall)
    assert trace.steps[2].tool == "http"
    round_trip = trace.from_jsonl(trace.to_jsonl()).model_dump(mode="json")
    assert round_trip == trace.model_dump(mode="json")


def test_import_session_ignores_invalid_events_and_accepts_failed_outcome(
    tmp_path: Path,
) -> None:
    path = tmp_path / "empty.jsonl"
    path.write_text(
        json.dumps({"args": {}}) + "\n" + json.dumps([1, 2]) + "\n",
        encoding="utf-8",
    )
    trace = import_session(path, outcome="failed")
    assert trace.steps == []
    assert trace.outcome == "failed"
