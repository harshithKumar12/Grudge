"""Pure Zeller delta debugging for the cassette shrinker.

This module deliberately knows nothing about cassettes or agents.  It takes a
sequence and a deterministic reproduction predicate, then returns a reduced
list together with the ordered attempts made while searching.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, TypeVar

ItemT = TypeVar("ItemT")
ProgressEvent = dict[str, Any]
ProgressCallback = Callable[[ProgressEvent], None]


@dataclass(frozen=True, slots=True)
class DdminStats:
    """Deterministic accounting and history for one ddmin invocation."""

    attempts: int
    reductions: int
    test_calls: int
    granularity: int
    budget_exhausted: bool
    history: tuple[ProgressEvent, ...]

    @property
    def calls(self) -> int:
        """Compatibility alias for the number of predicate calls."""

        return self.test_calls

    def __getitem__(self, key: str) -> Any:
        """Allow stats to be consumed like the small mapping it represents."""

        if key == "calls":
            return self.test_calls
        return getattr(self, key)

    def get(self, key: str, default: Any = None) -> Any:
        """Return a field without requiring callers to know the dataclass API."""

        try:
            return self[key]
        except AttributeError:
            return default

    def as_dict(self) -> dict[str, Any]:
        """Return JSON-compatible stats for event and report consumers."""

        return {
            "attempts": self.attempts,
            "reductions": self.reductions,
            "test_calls": self.test_calls,
            "calls": self.test_calls,
            "granularity": self.granularity,
            "budget_exhausted": self.budget_exhausted,
            "history": [dict(event) for event in self.history],
        }


def _jsonish(value: Any) -> Any:
    """Keep progress history serializable for cassette-entry viewers."""

    dump = getattr(value, "model_dump", None)
    if callable(dump):
        return dump(mode="json")
    if isinstance(value, list):
        return [_jsonish(item) for item in value]
    if isinstance(value, tuple):
        return [_jsonish(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonish(item) for key, item in value.items()}
    return value


def _partitions(items: list[ItemT], granularity: int) -> list[list[ItemT]]:
    """Split ``items`` into deterministic, contiguous, non-empty chunks."""

    count = min(max(granularity, 1), len(items))
    quotient, remainder = divmod(len(items), count)
    partitions: list[list[ItemT]] = []
    start = 0
    for index in range(count):
        width = quotient + (1 if index < remainder else 0)
        partitions.append(items[start : start + width])
        start += width
    return partitions


def _event(
    removed: list[ItemT], kept: bool, size_before: int, size_after: int
) -> ProgressEvent:
    """Build one stable progress record."""

    return {
        "attempted_removal": [_jsonish(item) for item in removed],
        "kept": kept,
        "size_before": size_before,
        "size_after": size_after,
    }


def minimize(
    items: Sequence[ItemT],
    test: Callable[[list[ItemT]], bool],
    *,
    progress: ProgressCallback | None = None,
    progress_callback: ProgressCallback | None = None,
    on_progress: ProgressCallback | None = None,
    max_attempts: int | None = None,
    max_calls: int | None = None,
) -> tuple[list[ItemT], DdminStats]:
    """Return a 1-minimal subsequence that still satisfies ``test``.

    The implementation follows Zeller's algorithm: start with two chunks,
    test each chunk before its complement, and double the granularity when a
    pass makes no progress.  A successful reduction resets granularity toward
    two.  ``test`` receives a fresh list for every candidate and is never
    allowed to mutate the working list through the public API.

    ``progress``, ``progress_callback``, and ``on_progress`` are aliases;
    supplying more than one is an error.  A budget is optional and only
    affects calls when explicitly set.
    Without a budget, termination checks every singleton removal and is thus
    1-minimal.  A budget-limited result is reported through
    :attr:`DdminStats.budget_exhausted`.
    """

    callbacks = [
        callback
        for callback in (progress, progress_callback, on_progress)
        if callback is not None
    ]
    if len(callbacks) > 1:
        raise TypeError("provide only one progress callback")
    callback = callbacks[0] if callbacks else None
    if max_attempts is not None and max_attempts < 0:
        raise ValueError("max_attempts must be non-negative")
    if max_calls is not None and max_calls < 0:
        raise ValueError("max_calls must be non-negative")
    if max_attempts is not None and max_calls is not None:
        if max_attempts != max_calls:
            raise ValueError("max_attempts and max_calls disagree")
    budget = max_attempts if max_attempts is not None else max_calls

    current = list(items)
    history: list[ProgressEvent] = []
    attempts = 0
    reductions = 0
    granularity = 2 if len(current) > 1 else len(current)
    budget_exhausted = False

    def try_candidate(candidate: list[ItemT], removed: list[ItemT]) -> bool:
        nonlocal attempts, reductions, budget_exhausted, current
        if budget is not None and attempts >= budget:
            budget_exhausted = True
            return False
        size_before = len(current)
        attempts += 1
        kept = bool(test(list(candidate)))
        event = _event(
            removed,
            kept,
            size_before,
            len(candidate) if kept else size_before,
        )
        history.append(event)
        if callback is not None:
            callback(dict(event))
        if kept:
            current = candidate
            reductions += 1
        return kept

    while len(current) > 1 and not budget_exhausted:
        granularity = min(max(granularity, 2), len(current))
        partitions = _partitions(current, granularity)
        reduced = False

        # First try retaining each partition (removing its complement).
        for index, subset in enumerate(partitions):
            removed = [
                item
                for part_index, part in enumerate(partitions)
                if part_index != index
                for item in part
            ]
            if try_candidate(list(subset), removed):
                granularity = max(granularity - 1, 2)
                reduced = True
                break
            if budget_exhausted:
                break
        if reduced or budget_exhausted:
            continue

        # Then try retaining each complement (removing the partition).
        for index, subset in enumerate(partitions):
            complement = [
                item
                for part_index, part in enumerate(partitions)
                if part_index != index
                for item in part
            ]
            if try_candidate(complement, list(subset)):
                granularity = max(granularity - 1, 2)
                reduced = True
                break
            if budget_exhausted:
                break
        if reduced or budget_exhausted:
            continue

        if granularity >= len(current):
            break
        granularity = min(len(current), granularity * 2)

    stats = DdminStats(
        attempts=attempts,
        reductions=reductions,
        test_calls=attempts,
        granularity=granularity,
        budget_exhausted=budget_exhausted,
        history=tuple(dict(event) for event in history),
    )
    return current, stats


def ddmin(
    items: Sequence[ItemT],
    test: Callable[[list[ItemT]], bool],
    **kwargs: Any,
) -> tuple[list[ItemT], DdminStats]:
    """Explicit algorithm name; an alias of :func:`minimize`."""

    return minimize(items, test, **kwargs)


__all__ = ["DdminStats", "ProgressEvent", "ddmin", "minimize"]
