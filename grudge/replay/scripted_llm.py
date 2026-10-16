"""Deterministic scripted policy boundary; implementation belongs to Phase 2."""

from typing import NoReturn

from grudge._stubs import roadmap


def next_action() -> NoReturn:
    """Choose a scripted action after the replay stage is implemented."""
    roadmap("replay.scripted_llm")
