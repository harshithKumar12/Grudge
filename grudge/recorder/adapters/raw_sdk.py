"""Typed boundary for recording plain SDK tool-calling loops.

The adapter intentionally accepts the small mapping-shaped events commonly
produced by SDK wrappers.  It keeps SDK-specific response classes out of the
recorder while preserving the loop's original event order.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from typing import Any, TypeAlias, cast

from grudge.recorder.recorder import Recorder
from grudge.schema.trace import Step

RawEvent: TypeAlias = Mapping[str, Any]
RawLoop: TypeAlias = Iterable[RawEvent] | Callable[[], Iterable[RawEvent]]


def record_raw_sdk(recorder: Recorder, events: RawLoop) -> list[Step]:
    """Record raw SDK events or the result of a zero-argument event loop.

    Events use ``kind`` (or the equivalent ``type``) with one of the Phase 1
    values: ``model_call``, ``tool_call``, ``tool_result``, ``state_diff``, or
    ``final_answer``.  Event-specific fields are passed through to the typed
    recorder methods, and the returned list contains the newly recorded steps.
    """

    source = events() if callable(events) else events
    recorded: list[Step] = []
    for event in source:
        kind = event.get("kind", event.get("type"))
        if not isinstance(kind, str):
            raise ValueError("raw SDK event must include a string kind")
        if kind == "model_call":
            step = cast(
                Step,
                recorder.record_model_call(
                    model=_optional_str(event, "model"),
                    messages=_optional_messages(event.get("messages")),
                    prompt=_optional_str(event, "prompt"),
                    response=event.get("response"),
                    parent_idx=_optional_int(event, "parent_idx"),
                    meta=_optional_mapping(event.get("meta")),
                ),
            )
        elif kind == "tool_call":
            args = event.get("args", event.get("arguments", {}))
            step = cast(
                Step,
                recorder.record_tool_call(
                    _required_str(event, "tool", alternative="name"),
                    _required_mapping(args, "tool call args"),
                    _optional_str(event, "call_id"),
                    parent_idx=_optional_int(event, "parent_idx"),
                    meta=_optional_mapping(event.get("meta")),
                ),
            )
        elif kind == "tool_result":
            step = cast(
                Step,
                recorder.record_tool_result(
                    _required_str(event, "call_id", alternative="tool_call_id"),
                    event.get("content"),
                    _optional_str(event, "error"),
                    parent_idx=_optional_int(event, "parent_idx"),
                    meta=_optional_mapping(event.get("meta")),
                ),
            )
        elif kind == "state_diff":
            step = cast(
                Step,
                recorder.record_state_diff(
                    _required_mapping(event.get("diff", {}), "state diff"),
                    parent_idx=_optional_int(event, "parent_idx"),
                    meta=_optional_mapping(event.get("meta")),
                ),
            )
        elif kind == "final_answer":
            step = cast(
                Step,
                recorder.record_final_answer(
                    _optional_str(event, "answer"),
                    parent_idx=_optional_int(event, "parent_idx"),
                    meta=_optional_mapping(event.get("meta")),
                ),
            )
        else:
            raise ValueError(f"unsupported raw SDK event kind: {kind}")
        recorded.append(step)
    return recorded


def _required_str(
    event: RawEvent,
    key: str,
    *,
    alternative: str | None = None,
) -> str:
    """Read a required string field, with an SDK naming alias."""

    value = event.get(key)
    if value is None and alternative is not None:
        value = event.get(alternative)
    if not isinstance(value, str) or not value:
        label = f"{key}/{alternative}" if alternative else key
        raise ValueError(f"raw SDK event requires non-empty string {label}")
    return value


def _optional_str(event: RawEvent, key: str) -> str | None:
    """Read an optional string field."""

    value = event.get(key)
    if value is not None and not isinstance(value, str):
        raise ValueError(f"raw SDK event field {key} must be a string")
    return value


def _optional_int(event: RawEvent, key: str) -> int | None:
    """Read an optional integer field."""

    value = event.get(key)
    invalid = value is not None and (
        isinstance(value, bool) or not isinstance(value, int)
    )
    if invalid:
        raise ValueError(f"raw SDK event field {key} must be an integer")
    return value


def _optional_mapping(value: Any) -> Mapping[str, Any] | None:
    """Read an optional mapping field."""

    if value is not None and not isinstance(value, Mapping):
        raise ValueError("raw SDK event metadata must be a mapping")
    return value


def _required_mapping(value: Any, label: str) -> Mapping[str, Any]:
    """Read a required mapping field."""

    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be a mapping")
    return value


def _optional_messages(value: Any) -> list[dict[str, Any]] | None:
    """Validate the Phase 1 message-list shape without SDK dependencies."""

    if value is None:
        return None
    valid = isinstance(value, list) and all(isinstance(item, dict) for item in value)
    if not valid:
        raise ValueError("raw SDK event messages must be a list of mappings")
    return cast(list[dict[str, Any]], value)


__all__ = ["RawEvent", "RawLoop", "record_raw_sdk"]
