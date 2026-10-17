"""Phase 6 call matching: exact JSON subsets and explicit text/path operators.

Paths are compared lexically (including .. and separator normalization), without
filesystem access or symlink resolution. Missing arguments never match a filter.
"""

from __future__ import annotations

import math
import posixpath
from dataclasses import dataclass
from typing import Any

from grudge.predicates.compiler import PredicateResult
from grudge.schema.predicate import CallShape
from grudge.schema.trace import ToolCall, Trace

_OPERATORS = {"$eq", "$contains", "$under", "$not_under"}


def _json_value(value: Any) -> bool:
    if value is None or isinstance(value, str | bool | int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(k, str) and _json_value(v) for k, v in value.items())
    return False


def validate_arguments(arguments: dict[str, Any]) -> None:
    """Reject non-JSON values and malformed explicit operator expressions."""
    if not isinstance(arguments, dict):
        raise TypeError("call arguments must be a dictionary")
    for field, value in arguments.items():
        if not isinstance(field, str) or not field:
            raise TypeError("argument names must be nonempty strings")
        if not _json_value(value):
            raise TypeError(f"argument {field!r} must contain finite JSON values")
        if isinstance(value, dict) and any(key.startswith("$") for key in value):
            if len(value) != 1 or next(iter(value)) not in _OPERATORS:
                raise TypeError(f"argument {field!r} has an unknown/ambiguous operator")
            operator = next(iter(value))
            if operator != "$eq" and not isinstance(value[operator], str):
                raise TypeError(f"operator {operator} requires a string")
            if operator in {"$under", "$not_under"} and not value[operator]:
                raise TypeError("path root must not be empty")


def _equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) != isinstance(right, bool):
        return False
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(
            _equal(left[k], right[k]) for k in left
        )
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            _equal(a, b) for a, b in zip(left, right, strict=True)
        )
    return bool(left == right)


def _under(path: str, root: str) -> bool:
    path = posixpath.normpath(path.replace("\\", "/"))
    root = posixpath.normpath(root.replace("\\", "/"))
    if root == ".":
        return not (
            path.startswith(("/", "../")) or path == ".." or ":" in path.split("/")[0]
        )
    return path == root or path.startswith(root.rstrip("/") + "/")


def _matches(value: Any, expected: Any) -> bool:
    if isinstance(expected, dict) and len(expected) == 1:
        operator = next(iter(expected))
        operand = expected[operator]
        if operator == "$eq":
            return _equal(value, operand)
        if operator in {"$contains", "$under", "$not_under"}:
            if not isinstance(value, str):
                return False
            if operator == "$contains":
                return operand in value
            inside = _under(value, operand)
            return not inside if operator == "$not_under" else inside
    return _equal(value, expected)


def matches_call(call: ToolCall, predicate: CallShape) -> bool:
    """Match tool name and supplied arguments; unspecified arguments are allowed."""
    return call.tool == predicate.tool and all(
        field in call.args and _matches(call.args[field], expected)
        for field, expected in predicate.args.items()
    )


@dataclass(frozen=True)
class CallShapeChecker:
    predicate: CallShape

    def check(self, trace: Trace) -> PredicateResult:
        matches = [
            call for call in trace.tool_calls() if matches_call(call, self.predicate)
        ]
        return PredicateResult(
            violated=not matches,
            evidence=list(matches),
            explanation=(
                f"Found {len(matches)} matching call(s) to {self.predicate.tool}."
                if matches
                else f"Required call to {self.predicate.tool} was not found."
            ),
        )
