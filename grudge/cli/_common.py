"""Shared helpers for the Phase 9 scriptable command surface."""

from __future__ import annotations

import importlib
import json
import sys
import traceback
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, NoReturn, TypeVar, cast

import typer

from grudge.errors import GrudgeError

T = TypeVar("T")


def finish(payload: Mapping[str, Any], *, json_output: bool) -> None:
    """Print a command result as pretty JSON or a readable summary."""

    if json_output:
        typer.echo(json.dumps(dict(payload), ensure_ascii=False, sort_keys=True, indent=2))
        return
    command_name = str(payload.get("command", "command"))
    typer.echo(f"Grudge {command_name} v{_version()}")
    passed = failed = warnings = 0
    for key, value in payload.items():
        if key == "command":
            continue
        if isinstance(value, list):
            for item in value:
                typer.echo(f"[ok] {key}: {item}")
                passed += 1
        elif isinstance(value, Mapping):
            typer.echo(f"[ok] {key}: {len(value)} fields")
            passed += 1
        else:
            typer.echo(f"[ok] {key}: {value}")
            passed += 1
    typer.echo(f"{passed} passed, {failed} failed, {warnings} warnings")
    typer.echo(f"Next: {_next_command(command_name)}")


def fail(exc: Exception, *, json_output: bool, debug: bool) -> NoReturn:
    """Render an expected command failure and terminate with status 2."""

    if debug:
        traceback.print_exc(file=sys.stderr)
    message = str(exc) or type(exc).__name__
    if json_output:
        typer.echo(
            json.dumps(
                {"error": message, "error_type": type(exc).__name__},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    else:
        typer.echo(f"Error: {message}\nFix: {_fix_for(message)}", err=True)
    raise typer.Exit(code=2)


def command(action: Callable[[], T], *, json_output: bool, debug: bool) -> T:
    """Run a command body with the common Grudge error contract."""

    try:
        return action()
    except typer.Exit:
        raise
    except Exception as exc:
        fail(exc, json_output=json_output, debug=debug)
    raise AssertionError("unreachable")


def _version() -> str:
    try:
        from importlib.metadata import version

        return version("grudge-cli")
    except Exception:
        return "0.1.7"


def _next_command(command_name: str) -> str:
    if command_name in {"capture", "shrink", "admit"}:
        return "grudge run --scars .grudge/scars --agent examples.leaky_agent.agent_fixed"
    if command_name == "run":
        return "grudge scars list"
    if command_name == "compile":
        return "grudge run --scars .grudge/scars --agent examples.leaky_agent.agent_fixed"
    return "grudge --help"


def _fix_for(message: str) -> str:
    lowered = message.lower()
    if "does not exist" in lowered or "could not read" in lowered:
        return "check the path and run the command again"
    if "import agent" in lowered:
        return "install the project and verify the agent module name"
    return "rerun with --debug for the traceback and more detail"


def load_callable(module_name: str) -> Callable[..., Any]:
    """Import an agent module and select its conventional run entry point."""

    try:
        module = importlib.import_module(module_name)
    except Exception as exc:
        raise GrudgeError(
            f"could not import agent module {module_name!r}: {exc}"
        ) from exc
    for name in ("run_agent", "run"):
        candidate = getattr(module, name, None)
        if callable(candidate):
            return cast(Callable[..., Any], candidate)
    raise GrudgeError(
        f"agent module {module_name!r} must expose a callable run_agent or run"
    )


def require_file(path: Path, *, label: str) -> Path:
    """Validate a required input file without leaking a raw OS exception."""

    if not path.is_file():
        raise GrudgeError(f"{label} file does not exist: {path}")
    return path


def read_text(path: Path, *, label: str) -> str:
    """Read a required UTF-8 file as a Grudge-friendly operation."""

    require_file(path, label=label)
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise GrudgeError(f"could not read {label} file {path}: {exc}") from exc


def write_text(path: Path, text: str, *, label: str) -> None:
    """Write a command artifact, creating its parent directory when needed."""

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    except OSError as exc:
        raise GrudgeError(f"could not write {label} file {path}: {exc}") from exc


def model_json(model: Any) -> dict[str, Any]:
    """Return a Pydantic model as JSON-compatible data."""

    return cast(dict[str, Any], model.model_dump(mode="json"))


__all__ = [
    "command",
    "fail",
    "finish",
    "load_callable",
    "model_json",
    "read_text",
    "require_file",
    "write_text",
]
