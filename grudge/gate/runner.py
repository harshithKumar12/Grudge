"""Deterministic, fail-closed execution of an admitted Scar gate."""

from __future__ import annotations

import copy
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from grudge.config import DEFAULTS
from grudge.predicates.compiler import Checker, PredicateResult, compile_predicate
from grudge.replay.sandbox import run_agent as replay_agent
from grudge.replay.scripted_llm import ScriptedLLM
from grudge.schema.scar import Scar
from grudge.schema.trace import Step, ToolResult, Trace

DEFAULT_RUNS = DEFAULTS.n_runs
DEFAULT_THRESHOLD = DEFAULTS.gate_threshold
DEFAULT_Z = DEFAULTS.wilson_z
DEFAULT_TIMEOUT = 2.0
DEFAULT_MAX_STEPS = 128


def wilson_lower_bound(successes: int, runs: int, z: float = DEFAULT_Z) -> float:
    """Return the Wilson lower confidence bound for a binomial proportion.

    The zero-run case is deliberately safe and returns zero.  The runner never
    creates a zero-run result, but keeping this helper total makes reporting and
    callers that calculate a bound independently fail closed as well.
    """

    if runs <= 0:
        return 0.0
    if not math.isfinite(z) or z <= 0:
        raise ValueError("z must be a positive finite number")
    successes = max(0, min(successes, runs))
    n = float(runs)
    p = successes / n
    z_squared = z * z
    denominator = 1.0 + z_squared / n
    centre = p + z_squared / (2.0 * n)
    spread = z * math.sqrt(p * (1.0 - p) / n + z_squared / (4.0 * n * n))
    return max(0.0, min(1.0, (centre - spread) / denominator))


@dataclass(slots=True)
class RunResult:
    """Evidence and outcome for one replay/checker attempt."""

    number: int
    passed: bool
    replay_succeeded: bool
    trace: Trace | None = None
    predicate_result: PredicateResult | None = None
    evidence: list[Step] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    @property
    def observation(self) -> str:
        """Return the stable, human-readable outcome for this run."""

        if self.reasons:
            return "; ".join(self.reasons)
        return "replay succeeded and predicate was not violated"


@dataclass(slots=True)
class GateResult:
    """Complete statistical gate result, including per-run evidence."""

    scar_id: str
    successes: int
    runs: int
    pass_rate: float
    lower_bound: float
    threshold: float
    passed: bool
    run_results: list[RunResult] = field(default_factory=list)
    observations: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    offline: bool = True
    seed: int | None = None
    z: float = DEFAULT_Z

    @property
    def pass_count(self) -> int:
        """Compatibility name for the number of passing gate runs."""

        return self.successes

    @property
    def results(self) -> list[RunResult]:
        """Compatibility alias for the per-run evidence list."""

        return self.run_results

    @property
    def exit_code(self) -> int:
        """Return the CI status for an already-evaluated result."""

        return 0 if self.passed else 1


def _validate_config(
    runs: int,
    threshold: float,
    z: float,
    timeout: float,
    max_steps: int,
    offline: bool,
    seed: int | None,
) -> None:
    if isinstance(runs, bool) or not isinstance(runs, int) or runs <= 0:
        raise ValueError("runs must be a positive integer")
    if isinstance(threshold, bool) or not isinstance(threshold, int | float):
        raise ValueError("threshold must be a finite number in [0, 1]")
    if not math.isfinite(float(threshold)) or not 0 <= threshold <= 1:
        raise ValueError("threshold must be a finite number in [0, 1]")
    if (
        isinstance(z, bool)
        or not isinstance(z, int | float)
        or not math.isfinite(z)
        or z <= 0
    ):
        raise ValueError("z must be a positive finite number")
    if (
        not isinstance(timeout, int | float)
        or not math.isfinite(timeout)
        or timeout <= 0
    ):
        raise ValueError("timeout must be a positive finite number")
    if isinstance(max_steps, bool) or not isinstance(max_steps, int) or max_steps <= 0:
        raise ValueError("max_steps must be a positive integer")
    if not isinstance(offline, bool):
        raise ValueError("offline must be a boolean")
    if seed is not None and (isinstance(seed, bool) or not isinstance(seed, int)):
        raise ValueError("seed must be an integer or None")


def _admitted_snapshot(scar: Scar) -> Scar:
    if not isinstance(scar, Scar):
        raise ValueError("scar must be a Scar")
    try:
        snapshot = Scar.model_validate(scar.model_dump(warnings="error"), strict=True)
    except Exception as exc:
        raise ValueError(f"invalid Scar: {type(exc).__name__}: {exc}") from exc
    if snapshot.admission is None or not snapshot.admission.admitted:
        raise ValueError("Scar must have a true admission record before it can run")
    return snapshot.model_copy(deep=True)


