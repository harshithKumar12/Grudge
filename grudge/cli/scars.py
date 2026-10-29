"""List and inspect saved Scars; retirement remains a roadmap stub."""

# Typer's declarative Option defaults are intentional here.
# ruff: noqa: B008

from pathlib import Path
from typing import Any

import typer

from grudge._stubs import roadmap
from grudge.cli._common import command, finish, read_text
from grudge.config import SCARS_DIR
from grudge.errors import GrudgeError
from grudge.schema.scar import Scar

scars_app = typer.Typer(help="Browse saved regression Scars.")


@scars_app.command("list")
def list_scars(
    scars_dir: Path = typer.Option(SCARS_DIR, "--scars", "--scars-dir", "-s"),
    json_output: bool = typer.Option(False, "--json", "-j"),
    debug: bool = typer.Option(False, "--debug"),
) -> None:
    """List saved Scar summaries."""

    def run() -> dict[str, Any]:
        paths = sorted(scars_dir.glob("*.scar.json"))
        entries = []
        for path in paths:
            scar = Scar.model_validate_json(read_text(path, label="Scar"))
            entries.append(
                {
                    "id": scar.id,
                    "path": str(path),
                    "admitted": bool(scar.admission and scar.admission.admitted),
                    "fingerprint": scar.fingerprint,
                }
            )
        payload = {"command": "scars list", "scars": entries}
        if not json_output:
            for item in entries:
                status = "admitted" if item["admitted"] else "unadmitted"
                typer.echo(f"{item['id']}  {status}")
        return payload

    finish(command(run, json_output=json_output, debug=debug), json_output=json_output)


@scars_app.command("show")
def show_scar(
    scar: str,
    scars_dir: Path = typer.Option(SCARS_DIR, "--scars", "--scars-dir", "-s"),
    json_output: bool = typer.Option(False, "--json", "-j"),
    debug: bool = typer.Option(False, "--debug"),
) -> None:
    """Show one Scar by path or id."""

    def run() -> dict[str, Any]:
        path = Path(scar)
        if not path.is_file():
            filename = scar if scar.endswith(".scar.json") else f"{scar}.scar.json"
            path = scars_dir / filename
        loaded = Scar.model_validate_json(read_text(path, label="Scar"))
        return {"command": "scars show", "scar": loaded.model_dump(mode="json")}

    result = command(run, json_output=json_output, debug=debug)
    if not json_output:
        typer.echo(Scar.model_validate(result["scar"]).model_dump_json(indent=2))
    else:
        finish(result, json_output=True)


@scars_app.command("retire")
def retire_scar(
    scar: str,
    json_output: bool = typer.Option(False, "--json", "-j"),
    debug: bool = typer.Option(False, "--debug"),
) -> None:
    """Retire a Scar (registry support is a later roadmap item)."""

    del scar

    def run() -> None:
        try:
            roadmap("cli.scars.retire")
        except NotImplementedError as exc:
            raise GrudgeError(str(exc)) from exc

    command(run, json_output=json_output, debug=debug)
