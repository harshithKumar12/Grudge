"""Privacy redaction boundary for traces; implementation is a later stage."""

from typing import NoReturn

from grudge._stubs import roadmap


def redact_trace() -> NoReturn:
    """Redact trace values after recorder contracts are available."""
    roadmap("recorder.redact")
