"""Typed event contracts and the in-process bus used by the Phase 10 demo.

The demo emits immutable, JSON-friendly Pydantic events.  The bus keeps a
bounded-by-lifetime replay history and invokes subscribers synchronously, so
the orchestrator remains deterministic and the local HTTP server can replay
events to late viewers without owning any pipeline state.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from threading import RLock
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field


class DemoEvent(BaseModel):
    """Base event with a stable stream sequence assigned by :class:`EventBus`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: str
    seq: int = Field(default=0, ge=0)


class DemoStarted(DemoEvent):
    """The five-beat demo has started."""

    type: Literal["demo.started"] = "demo.started"


class BeatStarted(DemoEvent):
    """A named beat has started."""

    type: Literal["beat.started"] = "beat.started"
    n: int = Field(ge=1, le=5)
    title: str = Field(min_length=1)


class TraceStep(DemoEvent):
    """One step from the vulnerable capture trace."""

    type: Literal["trace.step"] = "trace.step"
    idx: int = Field(ge=0)
    kind: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    status: Literal["ok", "failed"]


class TraceOutcome(DemoEvent):
    """The captured trace's leak outcome."""

    type: Literal["trace.outcome"] = "trace.outcome"
    leaked: bool


class ShrinkStarted(DemoEvent):
    """Cassette reduction has started."""

    type: Literal["shrink.started"] = "shrink.started"
    total: int = Field(ge=0)


class ShrinkAttempt(DemoEvent):
    """One deterministic shrink candidate was evaluated."""

    type: Literal["shrink.attempt"] = "shrink.attempt"
    removed: int = Field(ge=0)
    kept: bool
    remaining: int = Field(ge=0)


class ShrinkDone(DemoEvent):
    """Cassette reduction reached its final candidate."""

    type: Literal["shrink.done"] = "shrink.done"
    before: int = Field(ge=0)
    after: int = Field(ge=0)
    bytes: int = Field(ge=0)


class PredicateSynthesized(DemoEvent):
    """A predicate and its human-readable explanation are ready."""

    type: Literal["predicate.synthesized"] = "predicate.synthesized"
    dsl: str = Field(min_length=1)
    english: str = Field(min_length=1)
    source: Literal["llm", "cache", "fallback"]


class AdmissionResult(DemoEvent):
    """Admission proof result, including the red/green proof colors."""

    type: Literal["admission.result"] = "admission.result"
    admitted: bool
    reasons: list[str] = Field(default_factory=list)
    bad: Literal["red", "green"]
    good: Literal["red", "green"]


class GateResult(DemoEvent):
    """Wilson-gated result for one agent."""

    type: Literal["gate.result"] = "gate.result"
    agent: str = Field(min_length=1)
    passes: int = Field(ge=0)
    n: int = Field(ge=1)
    wilson: float = Field(ge=0, le=1)
    threshold: float = Field(ge=0, le=1)
    passed: bool


class RegressionDetected(DemoEvent):
    """The reintroduced vulnerable agent was blocked by the admitted Scar."""

    type: Literal["regression.detected"] = "regression.detected"
    markdown: str = Field(min_length=1)


class DemoFinished(DemoEvent):
    """The five-beat event stream completed."""

    type: Literal["demo.finished"] = "demo.finished"


DemoEventUnion: TypeAlias = Annotated[
    DemoStarted
    | BeatStarted
    | TraceStep
    | TraceOutcome
    | ShrinkStarted
    | ShrinkAttempt
    | ShrinkDone
    | PredicateSynthesized
    | AdmissionResult
    | GateResult
    | RegressionDetected
    | DemoFinished,
    Field(discriminator="type"),
]
Event: TypeAlias = DemoEventUnion
EventCallback: TypeAlias = Callable[[DemoEvent], None]


class EventBus:
    """Synchronous event publisher with a replayable in-memory history."""

    def __init__(self) -> None:
        self._events: list[DemoEvent] = []
        self._subscribers: list[EventCallback] = []
        self._lock = RLock()

    def publish(self, event: DemoEvent) -> DemoEvent:
        """Assign the next sequence, retain, and synchronously broadcast ``event``."""

        callbacks: list[EventCallback]
        with self._lock:
            sequenced = event.model_copy(update={"seq": len(self._events) + 1})
            self._events.append(sequenced)
            callbacks = list(self._subscribers)
        for callback in callbacks:
            callback(sequenced)
        return sequenced

    def subscribe(self, callback: EventCallback) -> Callable[[], None]:
        """Register a callback and return an idempotent unsubscribe function."""

        with self._lock:
            self._subscribers.append(callback)
        removed = False

        def unsubscribe() -> None:
            nonlocal removed
            if removed:
                return
            with self._lock:
                if callback in self._subscribers:
                    self._subscribers.remove(callback)
                removed = True

        return unsubscribe

    def snapshot(self) -> list[DemoEvent]:
        """Return a detached copy of all events published so far."""

        with self._lock:
            return [event.model_copy(deep=True) for event in self._events]

    def clear(self) -> None:
        """Clear the replay history before a new run."""

        with self._lock:
            self._events.clear()

    def __iter__(self) -> Iterator[DemoEvent]:
        return iter(self.snapshot())


InProcessEventBus = EventBus


def publish_event(event: DemoEvent, bus: EventBus | None = None) -> DemoEvent:
    """Publish ``event`` to ``bus`` (or a fresh bus for small integrations)."""

    return (bus or EventBus()).publish(event)


__all__ = [
    "AdmissionResult",
    "BeatStarted",
    "DemoEvent",
    "DemoEventUnion",
    "DemoFinished",
    "DemoStarted",
    "Event",
    "EventBus",
    "GateResult",
    "InProcessEventBus",
    "PredicateSynthesized",
    "RegressionDetected",
    "ShrinkAttempt",
    "ShrinkDone",
    "ShrinkStarted",
    "TraceOutcome",
    "TraceStep",
    "publish_event",
]
