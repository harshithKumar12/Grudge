from pathlib import Path

from scripts.release_check import check_release


def test_release_metadata_is_consistent() -> None:
    assert check_release(Path(__file__).parents[1]) == []
