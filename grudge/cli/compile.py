"""CLI command for compiling admitted Scars for the local guard runtime."""

# Typer requires option factories in function defaults; this is the project's
# established command-module pattern.
# ruff: noqa: B008

from pathlib import Path
from typing import Any

import typer

from grudge.cli._common import finish
from grudge.config import SCARS_DIR
from grudge.guard.compile import compile_scars, load_scars, write_compiled


def compile_command(
    scars: Path = typer.Option(SCARS_DIR, "--scars", "-s", help="Scar directory."),
    out: Path = typer.Option(
        Path(".grudge/compiled.json"),
        "--out",
        "-o",
        help="Compiled rule output.",
    ),
    json_output: bool = typer.Option(False, "--json", "-j", help="Emit JSON output."),
) -> None:
    """Compile admitted Scar files into the flat hook contract."""

    payload = compile_scars(load_scars(scars), created_from=str(scars))
    target = write_compiled(payload, out)
    result: dict[str, Any] = {
        "command": "compile",
        "scars": str(scars),
        "out": str(target),
        "rules": len(payload["rules"]),
        "version": payload["version"],
    }
    if json_output:
        finish(result, json_output=True)
    else:
        finish(result, json_output=False)
