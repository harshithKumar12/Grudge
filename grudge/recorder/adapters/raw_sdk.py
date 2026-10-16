"""Adapter boundary for plain SDK tool loops; implementation is later work."""

from typing import NoReturn

from grudge._stubs import roadmap


def record_raw_sdk() -> NoReturn:
    """Record a raw SDK loop after the recorder stage is implemented."""
    roadmap("recorder.adapters.raw_sdk")
