"""Focused contract tests for the Phase 1 predicate schema."""

import json

import pytest

from grudge.errors import SchemaError
from grudge.schema.predicate import (
    CallShape,
    Ordering,
    Outcome,
    PredicateSet,
    TaintFlow,
)


def test_predicate_models_round_trip_and_describe_exactly() -> None:
    call = CallShape(tool="send_http", args={"body": "secret", "url": "example"})
    ordering = Ordering(first="verify_user", then="transfer_funds")
    taint = TaintFlow(
        source="read_file",
        sink="send_http",
        source_field="content",
        sink_field="body",
    )
    outcome = Outcome(status="failed")
    combined = PredicateSet.all_of([call, ordering, taint, outcome])

    assert call.describe() == (
        'Call `send_http` with arguments matching {"body": "secret", "url": "example"}.'
    )
    assert ordering.describe() == "Call `verify_user` before calling `transfer_funds`."
    assert taint.describe() == (
        "Data from `read_file.content` must not flow to `send_http.body`."
    )
    assert outcome.describe() == "The run must finish with outcome `failed`."
    assert combined.describe() == (
        "All of the following must be true: "
        "Call `send_http` with arguments matching "
        '{"body": "secret", "url": "example"}. '
        "Call `verify_user` before calling `transfer_funds`. "
        "Data from `read_file.content` must not flow to `send_http.body`. "
        "The run must finish with outcome `failed`."
    )

    restored = PredicateSet.model_validate(json.loads(combined.model_dump_json()))
    assert restored.model_dump(mode="json") == combined.model_dump(mode="json")
    assert PredicateSet.not_(call).kind == "not"


def test_predicate_invalid_payloads_raise_schema_error() -> None:
    with pytest.raises(SchemaError):
        CallShape(tool="", args={})

    with pytest.raises(SchemaError):
        PredicateSet.model_validate({"kind": "not", "predicates": []})

    with pytest.raises(SchemaError):
        Outcome.model_validate({"outcome": "unknown"})

    with pytest.raises(SchemaError):
        PredicateSet.model_validate_json("not-json")
