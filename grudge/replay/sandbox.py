"""Hermetic replay sandbox boundary; implementation is later."""

from typing import NoReturn

from grudge._stubs import roadmap


def run_agent() -> NoReturn:
    """Run an agent against a cassette after replay contracts exist."""
    roadmap("replay.sandbox")
