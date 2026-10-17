"""Deterministic failure-reproduction oracles for cassette shrinking.

The oracle is the seam between the pure shrink search and Phase 4 replay.  A
candidate cassette is evaluated by running the live policy in the hermetic
sandbox and asking a small, deterministic seed predicate whether the failure
is still present.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from grudge.errors import OracleError
from grudge.replay.sandbox import run_agent
from grudge.schema.cassette import Cassette
from grudge.schema.predicate import (
    CallShape,
    Outcome,
    PredicateSet,
    TaintFlow,
)
from grudge.schema.trace import ToolResult, Trace


@dataclass(frozen=True)
class OracleResult:
    """The result of one candidate evaluation."""

    reproduced: bool
    trace: Trace | None
    reason: str


@runtime_checkable
class Oracle(Protocol):
    """Protocol implemented by objects that can test a cassette candidate."""

    calls: int
    cache_hits: int

    def reproduces(self, cassette: Cassette) -> OracleResult:
        """Return whether ``cassette`` still reproduces the seed failure."""


SeedPredicate = Callable[[Trace], bool] | CallShape | TaintFlow | Outcome | PredicateSet


def _value_contains(value: Any, needle: Any) -> bool:
    """Return whether ``needle`` occurs in a JSON-like value."""

    if needle is None:
        return False
    if isinstance(value, Mapping):
        return any(_value_contains(item, needle) for item in value.values())
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return any(_value_contains(item, needle) for item in value)
    if isinstance(needle, str):
        return needle in str(value)
    return bool(value == needle)


def _field(value: Any, name: str | None) -> Any:
    """Read an optional field from a mapping, leaving scalar results intact."""

    if name is None:
        return value
    if isinstance(value, Mapping):
        return value.get(name)
    return None


def _schema_predicate(predicate: Any, trace: Trace) -> bool:
    """Evaluate the Phase 1 predicate shapes used by the seed detectors."""

    if isinstance(predicate, CallShape):
        return any(
            step.tool == predicate.tool
            and all(
                step.args.get(key) == value for key, value in predicate.args.items()
            )
            for step in trace.tool_calls()
        )
    if isinstance(predicate, TaintFlow):
        calls = trace.tool_calls()
        results = {
            step.call_id: step for step in trace.steps if isinstance(step, ToolResult)
        }
        for source_index, source_call in enumerate(calls):
            if source_call.tool != predicate.source:
                continue
            source_result = results.get(source_call.call_id)
            if source_result is None:
                continue
            source_value = _field(source_result.content, predicate.source_field)
            for sink_call in calls[source_index + 1 :]:
                if sink_call.tool != predicate.sink:
                    continue
                sink_value = _field(sink_call.args, predicate.sink_field)
                if _value_contains(sink_value, source_value):
                    return True
        return False
    if isinstance(predicate, Outcome):
        return trace.outcome == predicate.outcome
    if isinstance(predicate, PredicateSet):
        values = [_schema_predicate(item, trace) for item in predicate.predicates]
        if predicate.kind == "all_of":
            return all(values)
        if predicate.kind == "any_of":
            return any(values)
        return not values[0]
    raise TypeError(f"unsupported seed predicate: {type(predicate).__name__}")


def _evaluate(predicate: Any, trace: Trace, cassette: Cassette) -> bool:
    """Evaluate a callable, schema predicate, or small checker-like object."""

    if isinstance(predicate, CallShape | TaintFlow | Outcome | PredicateSet):
        return _schema_predicate(predicate, trace)
    checker = getattr(predicate, "check", None)
    if callable(checker):
        result = checker(trace)
        return bool(getattr(result, "violated", result))
    evaluator = getattr(predicate, "evaluate", None)
    if callable(evaluator):
        result = evaluator(trace)
        return bool(getattr(result, "violated", result))
    if not callable(predicate):
        raise TypeError(f"unsupported seed predicate: {type(predicate).__name__}")
    try:
        parameters = dict(inspect.signature(predicate).parameters)
    except (TypeError, ValueError):
        parameters = {}
    positional = [
        parameter
        for parameter in parameters.values()
        if parameter.kind
        in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    if len(positional) >= 2:
        return bool(predicate(trace, cassette))
    return bool(predicate(trace))


class PredicateOracle:
    """Run an agent in the replay sandbox and memoize predicate outcomes."""

    def __init__(
        self,
        agent_fn: Callable[..., Any],
        seed_predicate: SeedPredicate | Any,
        *,
        llm: Any = None,
        repeats: int = 1,
        max_oracle_calls: int | None = 1000,
        timeout: float = 2.0,
        max_steps: int = 128,
    ) -> None:
        if repeats < 1:
            raise ValueError("repeats must be at least 1")
        if max_oracle_calls is not None and max_oracle_calls < 1:
            raise ValueError("max_oracle_calls must be at least 1")
        if timeout <= 0 or max_steps < 0:
            raise ValueError("timeout must be positive and max_steps non-negative")
        self.agent_fn = agent_fn
        self.seed_predicate = seed_predicate
        self.llm = llm
        self.repeats = repeats
        self.max_oracle_calls = max_oracle_calls
        self.timeout = timeout
        self.max_steps = max_steps
        self.calls = 0
        self.cache_hits = 0
        self._cache: dict[str, OracleResult] = {}

    def reproduces(self, cassette: Cassette) -> OracleResult:
        """Evaluate ``cassette`` once, or return its memoized result."""

        cache_key = cassette.content_hash
        cached = self._cache.get(cache_key)
        if cached is not None:
            self.cache_hits += 1
            return cached
        if self.max_oracle_calls is not None and self.calls >= self.max_oracle_calls:
            raise OracleError(
                "oracle call budget exhausted: "
                f"{self.calls} calls used, max_oracle_calls="
                f"{self.max_oracle_calls}"
            )

        self.calls += 1
        traces: list[Trace] = []
        failures: list[str] = []
        reproduced_runs = 0
        for _ in range(self.repeats):
            trace = run_agent(
                self.agent_fn,
                cassette,
                self.llm,
                timeout=self.timeout,
                max_steps=self.max_steps,
            )
            traces.append(trace)
            try:
                reproduced = _evaluate(self.seed_predicate, trace, cassette)
            except Exception as exc:
                reproduced = False
                failures.append(f"predicate error: {type(exc).__name__}: {exc}")
            if reproduced:
                reproduced_runs += 1
            if not reproduced:
                continue

        if failures:
            reason = failures[0]
        else:
            run_summary = f"{reproduced_runs}/{self.repeats}"
            reason = f"seed predicate reproduced in {run_summary} runs"
        result = OracleResult(
            reproduced_runs == self.repeats,
            traces[0] if traces else None,
            reason,
        )
        self._cache[cache_key] = result
        return result


__all__ = ["Oracle", "OracleResult", "PredicateOracle", "SeedPredicate"]
