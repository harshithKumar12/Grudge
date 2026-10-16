"""Provider-neutral LLM client boundary; implementation is planned for Phase 6."""

from typing import NoReturn

from grudge._stubs import roadmap


def complete() -> NoReturn:
    """Request a completion after the LLM boundary is implemented."""
    roadmap("llm.client")
