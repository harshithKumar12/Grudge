"""Shared cross-language corpora for redaction and path canonicalization.

These tests read the same JSON fixtures the Node runtime reads, so a change to
one implementation cannot silently drift from the other.
"""

from __future__ import annotations

import json
from pathlib import Path

from grudge.guard.compile import _canonical_path, _under, evaluate_rule
from grudge.recorder.redact import redact_text, redact_trace

SPEC = Path(__file__).parents[1] / "spec"

def test_python_redaction_matches_the_shared_corpus() -> None:
    """Every corpus entry produces the documented sanitized string."""

    corpus = json.loads((SPEC / "redaction-corpus.json").read_text(encoding="utf-8"))
    assert len(corpus) >= 10
    for case in corpus:
        assert redact_text(case["input"]) == case["expected"], case["name"]

def test_redaction_runs_before_a_nested_value_is_stored() -> None:
    """`redact_trace` copies and sanitizes nested strings."""

    result = redact_trace({"log": [{"note": "api_key=sk-demo-1234567890abcdef"}]})
    assert result["log"][0]["note"] == "api_key: [REDACTED]"

def test_windows_paths_compare_case_insensitively_without_prefix_confusion() -> (
    None
):
    """Drive letters fold, separators unify, and siblings stay outside."""

    assert _under("c:/audit/x.txt", "C:/AUDIT")
    assert _under("C:\\AUDIT\\x.txt", "C:/audit")
    assert not _under("C:/AUDIT-OTHER/x.txt", "C:/AUDIT")
    assert not _under("C:/AUDIT/../secret.txt", "C:/AUDIT")
    assert _under("C:/AUDIT/sub/../x.txt", "C:/AUDIT")
    assert _canonical_path("C:\\AUDIT\\.\\sub\\..\\x.txt") == "c:/audit/x.txt"

def test_posix_paths_stay_case_sensitive() -> None:
    """Lower-casing is applied only to Windows-style paths."""

    assert not _under("/DATA/x.txt", "/data")
    assert _under("/data/x.txt", "/data/")

def test_must_call_rule_is_a_requirement_not_a_prohibition() -> None:
    """A compiled `must` call shape blocks only when the call is missing."""

    rule = {
        "id": "must-1",
        "mode": "block",
        "kind": "call_shape",
        "tool": "verify_user",
        "match": {},
        "ordering": {"before": "", "after": ""},
        "taint": {"source": "", "sink": ""},
        "polarity": "must",
        "english": "Must call verify_user.",
        "createdFrom": "test",
    }
    assert evaluate_rule(rule, [])["violated"] is True
    assert (
        evaluate_rule(rule, [{"tool": "read_file", "args": {"path": "a.txt"}}])[
            "violated"
        ]
        is True
    )
    assert (
        evaluate_rule(rule, [{"tool": "verify_user", "args": {}}])["violated"]
        is False
    )
