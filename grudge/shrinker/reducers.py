"""Content reducer boundary for cassettes; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def reduce_content() -> NoReturn:
    """Reduce cassette content after the shrinker stage is implemented."""
    roadmap("shrinker.reducers")
