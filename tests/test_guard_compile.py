"""Compilation and CLI acceptance tests for the Phase 14 guard contract."""

import json
from datetime import UTC, datetime
from pathlib import Path

from typer.testing import CliRunner

from grudge.cli.main import app
from grudge.guard.compile import compile_scar, compile_scars, write_compiled
from grudge.schema import Cassette, Scar
from grudge.schema.cassette import ArgMatcher, CassetteEntry
from grudge.schema.predicate import TaintFlow
from grudge.schema.scar import AdmissionRecord


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
