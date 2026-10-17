"""Focused contract tests for the Phase 4 cassette player."""

import logging

import pytest

from grudge.errors import ReplayMismatch
from grudge.replay.cassette_player import CassettePlayer, play_cassette
from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry


def make_cassette(*entries: CassetteEntry) -> Cassette:
    return Cassette(task="replay", world=list(entries))


def entry(tool: str, matcher: ArgMatcher, response: object) -> CassetteEntry:
    return CassetteEntry(tool=tool, match=matcher, response=response)


def test_matching_precedence_is_exact_then_subset_then_any() -> None:
    cassette = make_cassette(
        entry("read", ArgMatcher.any(), "any"),
        entry("read", ArgMatcher.subset({"path": "report.txt"}), "subset"),
        entry("read", ArgMatcher.exact({"path": "report.txt"}), "exact"),
    )
    player = CassettePlayer(cassette)

    assert player.call("read", {"path": "report.txt"}) == "exact"
    assert player.call("read", {"path": "report.txt", "format": "text"}) == "subset"
    assert player.call("read", {"path": "other.txt"}) == "any"
    assert player.consumed_indices == (2, 1, 0)


def test_matching_entries_are_consumed_and_responses_are_not_reused() -> None:
    cassette = make_cassette(
        entry("ping", ArgMatcher.exact({}), {"ok": 1}),
        entry("ping", ArgMatcher.exact({}), {"ok": 2}),
    )
    player = CassettePlayer(cassette)

    assert player.invoke("ping") == {"ok": 1}
    assert player("ping") == {"ok": 2}
    assert player.consumed_entries == (cassette.world[0], cassette.world[1])
    assert player.remaining_entries == ()


def test_strict_miss_raises_and_records_the_miss() -> None:
    player = CassettePlayer(
        make_cassette(entry("read", ArgMatcher.any(), {"text": "ok"}))
    )

    with pytest.raises(ReplayMismatch, match="write"):
        player.call("write", {"path": "report.txt"})

    assert len(player.misses) == 1
    assert player.misses[0].tool == "write"
    assert player.misses[0].args == {"path": "report.txt"}


def test_lenient_miss_returns_empty_result_and_logs(
    caplog: pytest.LogCaptureFixture,
) -> None:
    player = CassettePlayer(
        make_cassette(entry("read", ArgMatcher.any(), {"text": "ok"})), strict=False
    )

    with caplog.at_level(logging.WARNING):
        assert player.call("write", {"path": "report.txt"}) == {}

    assert len(player.miss_log) == 1
    assert "cassette replay miss" in caplog.text


def test_tool_layer_and_compatibility_factory_bind_tool_names() -> None:
    cassette = make_cassette(
        entry("read", ArgMatcher.exact({"path": "report.txt"}), "ok")
    )
    player = play_cassette(cassette)

    assert player.get_tool("read")({"path": "report.txt"}) == "ok"
    assert set(player.tools) == {"read"}
