"""Capture an agent module's typed trace as canonical JSONL."""

# Typer's declarative Option defaults are intentional here.
# ruff: noqa: B008

from pathlib import Path
from typing import Any

import typer

from grudge.cli._common import command, finish, load_callable, write_text
from grudge.errors import GrudgeError
from grudge.recorder.redact import redact_jsonl
from grudge.schema.trace import Trace


def capture_agent(
    agent_module: str,
    out: Path = typer.Option(..., "--out", "-o", help="Destination JSONL trace."),
    json_output: bool = typer.Option(False, "--json", "-j", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Capture an agent run into a trace."""

    def run() -> dict[str, Any]:
        trace = load_callable(agent_module)()
        if not isinstance(trace, Trace):
            raise GrudgeError(
                f"agent {agent_module!r} returned {type(trace).__name__}, not a Trace"
            )
        write_text(out, redact_jsonl(trace.to_jsonl()), label="trace")
        return {
            "command": "capture",
            "trace": str(out),
            "run_id": trace.run_id,
            "steps": len(trace.steps),
            "outcome": trace.outcome,
        }

    finish(command(run, json_output=json_output, debug=debug), json_output=json_output)
