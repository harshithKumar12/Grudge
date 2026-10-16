"""Failure reproduction oracle boundary; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def reproduce() -> NoReturn:
    """Evaluate a candidate after the replay and shrinker stages exist."""
    roadmap("shrinker.oracle")
