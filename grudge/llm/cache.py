"""Disk cache boundary for offline synthesis; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def cached_completion() -> NoReturn:
    """Read or write a completion after the cache stage is implemented."""
    roadmap("llm.cache")
