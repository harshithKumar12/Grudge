"""Phase 12 benchmark, offline, and reproducibility acceptance tests."""

from __future__ import annotations

import ast
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from grudge.demo.orchestrator import run_demo
from grudge.schema.trace import Trace

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts" / "generate_trace.py"


def _generate(output: Path, steps: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(GENERATOR),
            "--output",
            str(output),
            "--steps",
            str(steps),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_benchmark_generator_writes_valid_failing_trace(tmp_path: Path) -> None:
    output = tmp_path / "trace.jsonl"

    result = _generate(output, steps=7)

    assert result.returncode == 0, result.stderr
    trace = Trace.from_jsonl(output.read_text(encoding="utf-8"))
    assert trace.outcome == "failed"
    assert len(trace.steps) == 7
    assert [step.idx for step in trace.steps] == list(range(7))
    assert all(step.run_id == trace.run_id for step in trace.steps)


def test_benchmark_generator_is_deterministic(tmp_path: Path) -> None:
    first = tmp_path / "first.jsonl"
    second = tmp_path / "second.jsonl"

    assert _generate(first, steps=12).returncode == 0
    assert _generate(second, steps=12).returncode == 0

    assert first.read_bytes() == second.read_bytes()
    assert Trace.from_jsonl(first.read_text(encoding="utf-8")).to_jsonl() == (
        first.read_text(encoding="utf-8")
    )


@pytest.mark.parametrize("steps", ["0", "-1", "not-an-int"])
def test_benchmark_generator_rejects_invalid_step_count(
    tmp_path: Path, steps: str
) -> None:
    output = tmp_path / "invalid.jsonl"

    result = subprocess.run(
        [
            sys.executable,
            str(GENERATOR),
            "--output",
            str(output),
            "--steps",
            steps,
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert not output.exists()


def test_offline_demo_succeeds_with_network_access_blocked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def blocked(*_args: object, **_kwargs: object) -> socket.socket:
        raise AssertionError("offline demo attempted network access")

    monkeypatch.setattr(socket, "socket", blocked)

    events = run_demo(fast=True, runs=1)

    assert events[0].type == "demo.started"
    assert events[-1].type == "demo.finished"


def test_reproducible_audit_claims_are_present() -> None:
    assert (ROOT / ".python-version").read_text(encoding="utf-8").strip()
    assert (ROOT / "requirements.lock").is_file()
    assert (ROOT / "Dockerfile").is_file()
    assert (ROOT / "Makefile").is_file()

    tree = ast.parse(GENERATOR.read_text(encoding="utf-8"))
    imported_modules = {
        node.names[0].name.split(".")[0]
        for node in ast.walk(tree)
        if isinstance(node, ast.Import) and node.names
    }
    imported_modules.update(
        node.module.split(".")[0]
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module
    )
    assert imported_modules <= {
        "argparse",
        "datetime",
        "json",
        "pathlib",
        "sys",
        "typing",
        "__future__",
    }


def test_readme_contains_a_measured_benchmark_row() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    # Re-measuring the benchmark also updates this assertion. The check exists to
    # reject placeholder rows, not to freeze one host's timings.
    assert "Trace steps captured" in readme
    assert "1,254" in readme
    assert "11,854" in readme
    assert "2,081" in readme
    assert "not measured" not in readme
