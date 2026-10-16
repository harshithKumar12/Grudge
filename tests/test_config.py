"""Focused tests for the Phase 0 configuration defaults."""

from pathlib import Path

from grudge.config import (
    CACHE_DIR,
    DEFAULT_MODEL,
    DEFAULTS,
    GATE_THRESHOLD,
    N_RUNS,
    OFFLINE,
    SCARS_DIR,
    WILSON_Z,
)


def test_defaults_match_phase_zero_contract() -> None:
    assert N_RUNS == 20
    assert WILSON_Z == 1.96
    assert GATE_THRESHOLD == 0.80
    assert OFFLINE is True
    assert DEFAULT_MODEL == "offline-scripted"
    assert DEFAULTS.n_runs == N_RUNS
    assert DEFAULTS.wilson_z == WILSON_Z
    assert DEFAULTS.gate_threshold == GATE_THRESHOLD
    assert DEFAULTS.offline is OFFLINE


def test_default_paths_are_project_relative() -> None:
    assert isinstance(CACHE_DIR, Path)
    assert isinstance(SCARS_DIR, Path)
    assert CACHE_DIR.is_absolute()
    assert SCARS_DIR.is_absolute()
    assert CACHE_DIR.parent.name == ".grudge"
    assert SCARS_DIR.name == "scars"
