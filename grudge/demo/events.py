"""Demo event-stream boundary; implementation is planned for Phase 10."""

from typing import NoReturn

from grudge._stubs import roadmap


def publish_event() -> NoReturn:
    """Publish an event after the demo event stream is implemented."""
    roadmap("demo.events")
