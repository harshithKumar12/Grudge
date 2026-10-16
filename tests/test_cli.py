"""Focused tests for the bootstrap command-line help surface."""

from typer.testing import CliRunner

from grudge.cli.main import app


def test_help_lists_phase_zero_commands() -> None:
    result = CliRunner().invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "Compile agent failures" in result.stdout
    for command in ("capture", "shrink", "admit", "run", "demo", "viewer", "scars"):
        assert command in result.stdout
