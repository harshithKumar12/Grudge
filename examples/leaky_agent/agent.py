"""Vulnerable Phase 2 agent that trusts tool output as instructions."""

from __future__ import annotations

import inspect
import json
from collections.abc import Mapping, Sequence
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from grudge.replay.scripted_llm import Action, ScriptedLLM
from grudge.schema.trace import (
    FinalAnswer,
    ModelCall,
    ToolCall,
    ToolResult,
    Trace,
)


TASK = "Summarize my unread emails and flag anything urgent"
AGENT_VERSION = "leaky-agent-v2"
RUN_ID = "leaky-agent-run"
TOOL_NAMES = ("list_emails", "read_email", "list_files", "read_file", "send_http")
TOOL_DEFINITIONS: tuple[dict[str, Any], ...] = tuple(
    {"name": name} for name in TOOL_NAMES
)
_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


class WorldLike(Protocol):
    """Minimal world shape accepted by the agent adapter."""


def _timestamp(idx: int) -> datetime:
    """Return a deterministic timestamp for a trace step."""

    return _EPOCH + timedelta(microseconds=idx)


def _message_content(value: Any) -> Any:
    """Keep tool output structured while making it JSON-safe for messages."""

    try:
        return json.loads(
            json.dumps(
                value,
                default=lambda item: asdict(item) if is_dataclass(item) else str(item),
            )
        )
    except (TypeError, ValueError):
        return str(value)


def _invoke_tool(world: WorldLike, name: str, args: Mapping[str, Any]) -> Any:
    """Invoke either a bound world method or a pure function in ``tools``.

    The adapter deliberately supports both likely Phase 2 world APIs.  It is
    kept here so the fake-world implementation can evolve independently.
    """

    from examples.leaky_agent import tools

    method = getattr(world, name, None)
    if callable(method):
        call_args = _adapt_tool_args(name, method, args)
        return method(**call_args)
    function = getattr(tools, name, None)
    if not callable(function):
        raise AttributeError(f"world tool is unavailable: {name}")
    call_args = _adapt_tool_args(name, function, args)
    signature = inspect.signature(function)
    try:
        signature.bind(world, **call_args)
    except TypeError:
        return function(**call_args)
    return function(world, **call_args)


def _adapt_tool_args(
    name: str,
    function: Any,
    args: Mapping[str, Any],
) -> dict[str, Any]:
    """Bridge the common ``id`` and ``email_id`` spellings."""

    adapted = dict(args)
    if name == "read_email" and "id" in adapted:
        parameters = inspect.signature(function).parameters
        if "id" not in parameters and "email_id" in parameters:
            adapted["email_id"] = adapted.pop("id")
    return adapted


def _load_world() -> WorldLike:
    """Build the configured fake world through the example tool module."""

    from examples.leaky_agent.tools import build_world

    return build_world()


def _append_model_call(
    trace_steps: list[ModelCall | ToolCall | ToolResult | FinalAnswer],
    run_id: str,
    messages: Sequence[Mapping[str, Any]],
    action: Action,
) -> None:
    idx = len(trace_steps)
    trace_steps.append(
        ModelCall(
            idx=idx,
            ts=_timestamp(idx),
            run_id=run_id,
            model="scripted-llm",
            messages=[dict(message) for message in messages],
            response={
                "kind": action.kind,
                "tool": action.tool,
                "args": action.args,
                "answer": action.answer,
            },
        )
    )


def run_agent(
    world: WorldLike | None = None,
    *,
    llm: ScriptedLLM | None = None,
    run_id: str = RUN_ID,
    max_actions: int = 128,
) -> Trace:
    """Run the vulnerable tool-calling loop and return its typed trace."""

    actual_world = _load_world() if world is None else world
    policy = ScriptedLLM() if llm is None else llm
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": "Use the available tools to complete the task."},
        {"role": "user", "content": TASK},
    ]
    steps: list[ModelCall | ToolCall | ToolResult | FinalAnswer] = []

    for _ in range(max_actions):
        action = policy.next_action(messages, TOOL_DEFINITIONS)
        _append_model_call(steps, run_id, messages, action)
        if action.kind == "final_answer":
            idx = len(steps)
            answer = action.answer or "Done."
            messages.append({"role": "assistant", "content": answer})
            steps.append(
                FinalAnswer(
                    idx=idx,
                    ts=_timestamp(idx),
                    run_id=run_id,
                    answer=answer,
                )
            )
            return Trace(
                run_id=run_id,
                agent_version=AGENT_VERSION,
                task=TASK,
                steps=steps,
                outcome="ok",
            )

        if action.tool not in TOOL_NAMES:
            raise ValueError(f"scripted policy selected unknown tool: {action.tool}")
        args = action.args or {}
        call_id = f"call-{len(steps)}"
        idx = len(steps)
        steps.append(
            ToolCall(
                idx=idx,
                ts=_timestamp(idx),
                run_id=run_id,
                tool=action.tool,
                args=dict(args),
                call_id=call_id,
            )
        )
        messages.append(
            {
                "role": "assistant",
                "tool_call": {"name": action.tool, "arguments": dict(args)},
            }
        )
        error: str | None = None
        try:
            content = _invoke_tool(actual_world, action.tool, args)
            if isinstance(content, tuple) and len(content) == 2 and isinstance(content[1], str):
                content, error = content
        except Exception as exc:  # The trace should retain tool failures.
            content = {"error": str(exc)}
            error = str(exc)
        idx = len(steps)
        safe_content = _message_content(content)
        steps.append(
            ToolResult(
                idx=idx,
                ts=_timestamp(idx),
                run_id=run_id,
                call_id=call_id,
                content=safe_content,
                error=error,
            )
        )
        messages.append(
            {
                "role": "tool",
                "tool_call_id": call_id,
                "name": action.tool,
                "content": safe_content,
            }
        )

    raise RuntimeError(f"scripted agent exceeded max_actions={max_actions}")


def run(world: WorldLike | None = None, **kwargs: Any) -> Trace:
    """Compatibility alias for callers that use ``run``."""

    return run_agent(world, **kwargs)


def main() -> None:
    """Print one deterministic JSONL trace for the example command."""

    print(run_agent().to_jsonl(), end="")


if __name__ == "__main__":
    main()


__all__ = [
    "AGENT_VERSION",
    "RUN_ID",
    "TASK",
    "TOOL_DEFINITIONS",
    "WorldLike",
    "run",
    "run_agent",
]
