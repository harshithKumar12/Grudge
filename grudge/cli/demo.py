"""Run the deterministic, offline Phase 9 command-line demonstration."""

# Typer's declarative Option defaults are intentional here.
# ruff: noqa: B008

from typing import Any

import typer

from grudge.cli._common import command, finish, load_callable
from grudge.config import DEFAULTS, SCARS_DIR
from grudge.gate.runner import run_gate
from grudge.schema.scar import Scar


def run_demo(
    live: bool = typer.Option(False, "--live", help="Reserved for a live provider."),
    port: int = typer.Option(8765, "--port", help="Viewer port reserved for Phase 10."),
    no_browser: bool = typer.Option(
        False, "--no-browser", help="Do not open a browser."
    ),
    runs: int = typer.Option(DEFAULTS.n_runs, "--runs", min=1),
    json_output: bool = typer.Option(False, "--json", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Play the offline proof against the fixed and vulnerable demo agents."""

    def run() -> dict[str, Any]:
        if live:
            raise RuntimeError(
                "live demo mode is reserved for a future provider integration"
            )
        _ = (port, no_browser)
        path = SCARS_DIR / "sample_leak.scar.json"
        if not path.is_file():
            raise FileNotFoundError(f"offline demo Scar does not exist: {path}")
        scar = Scar.load(path)
        fixed = run_gate(
            scar,
            load_callable("examples.leaky_agent.agent_fixed"),
            runs=runs,
            threshold=DEFAULTS.gate_threshold,
        )
        vulnerable = run_gate(
            scar,
            load_callable("examples.leaky_agent.agent"),
            runs=runs,
            threshold=DEFAULTS.gate_threshold,
        )
        return {
            "command": "demo",
            "mode": "offline/deterministic",
            "scar": str(path),
            "fixed": {
                "passed": fixed.passed,
                "successes": fixed.successes,
                "runs": fixed.runs,
                "lower_bound": fixed.lower_bound,
            },
            "vulnerable": {
                "passed": vulnerable.passed,
                "successes": vulnerable.successes,
                "runs": vulnerable.runs,
                "lower_bound": vulnerable.lower_bound,
            },
        }

    result = command(run, json_output=json_output, debug=debug)
    if json_output:
        finish(result, json_output=True)
    else:
        typer.echo("Grudge offline demo")
        typer.echo(
            "fixed agent: PASS" if result["fixed"]["passed"] else "fixed agent: BLOCKED"
        )
        typer.echo(
            "vulnerable agent: PASS"
            if result["vulnerable"]["passed"]
            else "vulnerable agent: BLOCKED (old mistake detected)"
        )
    if not result["fixed"]["passed"] or result["vulnerable"]["passed"]:
        raise typer.Exit(code=1)
