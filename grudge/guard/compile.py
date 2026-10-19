"""Compile admitted Python Scars into the flat contract consumed by Node hooks.

The compiler is deterministic: it reads only admitted Scar JSON, converts the
three runtime predicate kinds into a small flat representation, sorts rules by
stable id, and writes canonical JSON.  Runtime evaluation here is intentionally
dependency-free so the shared conformance fixtures can exercise both languages.
"""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from grudge.schema.predicate import (
    CallShape,
    FilteredTaintFlow,
    Ordering,
    Predicate,
    PredicateSet,
    TaintFlow,
)
from grudge.schema.scar import Scar

SCHEMA_VERSION = 1


def _matches(value: Any, expected: Any) -> bool:
    """Match JSON values using the shared exact/contains/path operators."""

    if isinstance(expected, dict) and len(expected) == 1:
        operator, operand = next(iter(expected.items()))
        if operator == "$eq":
            return bool(value == operand)
        if operator == "$contains":
            return isinstance(value, str) and str(operand) in value
        if operator == "$under":
            return isinstance(value, str) and _under(value, str(operand))
        if operator == "$not_under":
            return isinstance(value, str) and not _under(value, str(operand))
    if isinstance(expected, dict):
        return isinstance(value, dict) and all(
            key in value and _matches(value[key], item)
            for key, item in expected.items()
        )
    return bool(value == expected)


def _under(path: str, root: str) -> bool:
    """Compare slash and Windows paths without allowing a prefix collision."""

    left = path.replace("\\", "/").rstrip("/")
    right = root.replace("\\", "/").rstrip("/")
    return left == right or left.startswith(right + "/")


def _values(value: Any) -> Iterable[Any]:
    if isinstance(value, Mapping):
        yield value
        for child in value.values():
            yield from _values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _values(child)
    else:
        yield value


def _event_value(event: Mapping[str, Any], field: str | None) -> Any:
    if field is None:
        return event.get("result")
    args = event.get("args")
    if isinstance(args, Mapping) and field in args:
        return args[field]
    return event.get(field)


def _rule_violations(
    rule: Mapping[str, Any], events: list[Mapping[str, Any]]
) -> list[int]:
    """Return zero-based event indexes that prove a rule violation."""

    kind = rule["kind"]
    if kind == "call_shape":
        tool = rule["tool"]
        match = rule.get("match", {})
        return [
            index
            for index, event in enumerate(events)
            if event.get("tool") == tool and _matches(event.get("args", {}), match)
        ]
    if kind == "ordering":
        ordering = rule["ordering"]
        seen_before = False
        violations: list[int] = []
        for index, event in enumerate(events):
            if event.get("tool") == ordering["before"]:
                seen_before = True
            elif event.get("tool") == ordering["after"] and not seen_before:
                violations.append(index)
        return violations
    if kind == "taint_flow":
        taint = rule["taint"]
        sources: list[Any] = []
        violations = []
        for index, event in enumerate(events):
            if event.get("tool") == taint["source"] and _matches(
                event.get("args", {}), taint.get("sourceMatch", {})
            ):
                sources.extend(_values(_event_value(event, taint.get("sourceField"))))
            if event.get("tool") == taint["sink"]:
                sink_value = _event_value(event, taint.get("sinkField"))
                if any(
                    source != ""
                    and source is not None
                    and source in list(_values(sink_value))
                    for source in sources
                ) or any(
                    isinstance(source, str)
                    and isinstance(sink_value, str)
                    and source in sink_value
                    for source in sources
                ):
                    violations.append(index)
        return violations
    raise ValueError(f"unsupported compiled rule kind: {kind}")


def evaluate_rule(
    rule: Mapping[str, Any], events: list[Mapping[str, Any]]
) -> dict[str, Any]:
    """Evaluate one compiled rule using the shared fixture result shape."""

    at_events = _rule_violations(rule, events)
    return {"violated": bool(at_events), "atEvents": at_events}


def _flatten(predicate: Predicate) -> tuple[str, dict[str, Any]]:
    if isinstance(predicate, CallShape):
        return "call_shape", {"tool": predicate.tool, "match": predicate.args}
    if isinstance(predicate, Ordering):
        return "ordering", {
            "tool": predicate.after,
            "ordering": {"before": predicate.before, "after": predicate.after},
            "match": {},
        }
    if isinstance(predicate, FilteredTaintFlow):
        flow = predicate.flow
        return "taint_flow", {
            "tool": flow.sink,
            "match": {},
            "taint": {
                "source": flow.source,
                "sink": flow.sink,
                "sourceField": flow.source_field,
                "sinkField": flow.sink_field,
                "sourceMatch": predicate.source_args,
            },
        }
    if isinstance(predicate, TaintFlow):
        return "taint_flow", {
            "tool": predicate.sink,
            "match": {},
            "taint": {
                "source": predicate.source,
                "sink": predicate.sink,
                "sourceField": predicate.source_field,
                "sinkField": predicate.sink_field,
                "sourceMatch": {},
            },
        }
    if (
        isinstance(predicate, PredicateSet)
        and predicate.kind == "not"
        and len(predicate.predicates) == 1
        and isinstance(predicate.predicates[0], CallShape)
    ):
        child = predicate.predicates[0]
        return "call_shape", {"tool": child.tool, "match": child.args}
    raise ValueError(
        f"predicate is not supported by runtime guard: {type(predicate).__name__}"
    )


def compile_scar(scar: Scar, *, created_from: str) -> dict[str, Any]:
    """Convert one admitted Scar to a schema-shaped runtime rule."""

    if scar.admission is None or not scar.admission.admitted:
        raise ValueError(f"Scar {scar.id!r} is not admitted")
    kind, fields = _flatten(scar.predicate)
    return {
        "id": scar.id,
        "mode": "block",
        "kind": kind,
        "tool": fields["tool"],
        "match": fields.get("match", {}),
        "ordering": fields.get("ordering", {"before": "", "after": ""}),
        "taint": fields.get("taint", {"source": "", "sink": ""}),
        "english": scar.predicate.describe(),
        "createdFrom": created_from,
    }


def compile_scars(
    scars: Iterable[Scar], *, created_from: str = "scar"
) -> dict[str, Any]:
    """Build a stable compiled payload from admitted Scars."""

    rules = [compile_scar(scar, created_from=created_from) for scar in scars]
    return {
        "version": SCHEMA_VERSION,
        "rules": sorted(rules, key=lambda item: item["id"]),
    }


def write_compiled(payload: Mapping[str, Any], destination: str | Path) -> Path:
    """Atomically write canonical compiled JSON, creating its parent."""

    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return target


def load_scars(directory: str | Path) -> list[Scar]:
    """Load all Scar files in stable filename order."""

    root = Path(directory)
    return [Scar.read(path) for path in sorted(root.glob("*.scar.json"))]


__all__ = [
    "compile_scar",
    "compile_scars",
    "evaluate_rule",
    "load_scars",
    "write_compiled",
]
