"""Cassette response player boundary; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def play_cassette() -> NoReturn:
    """Serve frozen responses after replay contracts are implemented."""
    roadmap("replay.cassette_player")
