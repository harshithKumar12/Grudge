"""Cassette-building orchestration boundary; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def build_minimal_cassette() -> NoReturn:
    """Build a minimal cassette after the shrinker stage is implemented."""
    roadmap("shrinker.cassette_builder")
