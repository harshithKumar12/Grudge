"""Compilation and CLI acceptance tests for the Phase 14 guard contract."""

import json
import shutil
import subprocess
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from grudge.cli.main import app
from grudge.guard.compile import (
    compile_scar,
    compile_scars,
    evaluate_rule,
    write_compiled,
)
from grudge.predicates import parse_predicate
from grudge.schema import Cassette, Scar
from grudge.schema.cassette import ArgMatcher, CassetteEntry
from grudge.schema.predicate import TaintFlow
from grudge.schema.scar import AdmissionRecord

REPO_ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
BUILT_GUARD = REPO_ROOT / "packages" / "grudge" / "dist" / "grudge.mjs"
GUARD_SOURCE = REPO_ROOT / "packages" / "grudge" / "src" / "cli.js"


def _scar() -> Scar:
    return Scar(
        id="demo-leak",
        cassette=Cassette(
            task="demo",
            world=[
                CassetteEntry(tool="read_file", match=ArgMatcher.any(), response="key"),
                CassetteEntry(
                    tool="http", match=ArgMatcher.any(), response={"ok": True}
                ),
            ],
        ),
        predicate=TaintFlow(source="read_file", sink="http", sink_field="body"),
        seed_predicate="read_file -> http",
        source_trace_hash="trace",
        agent_version_failed="bad",
        agent_version_fixed="good",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        admission=AdmissionRecord(admitted=True, bad_runs=1, good_runs=1),
        fingerprint="demo",
    )


def _call_scar(source: str, scar_id: str = "must-npm-test") -> Scar:
    """Build an admitted Scar from rule source, the way admission stores one."""

    return _scar().model_copy(
        update={
            "id": scar_id,
            "predicate": parse_predicate(source),
            "seed_predicate": source,
            "fingerprint": scar_id,
        }
    )


def _run_node_hook(
    root: Path, session: str, command: str
) -> subprocess.CompletedProcess[str]:
    """Deliver a Claude-style PreToolUse payload to the real Node guard."""

    entry = BUILT_GUARD if BUILT_GUARD.is_file() else GUARD_SOURCE
    payload = {
        "session_id": session,
        "cwd": str(root),
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
    }
    return subprocess.run(
        [str(NODE), str(entry), "hook", "pre-tool-use"],
        cwd=root,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def test_compile_output_is_sorted_and_atomic(tmp_path: Path) -> None:
    first = _scar()
    second = first.model_copy(update={"id": "aaa-leak"})
    payload = compile_scars([first, second])
    assert [rule["id"] for rule in payload["rules"]] == ["aaa-leak", "demo-leak"]
    target = write_compiled(payload, tmp_path / ".grudge" / "compiled.json")
    assert json.loads(target.read_text(encoding="utf-8")) == payload


def test_compile_rejects_unadmitted_scar() -> None:
    candidate = _scar().model_copy(update={"admission": None})
    try:
        compile_scar(candidate, created_from="test")
    except ValueError as exc:
        assert "not admitted" in str(exc)
    else:
        raise AssertionError("unadmitted Scar was compiled")


def test_compile_cli_writes_demo_scar(tmp_path: Path) -> None:
    scar_path = tmp_path / "demo.scar.json"
    _scar().write(scar_path)
    output = tmp_path / "compiled.json"
    result = CliRunner().invoke(
        app,
        ["compile", "--scars", str(tmp_path), "--out", str(output), "--json"],
    )
    assert result.exit_code == 0, result.stdout
    assert (
        json.loads(output.read_text(encoding="utf-8"))["rules"][0]["id"]
        == "demo-leak"
    )


def test_bare_call_shape_compiles_as_a_requirement() -> None:
    """P1-1: `must call` parses to a bare CallShape and must stay a requirement."""

    rule = compile_scar(
        _call_scar('must call shell where command ~ "npm test"'), created_from="test"
    )
    assert rule["kind"] == "call_shape"
    assert rule["match"] == {"command": {"$contains": "npm test"}}
    assert rule["polarity"] == "must"


def test_negated_call_shape_compiles_as_a_prohibition() -> None:
    """`never call` is a PredicateSet(kind="not") and stays a prohibition."""

    for source in ('never call shell', 'never call shell where command ~ "rm -rf"'):
        rule = compile_scar(_call_scar(source), created_from="test")
        assert rule["kind"] == "call_shape"
        assert rule["polarity"] == "never", source


def test_ordering_and_taint_polarity_are_unchanged() -> None:
    """The polarity fix must not move ordering or taint classification."""

    ordering = compile_scar(
        _call_scar("must call verify_user before call transfer"), created_from="test"
    )
    assert ordering["kind"] == "ordering"
    assert ordering["polarity"] == "must"

    taint = compile_scar(_scar(), created_from="test")
    assert taint["kind"] == "taint_flow"
    assert taint["polarity"] == "never"

    filtered = compile_scar(
        _call_scar(
            'never call http where body tainted_by read_file(path = "secret.txt")'
        ),
        created_from="test",
    )
    assert filtered["kind"] == "taint_flow"
    assert filtered["polarity"] == "never"


def test_compiled_must_rule_is_evaluated_as_a_requirement() -> None:
    """The runtime half: a satisfied must call is allowed, a missing one is not."""

    rule = compile_scars([_call_scar('must call shell where command ~ "npm test"')])[
        "rules"
    ][0]
    matching: list[Mapping[str, Any]] = [
        {"tool": "shell", "args": {"command": "npm test"}}
    ]
    other: list[Mapping[str, Any]] = [
        {"tool": "shell", "args": {"command": "ls -la"}}
    ]
    assert evaluate_rule(rule, matching) == {"violated": False, "atEvents": [0]}
    assert evaluate_rule(rule, other) == {"violated": True, "atEvents": []}


@pytest.mark.skipif(NODE is None, reason="node is required for the Node guard")
def test_python_compiled_must_call_is_enforced_by_the_node_guard(
    tmp_path: Path,
) -> None:
    """End to end: Python compiles the Scar, the Node guard enforces it.

    The compiler here is the Python one; the Node compiler is never invoked.
    ``npm test`` satisfies the requirement, so ``ls -la`` is the call that
    violates it. Before the polarity fix the two verdicts were swapped.
    """

    payload = compile_scars([_call_scar('must call shell where command ~ "npm test"')])
    compiled = write_compiled(payload, tmp_path / ".grudge" / "compiled.json")
    (tmp_path / ".grudge" / "config.json").write_text("{}\n", encoding="utf-8")

    rule = json.loads(compiled.read_text(encoding="utf-8"))["rules"][0]
    assert (rule["kind"], rule["polarity"]) == ("call_shape", "must")

    allowed = _run_node_hook(tmp_path, "must-allow", "npm test")
    assert allowed.returncode == 0, allowed.stderr
    assert allowed.stdout == ""

    blocked = _run_node_hook(tmp_path, "must-deny", "ls -la")
    assert blocked.returncode == 2, blocked.stderr
    decision = json.loads(blocked.stdout)
    assert decision["blocked"] is True
    assert decision["scarId"] == "must-npm-test"
