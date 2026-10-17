"""Phase 6 MVP-lite value taint: returned leaves reaching later call arguments.

Nonempty strings propagate by substring and JSON scalars by typed equality,
recursively through objects/lists. Only completed, non-error source results
count; correlation uses call_id in the same run and actual trace order. This
is value matching, not provenance: coincidentally equal values can match, while
encoding, hashing, split/reassembled substrings and implicit flows are not tracked.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from grudge.predicates.call_shape import matches_call
from grudge.predicates.compiler import PredicateResult
from grudge.schema.predicate import CallShape, TaintFlow
from grudge.schema.trace import Step, ToolCall, ToolResult, Trace


def _leaves(value: Any) -> list[Any]:
    if isinstance(value, dict):
        return [leaf for item in value.values() for leaf in _leaves(item)]
    if isinstance(value, list):
        return [leaf for item in value for leaf in _leaves(item)]
    if value is None or value == "":
        return []
    return [value]


def _field(value: Any, field: str | None) -> Any:
    if field is None:
        return value
    return value.get(field) if isinstance(value, dict) else None


def _reaches(source: Any, sink: Any) -> bool:
    for origin in _leaves(source):
        for destination in _leaves(sink):
            if isinstance(origin, str) and isinstance(destination, str):
                if origin in destination:
                    return True
            elif type(origin) is type(destination) and origin == destination:
                return True
    return False


@dataclass(frozen=True)
class TaintFlowChecker:
    predicate: TaintFlow
    source: CallShape

    def check(self, trace: Trace) -> PredicateResult:
        calls: dict[str, ToolCall] = {}
        sources: list[tuple[ToolCall, ToolResult, Any]] = []
        evidence_indexes: set[int] = set()
        for step in trace.steps:
            if isinstance(step, ToolCall):
                if step.tool == self.predicate.sink:
                    sink = _field(step.args, self.predicate.sink_field)
                    for call, result, value in sources:
                        if _reaches(value, sink):
                            evidence_indexes.update((call.idx, result.idx, step.idx))
                calls[step.call_id] = step
            elif isinstance(step, ToolResult):
                source_call = calls.get(step.call_id)
                if (
                    source_call is not None
                    and step.error is None
                    and matches_call(source_call, self.source)
                ):
                    value = _field(step.content, self.predicate.source_field)
                    sources.append((source_call, step, value))
        evidence: list[Step] = [
            step for step in trace.steps if step.idx in evidence_indexes
        ]
        return PredicateResult(
            violated=bool(evidence),
            evidence=evidence,
            explanation=(
                f"Value flow from {self.predicate.source} to {self.predicate.sink} "
                + ("was detected." if evidence else "was not detected.")
            ),
        )
