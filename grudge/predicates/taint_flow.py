"""Taint-flow checker boundary; implementation is planned for Phase 6."""

from typing import NoReturn

from grudge._stubs import roadmap


def check_taint_flow() -> NoReturn:
    """Check taint propagation after the predicate compiler is implemented."""
    roadmap("predicates.taint_flow")
