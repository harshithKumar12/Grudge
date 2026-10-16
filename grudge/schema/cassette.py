"""Cassette contracts for frozen tool worlds; implementation is a Phase 1 item."""

from typing import NoReturn

from grudge._stubs import roadmap


def build_cassette() -> NoReturn:
    """Construct a cassette after the Phase 1 schema contract is implemented."""
    roadmap("schema.cassette")
