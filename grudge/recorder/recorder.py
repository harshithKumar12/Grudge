"""Capture an agent run as an ordered, canonical Phase 1 trace.

The recorder keeps steps in memory until the run is complete.  This lets the
JSONL header contain the final outcome while the output itself is still
written append-only: once a record is written it is never sought, rewritten,
or truncated.
"""

from __future__ import annotations

import inspect
import json
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from functools import wraps
from io import TextIOBase
from pathlib import Path
from types import TracebackType
from typing import Any, Literal, TypeVar, cast

from grudge.recorder.redact import redact_trace
from grudge.schema.trace import (
    FinalAnswer,
    ModelCall,
    StateDiff,
    Step,
    ToolCall,
    ToolResult,
    Trace,
)

Output = str | Path | TextIOBase
ReturnT = TypeVar("ReturnT")


class JsonlWriter:
    """Write JSON objects to a text sink without rewriting earlier records."""

    def __init__(self, output: Output) -> None:
        self._owned = isinstance(output, str | Path)
        if self._owned:
            stream = Path(cast(str | Path, output)).open("a", encoding="utf-8")
            self._stream: TextIOBase = stream
        else:
            self._stream = cast(TextIOBase, output)
        self._closed = False

    def append(self, record: Mapping[str, Any]) -> None:
        """Append one canonical JSON object and flush it to the sink."""

        if self._closed:
            raise RuntimeError("cannot append to a closed JSONL writer")
        line = json.dumps(
            dict(record),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        self._stream.write(line + "\n")
        self._stream.flush()

    def close(self) -> None:
        """Close an owned file, leaving caller-owned streams open."""

        if self._closed:
            return
        self._stream.flush()
        if self._owned:
            self._stream.close()
        self._closed = True


class Recorder:
    """Record one agent run and persist it as canonical JSONL.

    ``Recorder`` is normally used as a context manager.  Steps receive a
    strictly increasing index at the moment they are recorded, and an
    exception escaping the context produces a failed trace before being
    re-raised to the caller.
    """

    def __init__(
        self,
        output: Output,
        *,
        run_id: str,
        agent_version: str = "unknown",
        task: str = "",
    ) -> None:
        self.output = output
        self.run_id = run_id
        self.agent_version = agent_version
        self.task = task
        self._steps: list[Step] = []
        self._next_idx = 0
        self._trace: Trace | None = None
        self._writer: JsonlWriter | None = None
        self.exception: BaseException | None = None

    def __enter__(self) -> Recorder:
        """Start a recording context."""

        if self._trace is not None:
            raise RuntimeError("a recorder can only be entered once")
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        """Persist the trace and re-raise any exception from the context."""

        if exc_value is not None:
            self.exception = exc_value
        self.close(outcome="failed" if exc_value is not None else "ok")
        return False

    @property
    def steps(self) -> tuple[Step, ...]:
        """Return the recorded steps in their original order."""

        return tuple(self._steps)

    @property
    def trace(self) -> Trace:
        """Return the finalized trace, or raise while recording is active."""

        if self._trace is None:
            raise RuntimeError("trace is available after Recorder.close()")
        return self._trace

    def record_step(self, step: Step) -> Step:
        """Append a pre-built Phase 1 step at the next monotonic index."""

        if self._trace is not None:
            raise RuntimeError("cannot record after the recorder is closed")
        if step.run_id != self.run_id:
            raise ValueError("step run_id must match recorder run_id")
        if step.idx != self._next_idx:
            raise ValueError(f"step idx must be {self._next_idx}, received {step.idx}")
        self._steps.append(step)
        self._next_idx += 1
        return step

    def record_model_call(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, Any]] | None = None,
        prompt: str | None = None,
        response: Any = None,
        parent_idx: int | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> ModelCall:
        """Record a model request or response."""

        return cast(
            ModelCall,
            self.record_step(
                ModelCall(
                    idx=self._next_idx,
                    ts=_now(),
                    run_id=self.run_id,
                    parent_idx=parent_idx,
                    meta=dict(meta or {}),
                    model=model,
                    messages=messages,
                    prompt=prompt,
                    response=response,
                )
            ),
        )

    def record_tool_call(
        self,
        tool: str,
        args: Mapping[str, Any] | None = None,
        call_id: str | None = None,
        *,
        parent_idx: int | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> ToolCall:
        """Record a tool invocation, generating a call id when omitted."""

        return cast(
            ToolCall,
            self.record_step(
                ToolCall(
                    idx=self._next_idx,
                    ts=_now(),
                    run_id=self.run_id,
                    parent_idx=parent_idx,
                    meta=dict(meta or {}),
                    tool=tool,
                    args=dict(args or {}),
                    call_id=call_id or f"call-{self._next_idx}",
                )
            ),
        )

    def record_tool_result(
        self,
        call_id: str,
        content: Any,
        error: str | None = None,
        *,
        parent_idx: int | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> ToolResult:
        """Record a tool result, including a tool-level error when present."""

        return cast(
            ToolResult,
            self.record_step(
                ToolResult(
                    idx=self._next_idx,
                    ts=_now(),
                    run_id=self.run_id,
                    parent_idx=parent_idx,
                    meta=dict(meta or {}),
                    call_id=call_id,
                    content=content,
                    error=error,
                )
            ),
        )

    def record_state_diff(
        self,
        diff: Mapping[str, Any] | None = None,
        *,
        parent_idx: int | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> StateDiff:
        """Record a structured state change."""

        return cast(
            StateDiff,
            self.record_step(
                StateDiff(
                    idx=self._next_idx,
                    ts=_now(),
                    run_id=self.run_id,
                    parent_idx=parent_idx,
                    meta=dict(meta or {}),
                    diff=dict(diff or {}),
                )
            ),
        )

    def record_final_answer(
        self,
        answer: str | None,
        *,
        parent_idx: int | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> FinalAnswer:
        """Record the agent's terminal answer."""

        return cast(
            FinalAnswer,
            self.record_step(
                FinalAnswer(
                    idx=self._next_idx,
                    ts=_now(),
                    run_id=self.run_id,
                    parent_idx=parent_idx,
                    meta=dict(meta or {}),
                    answer=answer,
                )
            ),
        )

    # Short aliases make the recording API convenient in plain SDK loops.
    model_call = record_model_call
    tool_call = record_tool_call
    tool_result = record_tool_result
    state_diff = record_state_diff
    final_answer = record_final_answer

    def close(self, *, outcome: Literal["ok", "failed"] = "ok") -> Trace:
        """Finalize and append the trace header and steps to the output."""

        if self._trace is not None:
            return self._trace
        trace = Trace(
            run_id=self.run_id,
            agent_version=self.agent_version,
            task=self.task,
            steps=list(self._steps),
            outcome=outcome,
        )
        writer = JsonlWriter(self.output)
        try:
            for line in trace.to_jsonl().splitlines():
                writer.append(redact_trace(json.loads(line)))
        finally:
            writer.close()
        self._writer = writer
        self._trace = trace
        return trace


def _now() -> datetime:
    """Return an aware UTC timestamp for a trace step."""

    return datetime.now(UTC)


def record_run(
    output: Output,
    *,
    run_id: str,
    agent_version: str = "unknown",
    task: str = "",
) -> Recorder:
    """Create a recorder; use it as ``with record_run(...) as recorder``."""

    return Recorder(
        output,
        run_id=run_id,
        agent_version=agent_version,
        task=task,
    )


def record(
    output: Output,
    *,
    run_id: str,
    agent_version: str = "unknown",
    task: str = "",
) -> Callable[[Callable[..., ReturnT]], Callable[..., ReturnT]]:
    """Decorate a recorder-aware function with a recording context.

    The wrapped function receives ``recorder=...`` when its signature accepts
    that keyword.  Functions that do not accept it still get outcome capture.
    """

    def decorate(function: Callable[..., ReturnT]) -> Callable[..., ReturnT]:
        def wrapped(*args: Any, **kwargs: Any) -> ReturnT:
            with Recorder(
                output,
                run_id=run_id,
                agent_version=agent_version,
                task=task,
            ) as recorder:
                accepts_recorder = _accepts_keyword(function, "recorder")
                if accepts_recorder:
                    kwargs = {**kwargs, "recorder": recorder}
                return function(*args, **kwargs)

        return cast(Callable[..., ReturnT], wraps(function)(wrapped))

    return decorate


def _accepts_keyword(function: Callable[..., Any], name: str) -> bool:
    """Check whether a callable can receive a named recorder argument."""

    try:
        signature = inspect.signature(function)
    except (TypeError, ValueError):
        return False
    parameter = signature.parameters.get(name)
    return parameter is not None or any(
        item.kind is inspect.Parameter.VAR_KEYWORD
        for item in signature.parameters.values()
    )


__all__ = ["JsonlWriter", "Recorder", "record", "record_run"]
