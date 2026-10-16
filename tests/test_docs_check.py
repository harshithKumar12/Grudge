"""Tests for the Phase 0 documentation contract."""

from pathlib import Path

from scripts.docs_check import check_docs


def test_repository_docs_are_indexed_and_linked() -> None:
    """The checked-in documentation satisfies the bootstrap contract."""
    repo_root = Path(__file__).resolve().parents[1]

    assert check_docs(repo_root) == []


def test_docs_check_reports_an_unindexed_file(tmp_path: Path) -> None:
    """A new documentation file cannot silently bypass the index."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "INDEX.md").write_text(
        "# Index\n\n**Purpose:** x\n**Audience:** x\n**Status:** final\n"
        "**Last updated (phase):** 0\n",
        encoding="utf-8",
    )
    (docs / "extra.md").write_text(
        "# Extra\n\n**Purpose:** x\n**Audience:** x\n**Status:** stub\n"
        "**Last updated (phase):** 0\n",
        encoding="utf-8",
    )

    errors = check_docs(tmp_path)

    assert "unindexed docs file: docs/extra.md" in errors
