"""Demo orchestration boundary; implementation is planned for Phase 10."""

from typing import NoReturn

from grudge._stubs import roadmap


def run_demo() -> NoReturn:
    """Run the demo after the pipeline stages are implemented."""
    roadmap("demo.orchestrator")
