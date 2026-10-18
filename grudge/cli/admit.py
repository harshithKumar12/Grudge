"""Build and prove a Scar from a cassette using the admission court."""

# Typer's declarative Option defaults are intentional here.
# ruff: noqa: B008

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import typer

from grudge.admission import admit
from grudge.cli._common import command, finish, load_callable, read_text
from grudge.errors import GrudgeError
from grudge.predicates.dsl import parse
from grudge.predicates.fallback_rules import demo_rule
from grudge.schema.cassette import Cassette
from grudge.schema.scar import Scar
from grudge.schema.trace import Trace


def admit_cassette(
    cassette: Path,
    bad: str = typer.Option(..., "--bad", help="Failing agent module."),
    good: str = typer.Option(..., "--good", help="Fixed agent module."),
    out: Path = typer.Option(..., "--out", help="Directory for admitted Scars."),
    scar_id: str | None = typer.Option(None, "--id", help="Scar filename/id."),
    predicate: str = typer.Option(
        "demo",
        "--predicate",
        help="Predicate DSL, or 'demo' for the hand-verified rule.",
    ),
    controls: Path = typer.Option(
        Path("examples/leaky_agent/controls"),
        "--controls",
        help="Directory containing benign control JSONL traces.",
    ),
    runs: int = typer.Option(3, "--runs", min=1, help="Proof runs per agent."),
    json_output: bool = typer.Option(False, "--json", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Prove a cassette red on the bad agent and green on the good agent."""

    def run() -> dict[str, Any]:
        payload = read_text(cassette, label="cassette")
        try:
            candidate_cassette = Cassette.model_validate_json(payload)
        except Exception as exc:
            raise GrudgeError(f"invalid cassette file {cassette}: {exc}") from exc
        rule = demo_rule() if predicate.strip().lower() == "demo" else parse(predicate)
        identifier = scar_id or candidate_cassette.content_hash[:12]
        fingerprint = hashlib.sha256(
            (candidate_cassette.content_hash + rule.model_dump_json()).encode("utf-8")
        ).hexdigest()
        candidate = Scar(
            id=identifier,
            cassette=candidate_cassette,
            predicate=rule,
            seed_predicate=rule.model_copy(deep=True),
            source_trace_hash=candidate_cassette.content_hash,
            agent_version_failed=bad,
            agent_version_fixed=good,
            created_at=datetime.now(UTC),
            fingerprint=fingerprint,
        )
        control_paths = sorted(controls.glob("*.jsonl"))
        if not control_paths:
            raise GrudgeError(f"no control JSONL files found in {controls}")
        control_traces = [
            Trace.from_jsonl(read_text(path, label="control")) for path in control_paths
        ]
        verdict = admit(
            candidate,
            load_callable(bad),
            load_callable(good),
            runs=runs,
            controls=control_traces,
            output_dir=out,
        )
        result = {
            "command": "admit",
            "admitted": verdict.admitted,
            "scar_id": candidate.id,
            "saved_path": str(verdict.saved_path) if verdict.saved_path else None,
            "reasons": verdict.reasons,
        }
        if not verdict.admitted:
            finish(result, json_output=json_output)
            raise typer.Exit(code=1)
        return result

    finish(command(run, json_output=json_output, debug=debug), json_output=json_output)
