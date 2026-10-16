"""Typer command surface for Grudge; command implementations arrive by phase."""

from typing import NoReturn

import typer

from grudge._stubs import roadmap

app = typer.Typer(
    name="grudge",
    help="Compile agent failures into deterministic regression scars.",
    no_args_is_help=True,
)


def _future(command: str) -> NoReturn:
    roadmap(f"cli.{command}")


@app.command()
def capture() -> NoReturn:
    """Capture an agent run into a trace."""
    _future("capture")


@app.command()
def shrink() -> NoReturn:
    """Shrink a failing trace into a minimal cassette."""
    _future("shrink")


@app.command()
def admit() -> NoReturn:
    """Prove a candidate scar against bad and fixed agents."""
    _future("admit")


@app.command("run")
def run_gate() -> NoReturn:
    """Run the regression gate against admitted scars."""
    _future("run")


@app.command()
def demo() -> NoReturn:
    """Play the offline five-beat demo."""
    _future("demo")


@app.command()
def viewer() -> NoReturn:
    """Start the local viewer server."""
    _future("viewer")


@app.command()
def scars() -> NoReturn:
    """List, show, or retire saved scars."""
    _future("scars")
