"""Final-outcome predicate boundary; this Phase 13 stretch item is a stub."""

from typing import NoReturn

from grudge._stubs import roadmap


def check_outcome() -> NoReturn:
    """Roadmap: evaluate terminal state through the compiler's Checker interface.

    Phase 6 parses Outcome for round trips, but compilation calls this explicit
    stub so an unsupported rule can never silently pass a regression gate.
    """
    roadmap("predicates.outcome")
