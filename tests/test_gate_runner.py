"""Phase 8 statistical gate behaviour."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from examples.leaky_agent.agent import run_agent as vulnerable_agent
from examples.leaky_agent.agent_fixed import run_agent as fixed_agent
from grudge.gate.runner import GateResult, gate, run_gate, wilson_lower_bound
from grudge.schema.scar import Scar

ROOT = Path(__file__).resolve().parents[1]


def _scar() -> Scar:
    return Scar.load(ROOT / "scars" / "sample_leak.scar.json")


def test_fixed_agent_passes_and_keeps_per_run_evidence() -> None:
    result = run_gate(_scar(), fixed_agent, runs=3, threshold=0.2)

    assert isinstance(result, GateResult)
    assert result.passed
    assert result.successes == result.pass_count == 3
    assert result.pass_rate == 1.0
    assert len(result.run_results) == 3
    assert all(run.trace is not None for run in result.run_results)
    assert all(run.predicate_result is not None for run in result.run_results)
    for run in result.run_results:
        assert run.predicate_result is not None
        assert not run.predicate_result.violated


def test_vulnerable_agent_is_blocked_with_human_reasons() -> None:
    result = run_gate(_scar(), vulnerable_agent, runs=3, threshold=0.2)

    assert not result.passed
    assert result.successes == 0
    assert result.lower_bound == 0.0
    assert result.reasons
    assert all("predicate violation" in reason for reason in result.reasons)
    assert all(run.evidence for run in result.run_results)
    assert gate(_scar(), vulnerable_agent, runs=1, threshold=0.2) == 1


def test_unadmitted_scars_are_rejected_and_gate_reports_config_error() -> None:
    scar = _scar()
    scar.admission = None

    with pytest.raises(ValueError, match="admission"):
        run_gate(scar, fixed_agent, runs=1)
    assert gate(scar, fixed_agent, runs=1) == 2


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("runs", 0),
        ("runs", True),
        ("threshold", float("nan")),
        ("threshold", 1.1),
        ("z", 0),
        ("z", float("inf")),
    ],
)
def test_invalid_configuration_fails_closed(name: str, value: Any) -> None:
    kwargs = {name: value}
    with pytest.raises(ValueError):
        run_gate(_scar(), fixed_agent, **kwargs)
    assert gate(_scar(), fixed_agent, **kwargs) == 2


def test_wilson_zero_runs_is_safe() -> None:
    assert wilson_lower_bound(0, 0) == 0.0
