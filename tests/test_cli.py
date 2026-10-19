"""Focused CliRunner coverage for the Phase 9 command surface."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from examples.leaky_agent.agent import run_agent
from grudge.cli.main import app
from grudge.demo.events import DemoFinished, DemoStarted, EventBus
from grudge.replay.sandbox import run_agent as replay_agent
from grudge.replay.scripted_llm import ScriptedLLM
from grudge.schema.scar import Scar


def test_help_lists_phase_zero_commands() -> None:
    result = CliRunner().invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "Compile agent failures" in result.stdout
    for command in ("capture", "shrink", "admit", "run", "demo", "viewer", "scars"):
        assert command in result.stdout


def _sample_cassette(tmp_path: Path) -> Path:
    """Copy the checked-in demo cassette into a test-local artifact."""

    cassette = Scar.load("scars/sample_leak.scar.json").cassette
    path = tmp_path / "sample.json"
    path.write_text(cassette.model_dump_json(indent=2), encoding="utf-8")
    return path


def _replay_trace(tmp_path: Path) -> Path:
    """Create a failing trace from the real sample cassette for shrink tests."""

    cassette = Scar.load("scars/sample_leak.scar.json").cassette
    trace = replay_agent(
        run_agent,
        cassette,
        ScriptedLLM(),
        timeout=2,
        max_steps=128,
    )
    path = tmp_path / "failure.jsonl"
    path.write_text(trace.to_jsonl(), encoding="utf-8")
    return path


def test_capture_writes_trace_and_json_is_valid(tmp_path: Path) -> None:
    output = tmp_path / "trace.jsonl"
    result = CliRunner().invoke(
        app,
        [
            "capture",
            "examples.leaky_agent.agent",
            "--out",
            str(output),
            "--json",
        ],
    )

    assert result.exit_code == 0
    assert json.loads(result.stdout)["outcome"] == "ok"
    assert output.is_file()


def test_shrink_writes_cassette_and_reports_stats(tmp_path: Path) -> None:
    trace = _replay_trace(tmp_path)
    output = tmp_path / "cassette.json"
    result = CliRunner().invoke(
        app,
        [
            "shrink",
            str(trace),
            "--failure",
            "never flow read_file to send_http field body",
            "--out",
            str(output),
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    payload = json.loads(result.stdout)
    assert payload["minimal_entries"] <= payload["original_entries"]
    assert output.is_file()


def test_admit_proves_sample_cassette(tmp_path: Path) -> None:
    cassette = _sample_cassette(tmp_path)
    result = CliRunner().invoke(
        app,
        [
            "admit",
            str(cassette),
            "--bad",
            "examples.leaky_agent.agent",
            "--good",
            "examples.leaky_agent.agent_fixed",
            "--out",
            str(tmp_path / "scars"),
            "--runs",
            "1",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    payload = json.loads(result.stdout)
    assert payload["admitted"] is True
    assert Path(payload["saved_path"]).is_file()


def test_cli_pipeline_admits_shrunk_trace_and_gates_both_agents(
    tmp_path: Path,
) -> None:
    trace = tmp_path / "failure.jsonl"
    cassette = tmp_path / "cassette.json"
    scar_dir = tmp_path / "scars"
    runner = CliRunner()

    captured = runner.invoke(
        app,
        [
            "capture",
            "examples.leaky_agent.agent",
            "--out",
            str(trace),
            "--json",
        ],
    )
    shrunk = runner.invoke(
        app,
        [
            "shrink",
            str(trace),
            "--failure",
            "never flow read_file to send_http field body",
            "--out",
            str(cassette),
            "--json",
        ],
    )
    admitted = runner.invoke(
        app,
        [
            "admit",
            str(cassette),
            "--bad",
            "examples.leaky_agent.agent",
            "--good",
            "examples.leaky_agent.agent_fixed",
            "--out",
            str(scar_dir),
            "--runs",
            "1",
            "--json",
        ],
    )
    fixed = runner.invoke(
        app,
        [
            "run",
            "--scars",
            str(scar_dir),
            "--agent",
            "examples.leaky_agent.agent_fixed",
            "--runs",
            "20",
            "--json",
        ],
    )
    vulnerable = runner.invoke(
        app,
        [
            "run",
            "--scars",
            str(scar_dir),
            "--agent",
            "examples.leaky_agent.agent",
            "--runs",
            "20",
            "--json",
        ],
    )

    assert captured.exit_code == 0, captured.stdout
    assert shrunk.exit_code == 0, shrunk.stdout
    assert admitted.exit_code == 0, admitted.stdout
    assert fixed.exit_code == 0, fixed.stdout
    assert vulnerable.exit_code == 1, vulnerable.stdout


def test_run_returns_zero_for_passing_fixed_agent(tmp_path: Path) -> None:
    del tmp_path
    result = CliRunner().invoke(
        app,
        [
            "run",
            "--scars",
            "scars/sample_leak.scar.json",
            "--agent",
            "examples.leaky_agent.agent_fixed",
            "--runs",
            "20",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert json.loads(result.stdout)["results"][0]["passed"] is True


def test_run_returns_one_for_blocked_vulnerable_agent() -> None:
    result = CliRunner().invoke(
        app,
        [
            "run",
            "--scars",
            "scars/sample_leak.scar.json",
            "--agent",
            "examples.leaky_agent.agent",
            "--runs",
            "2",
            "--json",
        ],
    )

    assert result.exit_code == 1
    assert json.loads(result.stdout)["results"][0]["passed"] is False


def test_demo_and_scar_browsing_emit_json(tmp_path: Path) -> None:
    demo = CliRunner().invoke(app, ["demo", "--runs", "20", "--fast", "--json"])
    listed = CliRunner().invoke(
        app,
        ["scars", "list", "--scars", "scars", "--json"],
    )
    shown = CliRunner().invoke(
        app,
        ["scars", "show", "sample_leak", "--scars", "scars", "--json"],
    )

    assert demo.exit_code == 0, demo.stdout
    assert json.loads(demo.stdout)["mode"] == "offline/deterministic"
    assert listed.exit_code == 0
    assert json.loads(listed.stdout)["scars"]
    assert shown.exit_code == 0
    assert json.loads(shown.stdout)["scar"]["id"] == "sample_leak"
    del tmp_path


def test_demo_starts_viewer_server_without_browser(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_demo(*, bus: EventBus, runs: int) -> list[object]:
        del runs
        bus.publish(DemoStarted())
        bus.publish(DemoFinished())
        return []

    monkeypatch.setattr("grudge.cli.demo.orchestrate_demo", fake_demo)
    result = CliRunner().invoke(app, ["demo", "--no-browser", "--port", "0"])

    assert result.exit_code == 0, result.stdout
    assert "Grudge viewer: http://127.0.0.1:" in result.stdout


def test_missing_file_is_friendly_json_error_and_retire_is_stub(tmp_path: Path) -> None:
    missing = CliRunner().invoke(
        app,
        ["capture", "missing.module", "--out", str(tmp_path / "x"), "--json"],
    )
    retire = CliRunner().invoke(
        app,
        ["scars", "retire", "sample_leak", "--json"],
    )

    assert missing.exit_code == 2
    assert json.loads(missing.stdout)["error"]
    assert retire.exit_code == 2
    assert "roadmap" in json.loads(retire.stdout)["error"]


def test_viewer_stub_honors_common_error_flags() -> None:
    result = CliRunner().invoke(app, ["viewer", "--json"])

    assert result.exit_code == 2
    assert json.loads(result.stdout)["error"] == "roadmap: cli.viewer"
