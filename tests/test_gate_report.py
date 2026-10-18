"""Phase 8 deterministic terminal and pull-request reports."""

from __future__ import annotations

from pathlib import Path

from examples.leaky_agent.agent_fixed import run_agent as fixed_agent
from grudge.gate.report import render_markdown, render_terminal
from grudge.gate.runner import run_gate
from grudge.schema.scar import Scar

ROOT = Path(__file__).resolve().parents[1]


def test_markdown_is_deterministic_and_mentions_offline_mode() -> None:
    scar = Scar.load(ROOT / "scars" / "sample_leak.scar.json")
    first = render_markdown(run_gate(scar, fixed_agent, runs=2, threshold=0.1))
    second = render_markdown(run_gate(scar, fixed_agent, runs=2, threshold=0.1))

    assert first == second
    assert "## Grudge gate: **PASS**" in first
    assert "offline/deterministic" in first
    assert "fresh ScriptedLLM" in first
    assert "| Run | Replay | Predicate | Gate | Evidence / reason |" in first


def test_blocked_markdown_has_required_status_and_reason() -> None:
    from examples.leaky_agent.agent import run_agent as vulnerable_agent

    scar = Scar.load(ROOT / "scars" / "sample_leak.scar.json")
    markdown = render_markdown(run_gate(scar, vulnerable_agent, runs=1, threshold=0.1))

    assert "## Grudge gate: **BLOCKED**" in markdown
    assert "predicate violation" in markdown


def test_terminal_report_is_rich_renderable() -> None:
    scar = Scar.load(ROOT / "scars" / "sample_leak.scar.json")
    text = render_terminal(run_gate(scar, fixed_agent, runs=1, threshold=0.1))

    assert "Grudge gate" in text
    assert "PASS" in text
    assert "offline/deterministic" in text
