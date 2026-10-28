"""Focused contract tests for the Phase 1 Scar schema."""

from datetime import UTC, datetime
from pathlib import Path

import pytest

from grudge.errors import SchemaError
from grudge.schema.cassette import Cassette
from grudge.schema.predicate import CallShape, PredicateSet
from grudge.schema.scar import AdmissionRecord, Scar


def make_scar() -> Scar:
    """Build a representative Scar with and without admission evidence."""

    return Scar(
        id="leak-1",
        cassette=Cassette(task="summarize mail"),
        predicate=PredicateSet.not_(CallShape(tool="send_http")),
        seed_predicate="read_file(api_keys.txt) -> send_http",
        source_trace_hash="trace-hash-1",
        agent_version_failed="agent-bad-1",
        agent_version_fixed="agent-good-1",
        created_at=datetime(2026, 1, 2, tzinfo=UTC),
        admission=AdmissionRecord(
            admitted=True,
            reasons=["red on failing agent", "green on fixed agent"],
            bad_runs=1,
            good_runs=1,
        ),
        fingerprint="fingerprint-1",
    )


def test_scar_json_file_round_trip(tmp_path: Path) -> None:
    scar = make_scar()
    path = tmp_path / "leak-1.scar.json"

    assert scar.write(path) == path
    restored = Scar.from_file(path)

    assert restored.model_dump(mode="json") == scar.model_dump(mode="json")


def test_scar_invalid_payloads_and_paths_raise_schema_error(
    tmp_path: Path,
) -> None:
    with pytest.raises(SchemaError):
        Scar.model_validate({"id": "missing-fields"})

    with pytest.raises(SchemaError):
        AdmissionRecord(admitted=[])  # type: ignore[arg-type]  # invalid on purpose

    with pytest.raises(SchemaError):
        make_scar().write(tmp_path / "scar.json")

    malformed = tmp_path / "malformed.scar.json"
    malformed.write_text("not-json", encoding="utf-8")
    with pytest.raises(SchemaError):
        Scar.load(malformed)
