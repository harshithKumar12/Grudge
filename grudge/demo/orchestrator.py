"""Real, offline five-beat orchestration for the Grudge demonstration.

The orchestrator deliberately calls the existing capture, replay, shrink,
predicate, admission, and gate engines.  Events are narration only: all
decisions continue to come from the deterministic pipeline implementation.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Mapping
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from examples.leaky_agent.agent import run_agent as vulnerable_agent
from examples.leaky_agent.agent_fixed import run_agent as fixed_agent
from grudge.admission.court import admit
from grudge.config import DEFAULTS, SCARS_DIR
from grudge.demo.events import (
    AdmissionResult,
    BeatStarted,
    DemoEvent,
    DemoFinished,
    DemoStarted,
    EventBus,
    GateResult,
    PredicateSynthesized,
    RegressionDetected,
    ShrinkAttempt,
    ShrinkDone,
    ShrinkStarted,
    TraceOutcome,
    TraceStep,
)
from grudge.gate.report import render_markdown
from grudge.gate.runner import run_gate
from grudge.predicates.fallback_rules import demo_rule
from grudge.predicates.synthesizer import synthesize
from grudge.replay.sandbox import world_from_trace
from grudge.replay.scripted_llm import ScriptedLLM
from grudge.schema.scar import Scar
from grudge.schema.trace import FinalAnswer, ToolCall, ToolResult, Trace
from grudge.shrinker.cassette_builder import build_minimal_cassette

ROOT = Path(__file__).resolve().parents[2]
CONTROLS = ROOT / "examples" / "leaky_agent" / "controls"

BEATS = (
    (1, "The prompt injection leaks a fake secret"),
    (2, "Shrink the failure to its causal cassette"),
    (3, "Synthesize a never-again predicate"),
    (4, "Prove the Scar: red on bad, green on fixed"),
    (5, "Reintroduce the bug and block the regression"),
)
DEFAULT_PACING = 0.4


def _summary(step: Any) -> str:
    """Produce a short, secret-safe summary for the viewer timeline."""

    if isinstance(step, ToolCall):
        return f"call {step.tool}"
    if isinstance(step, ToolResult):
        return "tool result" if step.error is None else f"tool error: {step.error}"
    if isinstance(step, FinalAnswer):
        return "final answer"
    return str(step.kind).replace("_", " ")


def _load_controls() -> list[Trace]:
    """Load the checked-in benign traces without touching the network."""

    paths = sorted(CONTROLS.glob("*.jsonl"))
    if not paths:
        raise FileNotFoundError(f"offline demo controls do not exist: {CONTROLS}")
    return [Trace.from_jsonl(path.read_text(encoding="utf-8")) for path in paths]


def _seed_failure(trace: Trace) -> bool:
    """Detect the seed leak before the synthesized predicate exists."""

    results = {
        step.call_id: step
        for step in trace.steps
        if isinstance(step, ToolResult) and step.error is None
    }
    source_values: list[str] = []
    for call_id, result in results.items():
        if not any(
            isinstance(step, ToolCall)
            and step.call_id == call_id
            and step.tool == "read_file"
            for step in trace.steps
        ):
            continue
        content = result.content
        values = content.values() if isinstance(content, Mapping) else [content]
        source_values.extend(json.dumps(value, sort_keys=True) for value in values)
    for step in trace.steps:
        if not isinstance(step, ToolCall) or step.tool != "send_http":
            continue
        arguments = json.dumps(step.args, sort_keys=True)
        if any(value and value in arguments for value in source_values):
            return True
    return False


def _candidate(base: Scar, predicate: Any, source: Trace) -> Scar:
    """Build an unadmitted candidate from the complete offline proof cassette."""

    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "cassette": base.cassette.model_dump(mode="json"),
                "predicate": predicate.model_dump(mode="json"),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return base.model_copy(
        update={
            "id": "phase10_demo",
            # The compact shrink result is narrated in beat 2. Admission uses
            # the checked-in four-entry cassette because it retains the sink
            # response required for a complete replay proof.
            "cassette": base.cassette.model_copy(deep=True),
            "predicate": predicate,
            "seed_predicate": demo_rule(),
            "source_trace_hash": hashlib.sha256(
                source.to_jsonl().encode("utf-8")
            ).hexdigest(),
            "fingerprint": fingerprint,
            "admission": None,
        },
        deep=True,
    )


def _emit(bus: EventBus, event: DemoEvent, pacing: float) -> DemoEvent:
    """Publish an event and optionally pause for the projector-friendly story."""

    published = bus.publish(event)
    if pacing:
        time.sleep(pacing)
    return published


def _gate_event(agent: str, result: Any) -> GateResult:
    return GateResult(
        agent=agent,
        passes=result.successes,
        n=result.runs,
        wilson=result.lower_bound,
        threshold=result.threshold,
        passed=result.passed,
    )


def run_demo(
    *,
    bus: EventBus | None = None,
    fast: bool = False,
    runs: int = DEFAULTS.n_runs,
    pacing: float | None = None,
) -> list[DemoEvent]:
    """Run the five-beat offline story and return its ordered event log.

    ``fast`` disables all sleeps for tests and CI.  ``pacing`` is an explicit
    override for presenters; it is measured in seconds per emitted event.
    """

    if isinstance(runs, bool) or not isinstance(runs, int) or runs <= 0:
        raise ValueError("runs must be a positive integer")
    if pacing is not None and pacing < 0:
        raise ValueError("pacing must be non-negative")
    stream = bus or EventBus()
    stream.clear()
    # About 200 narrated events at 0.4 seconds each plus the real engine work
    # gives the default presenter path the specified 75-95 second runtime.
    delay = 0.0 if fast else (DEFAULT_PACING if pacing is None else pacing)
    gate_runs = 1 if fast else runs
    gate_threshold = 0.000001 if fast else DEFAULTS.gate_threshold
    _emit(stream, DemoStarted(), delay)

    base = Scar.load(SCARS_DIR / "sample_leak.scar.json")

    _emit(stream, BeatStarted(n=1, title=BEATS[0][1]), delay)
    captured = vulnerable_agent()
    for step in captured.steps:
        _emit(
            stream,
            TraceStep(
                idx=step.idx,
                kind=step.kind,
                summary=_summary(step),
                status="failed" if step.meta.get("failure") else "ok",
            ),
            delay,
        )
    leaked = any(
        isinstance(step, ToolCall) and step.tool == "send_http"
        for step in captured.steps
    )
    _emit(stream, TraceOutcome(leaked=leaked), delay)

    _emit(stream, BeatStarted(n=2, title=BEATS[1][1]), delay)
    # Capture/replay produced the full world above.  The checked-in Scar is the
    # compact offline starting point for the visual shrink, keeping CI fast
    # while still exercising the real reducer/oracle engine.
    world_from_trace(captured)
    shrink_input = base.cassette.model_copy(deep=True)
    _emit(stream, ShrinkStarted(total=len(shrink_input.world)), delay)
    shrink = build_minimal_cassette(
        shrink_input,
        agent_fn=vulnerable_agent,
        seed_predicate=_seed_failure,
        llm=ScriptedLLM(),
        max_oracle_calls=1000,
    )
    for history in shrink.history:
        _emit(
            stream,
            ShrinkAttempt(
                removed=int(history.get("attempted_removal", 0)),
                kept=bool(history.get("kept", False)),
                remaining=int(
                    history.get("size_after") or history.get("size_before") or 0
                ),
            ),
            delay,
        )
    _emit(
        stream,
        ShrinkDone(
            before=shrink.stats["original_entries"],
            after=shrink.stats["minimal_entries"],
            bytes=shrink.stats["minimal_bytes"],
        ),
        delay,
    )

    _emit(stream, BeatStarted(n=3, title=BEATS[2][1]), delay)
    synthesis = synthesize(shrink, captured, offline=DEFAULTS.offline)
    _emit(
        stream,
        PredicateSynthesized(
            dsl=synthesis.dsl,
            english=synthesis.rationale,
            source=synthesis.source,
        ),
        delay,
    )

    _emit(stream, BeatStarted(n=4, title=BEATS[3][1]), delay)
    candidate = _candidate(base, synthesis.predicate, captured)
    with TemporaryDirectory(prefix=".phase10-proof-") as proof_dir:
        verdict = admit(
            candidate,
            vulnerable_agent,
            fixed_agent,
            # Admission needs one witnessed red/green proof; statistical
            # repetition is the gate's responsibility and is emitted below.
            runs=1,
            controls=_load_controls(),
            output_dir=proof_dir,
        )
        if not verdict.admitted or verdict.saved_path is None:
            raise RuntimeError(
                "offline demo admission was rejected: " + "; ".join(verdict.reasons)
            )
        admitted = Scar.load(verdict.saved_path)
        _emit(
            stream,
            AdmissionResult(
                admitted=True,
                reasons=verdict.reasons,
                bad="red",
                good="green",
            ),
            delay,
        )
        bad_gate = run_gate(
            admitted,
            vulnerable_agent,
            runs=gate_runs,
            threshold=gate_threshold,
            offline=DEFAULTS.offline,
        )
        good_gate = run_gate(
            admitted,
            fixed_agent,
            runs=gate_runs,
            threshold=gate_threshold,
            offline=DEFAULTS.offline,
        )
        _emit(stream, _gate_event("vulnerable", bad_gate), delay)
        _emit(stream, _gate_event("fixed", good_gate), delay)

        _emit(stream, BeatStarted(n=5, title=BEATS[4][1]), delay)
        # Beat 5 deliberately swaps the fixed callable back to the vulnerable
        # one, making the regression a fresh gate decision.
        regression = run_gate(
            admitted,
            vulnerable_agent,
            runs=gate_runs,
            threshold=gate_threshold,
            offline=DEFAULTS.offline,
        )
        _emit(stream, _gate_event("vulnerable", regression), delay)
        if regression.passed:
            raise RuntimeError("regression gate unexpectedly passed")
        _emit(
            stream,
            RegressionDetected(markdown=render_markdown(regression)),
            delay,
        )

    _emit(stream, DemoFinished(), delay)
    return stream.snapshot()


__all__ = ["BEATS", "DEFAULT_PACING", "run_demo"]
