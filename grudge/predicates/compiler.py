"""Phase 6 deterministic AST-to-checker boundary; no LLM or I/O is involved.

CallShape requires a matching call, Ordering requires a prior call at each
target, and TaintFlow prohibits a flow. Logical groups combine rule satisfaction
(not violation flags). Evidence always references the original trace objects.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from grudge.predicates.dsl import FilteredTaintFlow, PredicateAST, PredicateGroup
from grudge.schema.predicate import (
    CallShape,
    Ordering,
    Outcome,
    PredicateSet,
    TaintFlow,
)
from grudge.schema.trace import Step, Trace


class PredicateResult(BaseModel):
    """A rule verdict with exact supporting steps, never synthesized evidence."""

    model_config = ConfigDict(extra="forbid")
    violated: bool
    evidence: list[Step] = Field(default_factory=list)
    explanation: str


class Checker(Protocol):
    """A compiled rule that deterministically evaluates a trace."""

    def check(self, trace: Trace) -> PredicateResult: ...


@dataclass(frozen=True)
class _GroupChecker:
    kind: str
    children: tuple[Checker, ...]

    def check(self, trace: Trace) -> PredicateResult:
        results = [child.check(trace) for child in self.children]
        if self.kind == "not":
            violated = not results[0].violated
            selected = results
        elif self.kind == "all_of":
            violated = any(result.violated for result in results)
            selected = [r for r in results if r.violated == violated]
        else:
            violated = all(result.violated for result in results)
            selected = [r for r in results if r.violated == violated]
        indexes = {step.idx for result in selected for step in result.evidence}
        return PredicateResult(
            violated=violated,
            evidence=[step for step in trace.steps if step.idx in indexes],
            explanation=f"{self.kind}: " + " ".join(r.explanation for r in selected),
        )


def compile_predicate(predicate: PredicateAST) -> Checker:
    """Type-check and snapshot an AST; unsupported/ill-typed input is rejected.

    Outcome remains a roadmap stub and is rejected at compilation, rather than
    pretending to have checked a run. Use parse_predicate explicitly for text.
    """
    from grudge.predicates.call_shape import CallShapeChecker, validate_arguments
    from grudge.predicates.ordering import OrderingChecker
    from grudge.predicates.outcome import check_outcome
    from grudge.predicates.taint_flow import TaintFlowChecker

    if isinstance(predicate, CallShape):
        if not isinstance(predicate.tool, str) or not predicate.tool:
            raise TypeError("call tool must be a nonempty string")
        validate_arguments(predicate.args)
        return CallShapeChecker(predicate.model_copy(deep=True))
    if isinstance(predicate, Ordering):
        if not all(
            isinstance(v, str) and v for v in (predicate.before, predicate.after)
        ):
            raise TypeError("ordering tools must be nonempty strings")
        return OrderingChecker(predicate.model_copy(deep=True))
    if isinstance(predicate, FilteredTaintFlow):
        validate_arguments(predicate.source_args)
        flow = predicate.flow
        source_args = predicate.source_args
    elif isinstance(predicate, TaintFlow):
        flow = predicate
        source_args = {}
    elif isinstance(predicate, Outcome):
        check_outcome()
    elif isinstance(predicate, PredicateSet | PredicateGroup):
        if predicate.kind not in {"all_of", "any_of", "not"}:
            raise TypeError("unknown predicate group operator")
        if not predicate.predicates or (
            predicate.kind == "not" and len(predicate.predicates) != 1
        ):
            raise TypeError("groups require children; not requires exactly one")
        return _GroupChecker(
            predicate.kind, tuple(compile_predicate(p) for p in predicate.predicates)
        )
    else:
        raise TypeError(f"unsupported predicate type: {type(predicate).__name__}")
    if not all(isinstance(v, str) and v for v in (flow.source, flow.sink)):
        raise TypeError("taint tools must be nonempty strings")
    if any(
        v is not None and (not isinstance(v, str) or not v)
        for v in (flow.source_field, flow.sink_field)
    ):
        raise TypeError("taint fields must be nonempty strings or None")
    source = CallShape(tool=flow.source, args=source_args)
    return TaintFlowChecker(flow.model_copy(deep=True), source.model_copy(deep=True))
