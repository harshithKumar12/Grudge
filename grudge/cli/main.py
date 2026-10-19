"""Typer command surface for Grudge's deterministic pipeline."""

from typing import Any, NoReturn

import typer

from grudge._stubs import roadmap
from grudge.cli._common import command
from grudge.cli.admit import admit_cassette
from grudge.cli.capture import capture_agent
from grudge.cli.compile import compile_command
from grudge.cli.demo import run_demo
from grudge.cli.run import run_scars
from grudge.cli.scars import scars_app
from grudge.cli.shrink import shrink_trace
from grudge.errors import GrudgeError

app = typer.Typer(
    name="grudge",
    help="Compile agent failures into deterministic regression scars.",
    no_args_is_help=True,
)


def _future(command: str) -> NoReturn:
    roadmap(f"cli.{command}")


app.command("capture")(capture_agent)
app.command("compile")(compile_command)
app.command("shrink")(shrink_trace)
app.command("admit")(admit_cassette)
app.command("run")(run_scars)
app.command("demo")(run_demo)


@app.command()
def viewer(
    json_output: bool = typer.Option(False, "--json", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Start the local viewer server."""

    def run() -> dict[str, Any]:
        try:
            _future("viewer")
        except NotImplementedError as exc:
            raise GrudgeError(str(exc)) from exc
        raise AssertionError("unreachable")

    command(run, json_output=json_output, debug=debug)


app.add_typer(scars_app, name="scars")
