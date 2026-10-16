"""Shared Phase 0 helper for explicit roadmap placeholders."""

from typing import NoReturn


def roadmap(item: str) -> NoReturn:
    """Fail explicitly when a future roadmap item is invoked."""
    raise NotImplementedError(f"roadmap: {item}")
