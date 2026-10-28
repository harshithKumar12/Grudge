"""Focused contract tests for the Phase 1 cassette schema."""

import json

import pytest

from grudge.errors import SchemaError
from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry


def test_argument_matchers_have_expected_matching_semantics() -> None:
    exact = ArgMatcher.exact({"path": "report.txt"})
    subset = ArgMatcher.subset({"request": {"method": "GET"}})
    wildcard = ArgMatcher.any()

    assert exact.matches({"path": "report.txt"})
    assert not exact.matches({"path": "report.txt", "extra": True})
    assert subset.matches({"request": {"method": "GET", "timeout": 5}})
    assert not subset.matches({"request": {"method": "POST"}})
    assert wildcard.matches({"anything": [1, 2, 3]})

    assert ArgMatcher.model_validate({"subset": {"kind": "email"}}) == subset.__class__(
        kind="subset", args={"kind": "email"}
    )
    assert ArgMatcher.model_validate({"kind": "any"}).matches({})


def test_cassette_hash_and_size_are_stable() -> None:
    first = Cassette(
        task="read report",
        world=[
            CassetteEntry(
                tool="read_file",
                match=ArgMatcher.exact({"path": "report.txt"}),
                response={"text": "hello"},
                order_hint=1,
            )
        ],
    )
    second = Cassette.model_validate(json.loads(first.model_dump_json()))

    assert first.content_hash == second.content_hash
    assert first.size_bytes() == len(
        json.dumps(
            first.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    )
    assert first.model_dump(mode="json") == second.model_dump(mode="json")


def test_cassette_invalid_public_payloads_raise_schema_error() -> None:
    with pytest.raises(SchemaError):
        Cassette.model_validate({"task": "task", "world": [{"tool": "x"}]})

    with pytest.raises(SchemaError):
        Cassette.model_validate_json("not-json")

    with pytest.raises(SchemaError):
        CassetteEntry(
            tool="read_file",
            match=ArgMatcher.any(),
            response={},
            order_hint="first",  # type: ignore[arg-type]  # invalid on purpose
        )
