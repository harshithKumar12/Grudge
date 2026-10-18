"""Run admitted Scars through the deterministic statistical gate."""

# Typer's declarative Option defaults are intentional here.
# ruff: noqa: B008

from pathlib import Path
from typing import Any

import typer

from grudge.cli._common import command, finish, load_callable, read_text
from grudge.config import DEFAULTS
from grudge.gate.report import render_terminal
from grudge.gate.runner import run_gate
from grudge.schema.scar import Scar


def run_scars(
    scars: Path = typer.Option(..., "--scars", help="Scar file or directory."),
    agent: str = typer.Option(..., "--agent", help="Agent module to gate."),
    runs: int = typer.Option(DEFAULTS.n_runs, "--runs", min=1),
    threshold: float = typer.Option(DEFAULTS.gate_threshold, "--threshold"),
    json_output: bool = typer.Option(False, "--json", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Run all admitted Scars in a directory, or one Scar file."""

    def run() -> dict[str, Any]:
        paths = [scars] if scars.is_file() else sorted(scars.glob("*.scar.json"))
        if not paths:
            raise FileNotFoundError(f"no Scar files found at {scars}")
        agent_fn = load_callable(agent)
        results: list[dict[str, Any]] = []
        for path in paths:
            scar = Scar.model_validate_json(read_text(path, label="Scar"))
            result = run_gate(scar, agent_fn, runs=runs, threshold=threshold)
            if not json_output:
                typer.echo(render_terminal(result))
            results.append(
                {
                    "scar_id": result.scar_id,
                    "passed": result.passed,
                    "exit_code": result.exit_code,
                    "successes": result.successes,
                    "runs": result.runs,
                    "pass_rate": result.pass_rate,
                    "lower_bound": result.lower_bound,
                    "threshold": result.threshold,
                    "reasons": result.reasons,
                    "observations": result.observations,
                }
            )
        payload = {"command": "run", "results": results}
        return payload

    payload = command(run, json_output=json_output, debug=debug)
    if json_output:
        finish(payload, json_output=True)
    if any(not item["passed"] for item in payload["results"]):
        raise typer.Exit(code=1)
