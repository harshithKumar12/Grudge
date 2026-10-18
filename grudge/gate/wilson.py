"""Wilson lower-bound statistics for the Phase 8 regression gate."""

import math


def wilson_lower_bound(successes: int, n: int, z: float = 1.96) -> float:
    """Return the lower confidence bound for a binomial pass rate.

    The calculation uses the Wilson score interval without continuity
    correction.  Counts and the confidence multiplier are validated so gate
    decisions cannot silently use malformed statistics.
    """
    if isinstance(successes, bool) or not isinstance(successes, int):
        raise ValueError("successes must be an integer")
    if isinstance(n, bool) or not isinstance(n, int):
        raise ValueError("n must be an integer")
    if successes < 0:
        raise ValueError("successes must be nonnegative")
    if n < 0:
        raise ValueError("n must be nonnegative")
    if successes > n:
        raise ValueError("successes must not exceed n")
    if isinstance(z, bool) or not isinstance(z, int | float):
        raise ValueError("z must be finite and positive")
    if not math.isfinite(z) or z <= 0:
        raise ValueError("z must be finite and positive")
    if n == 0:
        return 0.0

    p = successes / n
    z_squared = z**2
    denominator = 1 + z_squared / n
    numerator = (
        p + z_squared / (2 * n) - z * math.sqrt((p * (1 - p) + z_squared / (4 * n)) / n)
    )
    return numerator / denominator
