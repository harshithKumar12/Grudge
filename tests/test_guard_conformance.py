"""Shared Phase 14 conformance fixtures for the Python guard implementation."""

import json
from pathlib import Path

from grudge.guard.compile import evaluate_rule

FIXTURES = Path(__file__).parents[1] / "spec" / "conformance"


def test_python_matches_every_shared_conformance_fixture() -> None:
    paths = sorted(FIXTURES.glob("*.json"))
    assert len(paths) >= 25
    for path in paths:
        fixture = json.loads(path.read_text(encoding="utf-8"))
        actual = evaluate_rule(fixture["rule"], fixture["events"])
        assert actual == fixture["expect"], path.name
