"""Shrink a captured trace into a minimal replay cassette."""

# Typer's declarative Option defaults are intentional here.
# ruff: noqa: B008

import json
from pathlib import Path
from typing import Any

import typer

from grudge.cli._common import command, finish, load_callable, read_text, write_text
from grudge.predicates.compiler import compile_predicate
from grudge.predicates.dsl import parse
from grudge.predicates.fallback_rules import demo_rule
from grudge.recorder.redact import redact_trace
from grudge.replay.sandbox import world_from_trace
from grudge.replay.scripted_llm import ScriptedLLM
from grudge.schema.trace import ToolResult, Trace
from grudge.shrinker.cassette_builder import build_minimal_cassette
from grudge.shrinker.oracle import OracleResult, PredicateOracle


class _ReplayCompleteOracle:
    """Keep CLI cassettes admissible by rejecting incomplete replays."""

    def __init__(self, inner: PredicateOracle, seed: Any) -> None:
        self.inner = inner
        self.checker = compile_predicate(seed)
        self.calls = 0
        self.cache_hits = 0

    def reproduces(self, cassette: Any) -> OracleResult:
        self.calls = self.inner.calls
        self.cache_hits = self.inner.cache_hits
        result = self.inner.reproduces(cassette)
        self.calls = self.inner.calls
        self.cache_hits = self.inner.cache_hits
        if not result.reproduced or result.trace is None:
            return result
        errors = [
            step.error
            for step in result.trace.steps
            if isinstance(step, ToolResult) and step.error is not None
        ]
        if result.trace.outcome != "ok" or errors:
            reason = errors[0] if errors else "failed or truncated trace"
            return OracleResult(False, result.trace, f"replay failed: {reason}")
        checked = self.checker.check(result.trace)
        if not checked.violated:
            return OracleResult(False, result.trace, "seed predicate did not reproduce")
        return result


def shrink_trace(
    trace: Path,
    failure: str = typer.Option(
        ..., "--failure", "-f", help="Seed failure rule in Grudge DSL."
    ),
    out: Path = typer.Option(..., "--out", "-o", help="Destination cassette JSON."),
    agent: str = typer.Option(
        "examples.leaky_agent.agent",
        "--agent",
        "-a",
        help="Agent module used to evaluate candidate cassettes.",
    ),
    json_output: bool = typer.Option(False, "--json", "-j", help="Emit JSON output."),
    debug: bool = typer.Option(False, "--debug", help="Show a traceback on errors."),
) -> None:
    """Shrink a failing trace while retaining the supplied seed failure."""

    def run() -> dict[str, Any]:
        source = Trace.from_jsonl(read_text(trace, label="trace"))
        cassette = world_from_trace(source)
        seed = demo_rule() if failure.strip().lower() == "demo" else parse(failure)
        result = build_minimal_cassette(
            cassette,
            _ReplayCompleteOracle(
                PredicateOracle(
                    load_callable(agent),
                    seed,
                    llm=ScriptedLLM(),
                    max_oracle_calls=5000,
                ),
                seed,
            ),
        )
        write_text(
            out,
            json.dumps(
                redact_trace(result.minimal.model_dump(mode="json")),
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            label="cassette",
        )
        if not json_output:
            for event in result.history:
                typer.echo(
                    f"shrink: {event['reducer']} "
                    f"{event['size_before']} -> {event['size_after']} "
                    f"({'kept' if event['kept'] else 'discarded'})"
                )
        return {
            "command": "shrink",
            "cassette": str(out),
            "original_entries": result.stats["original_entries"],
            "minimal_entries": result.stats["minimal_entries"],
            "original_bytes": result.stats["original_bytes"],
            "minimal_bytes": result.stats["minimal_bytes"],
            "oracle_calls": result.stats["oracle_calls"],
            "history_events": result.stats["history_events"],
        }

    finish(command(run, json_output=json_output, debug=debug), json_output=json_output)
