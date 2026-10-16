"""Recorder boundary for agent runs; implementation is a later pipeline stage."""

from typing import NoReturn

from grudge._stubs import roadmap


def record_run() -> NoReturn:
    """Record an agent run after the recorder stage is implemented."""
    roadmap("recorder")
