"""Phase 5 cassette shrinker: oracle evaluation and two-level minimization."""

from grudge.shrinker.cassette_builder import ShrinkResult, build_minimal_cassette
from grudge.shrinker.oracle import Oracle, OracleResult, PredicateOracle

__all__ = [
    "Oracle",
    "OracleResult",
    "PredicateOracle",
    "ShrinkResult",
    "build_minimal_cassette",
]
