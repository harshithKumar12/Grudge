"""Scar contracts combining a cassette, predicate, and admission metadata."""

from typing import NoReturn

from grudge._stubs import roadmap


def build_scar() -> NoReturn:
    """Construct a scar after the Phase 1 schema contract is implemented."""
    roadmap("schema.scar")