def _trace_snapshot(trace: Trace) -> Trace:
    """Revalidate replay output and reject every known failure marker."""

    if not isinstance(trace, Trace):
        raise TypeError("agent replay did not return a Trace")
    snapshot = Trace.model_validate(trace.model_dump(warnings="error"), strict=True)
    if snapshot.outcome != "ok":
        failures = [
            str(step.meta["failure"])
            for step in snapshot.steps
            if "failure" in step.meta
        ]
        detail = ": " + "; ".join(failures) if failures else ""
        raise RuntimeError(f"replay failed{detail}")
    if not snapshot.steps:
        raise RuntimeError("replay produced an empty trace")
    for step in snapshot.steps:
        if isinstance(step, ToolResult) and step.error is not None:
            raise RuntimeError(f"tool replay failed: {step.error}")
        if step.meta.get("failure") or step.meta.get("truncated"):
            raise RuntimeError("trace contains a failure or truncation marker")
    return snapshot


def _check(checker: Checker, trace: Trace) -> PredicateResult:
    result = checker.check(trace)
    if not isinstance(result, PredicateResult):
        raise TypeError("checker did not return a PredicateResult")
    checked = PredicateResult.model_validate(
        result.model_dump(warnings="error"), strict=True
    )
    if any(step not in trace.steps for step in checked.evidence):
        raise ValueError("checker evidence is not present in the replay trace")
    return checked


def _normalise_arguments(
    scar: Scar | Callable[..., Any],
    agent: Callable[..., Any] | Scar | None,
) -> tuple[Scar, Callable[..., Any]]:
    """Accept both ``run_gate(scar, agent)`` and ``run_gate(agent, scar)``."""

    if isinstance(scar, Scar) and callable(agent):
        return scar, agent
    if callable(scar) and isinstance(agent, Scar):
        return agent, scar
    raise ValueError("run_gate requires an admitted Scar and a callable agent")


def run_gate(
    scar: Scar | Callable[..., Any],
    agent: Callable[..., Any] | Scar | None = None,
    *,
    runs: int = DEFAULT_RUNS,
    threshold: float = DEFAULT_THRESHOLD,
    z: float = DEFAULT_Z,
    timeout: float = DEFAULT_TIMEOUT,
    max_steps: int = DEFAULT_MAX_STEPS,
    offline: bool = True,
    seed: int | None = None,
) -> GateResult:
    """Run an admitted Scar repeatedly and apply its Wilson lower bound.

    Every attempt gets a deep cassette copy and a newly constructed
    :class:`ScriptedLLM`.  ``offline`` and ``seed`` are explicit policy metadata;
    the built-in policy is deterministic in either case and never performs I/O.
    """

    _validate_config(runs, threshold, z, timeout, max_steps, offline, seed)
    candidate, agent_fn = _normalise_arguments(scar, agent)
    candidate = _admitted_snapshot(candidate)
    try:
        checker = compile_predicate(candidate.predicate)
    except Exception as exc:
        raise ValueError(
            f"predicate compilation failed: {type(exc).__name__}: {exc}"
        ) from exc

    run_results: list[RunResult] = []
    for number in range(1, runs + 1):
        result = RunResult(
            number=number,
            passed=False,
            replay_succeeded=False,
        )
        try:
            policy = (
                ScriptedLLM(config={"seed": seed})
                if seed is not None
                else ScriptedLLM()
            )
            trace = replay_agent(
                agent_fn,
                copy.deepcopy(candidate.cassette),
                policy,
                timeout=float(timeout),
                max_steps=max_steps,
            )
            result.trace = _trace_snapshot(trace)
            result.replay_succeeded = True
            result.predicate_result = _check(checker, result.trace)
            result.evidence = list(result.predicate_result.evidence)
            if result.predicate_result.violated:
                result.reasons.append(
                    "predicate violation: " + result.predicate_result.explanation
                )
            else:
                result.passed = True
        except Exception as exc:
            result.reasons.append(f"{type(exc).__name__}: {exc}")
        run_results.append(result)

    successes = sum(run_result.passed for run_result in run_results)
    pass_rate = successes / runs if runs else 0.0
    lower_bound = wilson_lower_bound(successes, runs, float(z))
    passed = lower_bound >= float(threshold)
    mode = (
        "Offline deterministic mode: fresh ScriptedLLM and deep-copied "
        "cassette per run."
        if offline
        else "Deterministic policy mode: fresh ScriptedLLM and deep-copied "
        "cassette per run."
    )
    reasons = [
        f"Run {run.number}: {run.observation}" for run in run_results if not run.passed
    ]
    observations = [mode]
    observations.append(
        f"{successes}/{runs} gate runs passed; Wilson lower bound "
        f"{lower_bound:.4f} versus threshold {float(threshold):.4f}."
    )
    if not passed and not reasons:
        reasons.append("Wilson lower bound is below the configured threshold")
    return GateResult(
        scar_id=candidate.id,
        successes=successes,
        runs=runs,
        pass_rate=pass_rate,
        lower_bound=lower_bound,
        threshold=float(threshold),
        passed=passed,
        run_results=run_results,
        observations=observations,
        reasons=reasons,
        offline=offline,
        seed=seed,
        z=float(z),
    )


def gate(
    scar: Scar | Callable[..., Any],
    agent: Callable[..., Any] | Scar | None = None,
    **kwargs: Any,
) -> int:
    """Return a small CI-friendly status without implementing a CLI."""

    try:
        result = run_gate(scar, agent, **kwargs)
    except (ValueError, TypeError):
        return 2
    return result.exit_code


__all__ = [
    "GateResult",
    "RunResult",
    "gate",
    "run_gate",
    "wilson_lower_bound",
]
