"""Offline fallback predicate boundary; implementation is planned for Phase 6."""

from typing import NoReturn

from grudge._stubs import roadmap


def demo_rule() -> NoReturn:
    """Load the demo fallback rule after predicate work begins."""
    roadmap("predicates.fallback_rules")
