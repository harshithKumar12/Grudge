from __future__ import annotations

from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry
from grudge.shrinker.reducers import (
    BlankField,
    NormalizeIds,
    TrimDocument,
    reduce_content,
)


def test_trim_document_reduces_lines_then_sentences() -> None:
    original = {
        "body": "irrelevant one\nkeep this line. Extra noise.\nirrelevant two",
        "kind": "email",
    }

    reduced = TrimDocument().reduce(
        original,
        lambda candidate: "keep this line" in candidate["body"],
    )

    assert reduced["body"] == "keep this line."
    assert original["body"].startswith("irrelevant one")


def test_blank_field_uses_neutral_json_values() -> None:
    original = {"required": "keep", "irrelevant": "discard", "metadata": {"x": 1}}

    reduced = BlankField(fields=["irrelevant", "metadata"]).reduce(
        original,
        lambda candidate: candidate["required"] == "keep",
    )

    assert reduced == {"required": "keep", "irrelevant": "", "metadata": {}}
    assert original["irrelevant"] == "discard"


def test_normalize_ids_keeps_references_consistent() -> None:
    original = {
        "email_id": "email-042",
        "message": "Please read email-042 before replying.",
        "other": "email-999",
    }

    reduced = NormalizeIds().reduce(
        original,
        lambda candidate: candidate["email_id"] in candidate["message"],
    )

    assert reduced["email_id"] == "email_1"
    assert "email_1" in reduced["message"]
    assert "email_2" in reduced["other"]


def test_reducers_preserve_validated_cassette_models() -> None:
    original = Cassette(
        task="summarize",
        world=[
            CassetteEntry(
                tool="read_email",
                match=ArgMatcher.exact({"id": "email-042"}),
                response={"body": "noise\nkeep this. More noise."},
            )
        ],
    )

    reduced = reduce_content(
        original,
        lambda candidate: isinstance(candidate, Cassette)
        and "keep this" in candidate.world[0].response["body"],
    )

    assert isinstance(reduced, Cassette)
    assert reduced.world[0].response["body"] == "keep this."
    assert reduced.world[0].match.args == {}
