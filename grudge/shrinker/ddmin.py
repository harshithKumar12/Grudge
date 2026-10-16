"""Delta-debugging boundary for minimal cassettes; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def minimize() -> NoReturn:
    """Minimize cassette entries after the shrinker stage is implemented."""
    roadmap("shrinker.ddmin")
