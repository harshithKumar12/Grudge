"""Focused tests for Phase 8 Wilson lower-bound statistics."""

import math

import pytest

from grudge.gate.wilson import wilson_lower_bound


@pytest.mark.parametrize(
    ("successes", "n", "expected"),
    [(10, 10, 0.722), (20, 20, 0.839), (100, 100, 0.963), (0, 20, 0.0)],
)
def test_known_wilson_lower_bounds(successes: int, n: int, expected: float) -> None:
    assert wilson_lower_bound(successes, n) == pytest.approx(expected, abs=1e-3)


def test_empty_sample_returns_zero() -> None:
    assert wilson_lower_bound(0, 0) == 0.0


def test_bound_is_monotonic_in_successes_and_never_exceeds_pass_rate() -> None:
    bounds = [wilson_lower_bound(successes, 20) for successes in range(21)]

    assert bounds == sorted(bounds)
    for successes, bound in enumerate(bounds):
        assert bound <= successes / 20


def test_bound_improves_with_sample_size_at_fixed_pass_rate() -> None:
    samples = [(5, 10), (10, 20), (50, 100)]
    bounds = [wilson_lower_bound(successes, n) for successes, n in samples]

    assert bounds[0] < bounds[1] < bounds[2]


@pytest.mark.parametrize(
    ("successes", "n"),
    [(-1, 10), (1, -1), (11, 10), (1.5, 10), (True, 10), (1, 10.0), (True, 1)],
)
def test_invalid_counts_raise_value_error(successes: object, n: object) -> None:
    with pytest.raises(ValueError):
        wilson_lower_bound(successes, n)  # type: ignore[arg-type]


@pytest.mark.parametrize("z", [0, -1, math.inf, math.nan, True])
def test_invalid_z_raises_value_error(z: object) -> None:
    with pytest.raises(ValueError):
        wilson_lower_bound(1, 2, z)  # type: ignore[arg-type]
