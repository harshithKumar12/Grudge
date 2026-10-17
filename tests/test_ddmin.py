from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from grudge.shrinker.ddmin import ddmin, minimize


def test_single_culprit_is_retained() -> None:
    items = ["noise-a", "culprit", "noise-b", "noise-c"]

    minimal, stats = minimize(items, lambda candidate: "culprit" in candidate)

    assert minimal == ["culprit"]
    assert stats.reductions > 0
    assert stats.history


def test_interacting_culprits_must_stay_together() -> None:
    items = ["a", "b", "noise-a", "noise-b"]

    minimal, _ = ddmin(
        items,
        lambda candidate: "a" in candidate and "b" in candidate,
    )

    assert minimal == ["a", "b"]


def test_pair_co_occurrence_does_not_keep_unrelated_items() -> None:
    items = ["first", "second", "third", "fourth"]

    minimal, _ = minimize(
        items,
        lambda candidate: {"first", "third"}.issubset(candidate),
    )

    assert minimal == ["first", "third"]


def test_result_is_one_minimal_and_still_reproduces() -> None:
    items = ["keep-a", "keep-b", "discard"]

    def test(candidate: list[str]) -> bool:
        return {"keep-a", "keep-b"}.issubset(candidate)

    minimal, _ = minimize(items, test)

    assert test(minimal)
    assert all(
        not test(minimal[:index] + minimal[index + 1 :])
        for index in range(len(minimal))
    )


def test_history_and_callback_are_deterministic() -> None:
    items = ["a", "b", "c", "d"]

    def test(candidate: list[str]) -> bool:
        return "c" in candidate and "d" in candidate

    first_events: list[dict[str, object]] = []
    second_events: list[dict[str, object]] = []

    first, first_stats = minimize(items, test, progress=first_events.append)
    second, second_stats = minimize(items, test, progress_callback=second_events.append)

    assert first == second == ["c", "d"]
    assert first_events == second_events == list(first_stats.history)
    assert first_stats.as_dict() == second_stats.as_dict()
    assert all(
        set(event) == {"attempted_removal", "kept", "size_before", "size_after"}
        for event in first_events
    )


def test_attempt_budget_is_reported_without_changing_callback_shape() -> None:
    events: list[dict[str, object]] = []

    minimal, stats = minimize(
        ["a", "b", "c"],
        lambda candidate: False,
        progress=events.append,
        max_attempts=1,
    )

    assert minimal == ["a", "b", "c"]
    assert stats.budget_exhausted
    assert stats.attempts == stats.calls == 1
    assert len(events) == 1


@given(
    st.lists(st.integers(min_value=0, max_value=8), min_size=1, max_size=8),
)
def test_hypothesis_result_is_one_minimal(items: list[int]) -> None:
    required = items[0]

    def test(candidate: list[int]) -> bool:
        return required in candidate

    minimal, _ = minimize(items, test)

    assert test(minimal)
    assert all(
        not test(minimal[:index] + minimal[index + 1 :])
        for index in range(len(minimal))
    )
