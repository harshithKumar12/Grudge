"""Tests for the wheel artifact verifier."""

from __future__ import annotations

import json
import os
import subprocess
import zipfile
from pathlib import Path

import pytest

import scripts.verify_wheel as verify_wheel
from scripts.verify_wheel import REQUIRED_MEMBERS, _run, check_wheel, project_version

REPO = Path(__file__).resolve().parents[1]


def _write_wheel(
    path: Path,
    *,
    name: str = "grudge-cli",
    version: str = "1.2.3",
    members: tuple[str, ...] = REQUIRED_MEMBERS,
    license_header: bool = True,
) -> Path:
    """Write a synthetic wheel so inspection can be tested without a build."""

    with zipfile.ZipFile(path, "w") as archive:
        for member in members:
            archive.writestr(member, "")
        metadata = [f"Name: {name}", f"Version: {version}"]
        if license_header:
            metadata.append("License: MIT")
        archive.writestr(
            "grudge_cli-1.2.3.dist-info/METADATA",
            "\n".join(metadata) + "\n",
        )
    return path


def test_required_members_exist_in_the_source_tree() -> None:
    # A stale list would silently accept a wheel that is missing shipped data.
    for member in REQUIRED_MEMBERS:
        assert (REPO / member).is_file(), member


def test_project_version_matches_the_npm_package() -> None:
    package = json.loads(
        (REPO / "packages/grudge/package.json").read_text(encoding="utf-8")
    )
    assert project_version() == package["version"]


def test_check_wheel_accepts_a_complete_wheel(tmp_path: Path) -> None:
    wheel = _write_wheel(tmp_path / "grudge_cli-1.2.3-py3-none-any.whl")

    assert check_wheel(wheel, "1.2.3") == []


def test_missing_runtime_data_is_reported(tmp_path: Path) -> None:
    members = tuple(
        member
        for member in REQUIRED_MEMBERS
        if member != "grudge/demo/e2e_guard.mjs"
    )
    wheel = _write_wheel(tmp_path / "partial.whl", members=members)

    errors = check_wheel(wheel, "1.2.3")

    assert errors == ["partial.whl is missing grudge/demo/e2e_guard.mjs"]


def test_metadata_drift_is_reported(tmp_path: Path) -> None:
    wheel = _write_wheel(
        tmp_path / "drift.whl",
        name="other",
        version="9.9.9",
        license_header=False,
    )

    errors = check_wheel(wheel, "1.2.3")

    assert any("names 'other'" in error for error in errors)
    assert any("reports '9.9.9'" in error for error in errors)
    assert any("has no license field" in error for error in errors)


def test_unreadable_wheel_is_reported(tmp_path: Path) -> None:
    path = tmp_path / "broken.whl"
    path.write_text("not a zip", encoding="utf-8")

    errors = check_wheel(path, "1.2.3")

    assert len(errors) == 1
    assert errors[0].startswith("broken.whl is not a readable wheel:")


def test_missing_command_is_a_recorded_failure_not_an_exception(
    tmp_path: Path,
) -> None:
    # A missing console script used to raise FileNotFoundError out of the check,
    # which skipped finish() and printed a traceback with no Result line.
    result = _run([str(tmp_path / "definitely-not-installed")])

    assert result.returncode != 0
    assert result.returncode == 127
    assert "FileNotFoundError" in result.stderr


def test_build_reuses_an_outdir_that_already_holds_a_wheel(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`--outdir` is documented as keepable, so a second run must not fail."""

    stale = tmp_path / "grudge_cli-0.2.0-py3-none-any.whl"
    stale.write_bytes(b"stale")
    os.utime(stale, (1_000_000, 1_000_000))

    def fake_run(command: list[str], *, cwd: Path | None = None) -> object:
        fresh = tmp_path / "grudge_cli-0.2.1-py3-none-any.whl"
        fresh.write_bytes(b"fresh")
        return subprocess.CompletedProcess(list(command), 0, "", "")

    monkeypatch.setattr(verify_wheel, "_run", fake_run)

    wheel, error = verify_wheel.build_wheel(tmp_path)

    assert error == ""
    assert wheel is not None
    assert wheel.name == "grudge_cli-0.2.1-py3-none-any.whl"
