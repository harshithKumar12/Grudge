# OWNER: lane-b
"""Import redacted Phase 16 hook JSONL into the Python Trace contract.

The Node recorder stores one compact event per tool invocation.  The engine's
trace language models the request and response separately, so each valid log
line becomes an adjacent ``ToolCall``/``ToolResult`` pair while preserving the
original event order.  Corrupt or non-object lines are ignored deliberately:
session capture is diagnostic and must not make later analysis unavailable.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast
from uuid import uuid4

from grudge.schema import ToolCall, ToolResult, Trace


def _timestamp(value: Any) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            pass
    return datetime.fromtimestamp(0, tz=UTC)


def import_session(
    source: str | Path,
    *,
    run_id: str | None = None,
    agent_version: str = "grudge-hook",
    task: str = "Imported Grudge session",
    outcome: str = "ok",
) -> Trace:
    """Load a session JSONL file into a validated :class:`~grudge.schema.Trace`."""

    session_id = run_id or Path(source).stem or str(uuid4())
    steps: list[ToolCall | ToolResult] = []
    with Path(source).open(encoding="utf-8") as handle:
        for event_index, line in enumerate(handle):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue
            tool = event.get("tool")
            if not isinstance(tool, str) or not tool:
                continue
            args = event.get("args", {})
            if not isinstance(args, dict):
                args = {}
            call_id = f"{session_id}:{event_index}"
            timestamp = _timestamp(event.get("timestamp"))
            base = {
                "ts": timestamp,
                "run_id": session_id,
                "meta": {"session_event": event_index},
            }
            steps.append(
                ToolCall(idx=len(steps), tool=tool, args=args, call_id=call_id, **base)
            )
            result = event.get("result", "")
            if not isinstance(
                result, (str, int, float, bool, list, dict)
            ) and result is not None:
                result = str(result)
            steps.append(
                ToolResult(
                    idx=len(steps),
                    call_id=call_id,
                    content=result,
                    error=event.get("error") if isinstance(event.get("error"), str) else None,
                    **base,
                )
            )
    normalized_outcome = cast(
        Literal["ok", "failed"], outcome if outcome in {"ok", "failed"} else "ok"
    )
    return Trace(
        run_id=session_id,
        agent_version=agent_version,
        task=task,
        steps=steps,
        outcome=normalized_outcome,
    )


__all__ = ["import_session"]
