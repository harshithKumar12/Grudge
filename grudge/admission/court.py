"""Fail-closed, deterministic admission proof for regression scars.

Empty sanity means that an empty trace is not failure evidence. Safety rules
may safely hold on empty; non-vacuity additionally requires witnessed violations
on every successful bad-agent run, alongside clean fixed and control runs.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from grudge.admission.verdict import AdmissionVerdict
from grudge.predicates.compiler import Checker, PredicateResult, compile_predicate
from grudge.replay.sandbox import run_agent
from grudge.replay.scripted_llm import ScriptedLLM
from grudge.schema.scar import AdmissionRecord, Scar
from grudge.schema.trace import ToolResult, Trace

DEFAULT_SCARS_DIR = Path(__file__).resolve().parents[2] / "scars"
_EMPTY_SANITY = (
    "Empty sanity: empty is not failure evidence; safety rules may hold on empty, "
    "and non-vacuity requires witnessed bad-run violations."
)


def _trace_snapshot(trace: Trace, *, allow_empty: bool = False) -> Trace:
    """Revalidate mutable models, including nested steps, before trusting them."""

    if not isinstance(trace, Trace):
        raise TypeError("expected a Trace")
    snapshot = Trace.model_validate(trace.model_dump(warnings="error"), strict=True)
    if snapshot.outcome != "ok":
        details = [
            str(step.meta["failure"])
            for step in snapshot.steps
            if "failure" in step.meta
        ]
        suffix = ": " + "; ".join(details) if details else ""
        raise ValueError("failed or truncated trace" + suffix)
    if not allow_empty and not snapshot.steps:
        raise ValueError("trace must be nonempty")
    for step in snapshot.steps:
        if isinstance(step, ToolResult) and step.error is not None:
            raise ValueError(f"tool replay failed: {step.error}")
        if step.meta.get("failure") or step.meta.get("truncated"):
            raise ValueError("trace contains a failure or truncation marker")
    return snapshot


def _check(checker: Checker, trace: Trace) -> PredicateResult:
    """Reject invalid checker output and evidence absent from the checked trace."""

    result = checker.check(trace)
    if not isinstance(result, PredicateResult):
        raise TypeError("checker did not return a PredicateResult")
    validated = PredicateResult.model_validate(
        result.model_dump(warnings="error"), strict=True
    )
    if any(step not in trace.steps for step in validated.evidence):
        raise ValueError("checker evidence is not present in the trace")
    return validated


def admit(
    scar_candidate: Scar,
    bad_agent: Callable[..., Any],
    good_agent: Callable[..., Any],
    *,
    runs: int,
    controls: Sequence[Trace],
    output_dir: Path | str | None = None,
    timeout: float = 2.0,
    max_steps: int = 128,
) -> AdmissionVerdict:
    """Prove all admission gates and save a detached, proof-bearing Scar.

    A new policy is constructed outside guarded replay for *each* agent run.
    The fixed agent may set its supplied policy to defended mode without
    contaminating another run. Rejections never persist a candidate.
    """

    if isinstance(runs, bool) or not isinstance(runs, int) or runs <= 0:
        raise ValueError("runs must be a positive integer")
    if (
        not math.isfinite(timeout)
        or timeout <= 0
        or isinstance(max_steps, bool)
        or not isinstance(max_steps, int)
        or max_steps <= 0
    ):
        raise ValueError("timeout and max_steps must be positive finite limits")

    verdict = AdmissionVerdict(admitted=False)
    try:
        # Round-tripping also checks models altered through model_copy/construct
        # or in-place mutations, which assignment validation alone cannot catch.
        candidate = Scar.model_validate(
            scar_candidate.model_dump(warnings="error"), strict=True
        ).model_copy(deep=True)
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", candidate.id) is None:
            raise ValueError("scar id must be a safe filename component")
        checker = compile_predicate(candidate.predicate)
    except Exception as exc:
        verdict.reasons.append(
            f"Invalid candidate or predicate: {type(exc).__name__}: {exc}"
        )
        return verdict

    empty = Trace(
        run_id="admission-empty",
        agent_version="admission",
        task=candidate.cassette.task,
        steps=[],
        outcome="ok",
    )
    try:
        verdict.empty_result = _check(checker, empty)
        if verdict.empty_result.violated:
            verdict.reasons.append(
                "Empty sanity failed: predicate violates on empty trace."
            )
    except Exception as exc:
        verdict.reasons.append(f"Empty checker exception: {type(exc).__name__}: {exc}")

    if not controls:
        verdict.reasons.append("At least one nonempty clean control trace is required.")
    for index, control in enumerate(controls, start=1):
        try:
            trace = _trace_snapshot(control)
            result = _check(checker, trace)
            verdict.control_results.append(result)
            if result.violated:
                verdict.reasons.append(
                    f"Control {index} violated: {result.explanation}"
                )
        except Exception as exc:
            verdict.reasons.append(
                f"Control {index} failed: {type(exc).__name__}: {exc}"
            )

    for index in range(1, runs + 1):
        for label, agent, results in (
            ("Bad", bad_agent, verdict.bad_results),
            ("Good", good_agent, verdict.good_results),
        ):
            try:
                policy = ScriptedLLM()
                replay = run_agent(
                    agent,
                    candidate.cassette.model_copy(deep=True),
                    policy,
                    timeout=timeout,
                    max_steps=max_steps,
                )
                trace = _trace_snapshot(replay)
                result = _check(checker, trace)
                results.append(result)
                if label == "Bad":
                    if not result.violated or not result.evidence:
                        verdict.reasons.append(
                            f"Bad run {index} needs a violation "
                            "with nonempty evidence: " + result.explanation
                        )
                    else:
                        verdict.evidence.extend(result.evidence)
                elif result.violated:
                    verdict.reasons.append(
                        f"Good run {index} violated: {result.explanation}"
                    )
            except Exception as exc:
                verdict.reasons.append(
                    f"{label} run {index} replay/checker failed: "
                    f"{type(exc).__name__}: {exc}"
                )

    if verdict.reasons:
        return verdict

    verdict.reasons.extend(
        [
            f"All {runs} bad runs violated with nonempty evidence.",
            f"All {runs} good runs and {len(controls)} controls "
            "were successful and clean.",
            _EMPTY_SANITY,
        ]
    )
    candidate.admission = AdmissionRecord.model_validate(
        {
            "admitted": True,
            "reasons": list(verdict.reasons),
            "bad_runs": len(verdict.bad_results),
            "good_runs": len(verdict.good_results),
            "checked_at": datetime.now(UTC),
            "control_runs": len(verdict.control_results),
            "empty_sanity": _EMPTY_SANITY,
            "evidence": [step.model_dump(mode="json") for step in verdict.evidence],
            "bad_results": [
                result.model_dump(mode="json") for result in verdict.bad_results
            ],
            "good_results": [
                result.model_dump(mode="json") for result in verdict.good_results
            ],
            "control_results": [
                result.model_dump(mode="json") for result in verdict.control_results
            ],
            "empty_result": (
                verdict.empty_result.model_dump(mode="json")
                if verdict.empty_result is not None
                else None
            ),
            "timeout": timeout,
            "max_steps": max_steps,
        }
    )
    try:
        directory = (
            DEFAULT_SCARS_DIR if output_dir is None else Path(output_dir)
        ).resolve()
        target = directory / f"{candidate.id}.scar.json"
        payload = candidate.model_dump_json(indent=2) + "\n"
        directory.mkdir(parents=True, exist_ok=True)
        # Exclusive creation prevents symlink escapes and overwriting an existing
        # proof, including a target swapped between path checking and opening.
        with target.open("x", encoding="utf-8") as handle:
            handle.write(payload)
    except Exception as exc:
        verdict.reasons.append(f"Persistence failed: {type(exc).__name__}: {exc}")
        return verdict
    verdict.admitted = True
    verdict.saved_path = target
    return verdict


__all__ = ["admit"]
