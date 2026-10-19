"""Generate deterministic synthetic failing traces for benchmark runs.

The generator deliberately uses only the Python standard library so it can be
run before the project environment is installed.  The emitted JSONL follows
the canonical metadata-plus-step shape used by :class:`grudge.schema.trace.Trace`.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TextIO

DEFAULT_STEPS = 10
RUN_ID = "synthetic-benchmark-failure"
AGENT_VERSION = "benchmark-agent/1"
TASK = "reproduce a synthetic failing tool interaction"


def _positive_int(value: str) -> int:
    """Parse a strictly positive integer for an argparse option."""

    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def _step(idx: int) -> dict[str, object]:
    """Return one stable synthetic step for ``idx``."""

    common: dict[str, object] = {
        "idx": idx,
        "parent_idx": None,
        "run_id": RUN_ID,
        "ts": (datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=idx))
        .isoformat()
        .replace("+00:00", "Z"),
        "meta": {"source": "synthetic", "benchmark": "phase12"},
    }
    kind = idx % 5
    if kind == 0:
        return {
            **common,
            "kind": "model_call",
            "messages": None,
            "model": "offline-scripted",
            "prompt": "Inspect the input and complete the task.",
            "response": {"status": "continue"},
        }
    if kind == 1:
        return {
            **common,
            "kind": "tool_call",
            "tool": "read_file",
            "args": {"path": "fixture.txt"},
            "call_id": f"call-{idx}",
        }
    if kind == 2:
        return {
            **common,
            "kind": "tool_result",
            "call_id": f"call-{idx - 1}",
            "content": None,
            "error": "synthetic benchmark failure",
        }
    if kind == 3:
        return {
            **common,
            "kind": "state_diff",
            "diff": {"status": "failed", "failure_step": 2},
        }
    return {
        **common,
        "kind": "final_answer",
        "answer": "Synthetic failure reproduced.",
    }


def generate_trace(steps: int) -> str:
    """Return canonical JSONL for a deterministic failing trace."""

    if steps < 1:
        raise ValueError("steps must be greater than zero")
    records: list[dict[str, object]] = [
        {
            "type": "trace",
            "run_id": RUN_ID,
            "agent_version": AGENT_VERSION,
            "task": TASK,
            "outcome": "failed",
        }
    ]
    records.extend(_step(idx) for idx in range(steps))
    return "".join(
        json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
        for record in records
    )


def _write(payload: str, output: Path | None, stream: TextIO) -> None:
    """Write ``payload`` to a file or stdout."""

    if output is None:
        stream.write(payload)
        return
    try:
        output.write_text(payload, encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"cannot write output path {output}: {exc}") from exc


def main(argv: list[str] | None = None) -> int:
    """Parse arguments, generate a trace, and write it."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="destination JSONL path (default: stdout; use '-' for stdout)",
    )
    parser.add_argument(
        "-n",
        "--steps",
        type=_positive_int,
        default=DEFAULT_STEPS,
        help=f"number of synthetic steps (default: {DEFAULT_STEPS})",
    )
    args = parser.parse_args(argv)

    output = None if args.output is None or str(args.output) == "-" else args.output
    if output is not None:
        if output.exists() and output.is_dir():
            parser.error(f"output path is a directory: {output}")
        if not output.parent.exists():
            parser.error(f"output directory does not exist: {output.parent}")
    try:
        _write(generate_trace(args.steps), output, sys.stdout)
    except ValueError as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
