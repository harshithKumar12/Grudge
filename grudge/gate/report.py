"""Deterministic terminal and pull-request reports for gate results."""

from __future__ import annotations

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from grudge.gate.runner import GateResult


def _clean(value: object) -> str:
    return " ".join(str(value).replace("|", "\\|").splitlines())


def status_text(result: GateResult) -> str:
    """Return the stable status label shared by terminal and markdown output."""

    return "PASS" if result.passed else "BLOCKED"


def render_terminal(result: GateResult, console: Console | None = None) -> str:
    """Render a Rich report and return captured text when no console is supplied."""

    owns_console = console is None
    target = console or Console(record=True, width=120, color_system=None)
    colour = "green" if result.passed else "red"
    target.print(
        Panel(
            f"[bold {colour}]{status_text(result)}[/bold {colour}]  "
            f"Scar: {result.scar_id}",
            title="Grudge gate",
        )
    )
    summary = Table(show_header=True, header_style="bold")
    for column in ("Passes", "Runs", "Pass rate", "Wilson lower", "Threshold", "Mode"):
        summary.add_column(column)
    summary.add_row(
        f"{result.successes}",
        f"{result.runs}",
        f"{result.pass_rate:.2%}",
        f"{result.lower_bound:.4f}",
        f"{result.threshold:.4f}",
        "offline/deterministic" if result.offline else "deterministic",
    )
    target.print(summary)
    for observation in result.observations:
        target.print(f"- {observation}")
    if result.reasons:
        target.print("Reasons:")
        for reason in result.reasons:
            target.print(f"  - {reason}")
    if owns_console:
        return target.export_text()
    return ""


def render_markdown(result: GateResult) -> str:
    """Return a deterministic PR comment; this function performs no network I/O."""

    status = status_text(result)
    lines = [
        f"## Grudge gate: **{status}**",
        "",
        f"- Scar: `{_clean(result.scar_id)}`",
        f"- Gate runs: `{result.successes}/{result.runs}`",
        f"- Pass rate: `{result.pass_rate:.4f}`",
        f"- Wilson lower bound: `{result.lower_bound:.4f}`",
        f"- Threshold: `{result.threshold:.4f}`",
        f"- Mode: **{'offline/deterministic' if result.offline else 'deterministic'}**",
        "",
        "### Observations",
    ]
    lines.extend(f"- {_clean(item)}" for item in result.observations)
    if result.reasons:
        lines.extend(["", "### Failed runs / reasons"])
        lines.extend(f"- {_clean(item)}" for item in result.reasons)
    lines.extend(
        [
            "",
            "### Per-run evidence",
            "| Run | Replay | Predicate | Gate | Evidence / reason |",
            "| ---: | :---: | :---: | :---: | --- |",
        ]
    )
    for run in result.run_results:
        predicate = (
            "clean"
            if run.predicate_result is not None and not run.predicate_result.violated
            else "violation"
            if run.predicate_result is not None
            else "not evaluated"
        )
        evidence = (
            f"{len(run.evidence)} evidence step(s)"
            if run.evidence
            else _clean(run.observation)
        )
        lines.append(
            f"| {run.number} | "
            f"{'ok' if run.replay_succeeded else 'failed'} | {predicate} | "
            f"{'pass' if run.passed else 'fail'} | {evidence} |"
        )
    return "\n".join(lines) + "\n"


def render_pr_comment(result: GateResult) -> str:
    """Alias naming the markdown format used by pull-request integrations."""

    return render_markdown(result)


def render_report(result: GateResult, console: Console | None = None) -> str:
    """Backward-compatible report entry point for Rich terminal output."""

    return render_terminal(result, console)


__all__ = [
    "render_markdown",
    "render_pr_comment",
    "render_report",
    "render_terminal",
    "status_text",
]
