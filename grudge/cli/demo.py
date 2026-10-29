"""Run the deterministic, offline five-beat demonstration."""

# Typer's declarative Option defaults are intentional here.

import json
import os
import shutil
import subprocess
import webbrowser
from pathlib import Path
from threading import Event
from typing import Any, cast

import typer

from grudge.cli._common import command, finish
from grudge.config import DEFAULTS, SCARS_DIR
from grudge.demo.events import EventBus
from grudge.demo.orchestrator import run_demo as orchestrate_demo
from grudge.demo.server import DemoServer


def run_demo(
    live: bool = typer.Option(False, "--live", help="Reserved for a live provider."),
    port: int = typer.Option(8765, "--port", help="Local viewer server port."),
    no_browser: bool = typer.Option(
        False, "--no-browser", help="Do not open a browser."
    ),
    runs: int = typer.Option(DEFAULTS.n_runs, "--runs", "-r", min=1),
    fast: bool = typer.Option(False, "--fast", "-f", help="Disable presenter pacing."),
    guard: bool = typer.Option(
        False, "--guard", help="Run the offline two-session hook proof."
    ),
    json_output: bool = typer.Option(False, "--json", "-j", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Play the offline proof against the fixed and vulnerable demo agents."""

    def run() -> dict[str, Any]:
        if live:
            raise RuntimeError(
                "live demo mode is reserved for a future provider integration"
            )
        if guard:
            node = shutil.which("node")
            if node is None:
                raise RuntimeError("--guard requires Node.js >= 18 on PATH")
            script = Path(__file__).resolve().parents[2] / "scripts" / "e2e_guard.mjs"
            completed = subprocess.run(
                [node, str(script)],
                cwd=script.parent.parent,
                check=False,
                capture_output=True,
                text=True,
                env={**os.environ, "GRUDGE_DISABLE": ""},
            )
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr.strip() or "guard demo failed")
            payload = cast(dict[str, Any], json.loads(completed.stdout))
            payload["command"] = "demo --guard"
            if json_output:
                return payload
            typer.echo("Session 1: leak captured, proposed, and accepted")
            typer.echo("Session 2: leak blocked before the HTTP call")
            typer.echo(payload["reason"])
            return payload
        if not fast and not json_output:
            bus = EventBus()
            finished = Event()
            failure: list[BaseException] = []

            def run_viewer_demo() -> None:
                try:
                    orchestrate_demo(bus=bus, runs=runs)
                except BaseException as exc:
                    failure.append(exc)
                finally:
                    finished.set()

            server = DemoServer(
                port=port,
                bus=bus,
                runner=run_viewer_demo,
            ).start(run_demo=True)
            url = f"http://{server.address[0]}:{server.address[1]}/"
            if not no_browser:
                webbrowser.open(url)
            typer.echo(f"Grudge viewer: {url}")
            finished.wait()
            server.close()
            if failure:
                raise RuntimeError("viewer demo failed") from failure[0]
            return {"command": "demo", "mode": "viewer", "url": url}
        events = orchestrate_demo(fast=fast, runs=runs)
        event_payloads = [event.model_dump(mode="json") for event in events]
        gates = [event for event in event_payloads if event["type"] == "gate.result"]
        vulnerable = next(
            event
            for event in gates
            if event["agent"] == "vulnerable" and not event["passed"]
        )
        fixed = next(event for event in gates if event["agent"] == "fixed")
        return {
            "command": "demo",
            "mode": "offline/deterministic",
            "scar": str(SCARS_DIR / "sample_leak.scar.json"),
            "events": event_payloads,
            "fixed": {
                "passed": fixed["passed"],
                "successes": fixed["passes"],
                "runs": fixed["n"],
                "lower_bound": fixed["wilson"],
            },
            "vulnerable": {
                "passed": vulnerable["passed"],
                "successes": vulnerable["passes"],
                "runs": vulnerable["n"],
                "lower_bound": vulnerable["wilson"],
            },
        }

    result = command(run, json_output=json_output, debug=debug)
    if result.get("mode") == "viewer":
        return
    if guard:
        if json_output:
            finish(result, json_output=True)
        return
    if json_output:
        finish(result, json_output=True)
    else:
        for event in result["events"]:
            typer.echo(
                f"{event['type']} "
                f"{json.dumps(event, ensure_ascii=False, sort_keys=True)}"
            )
