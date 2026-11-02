"""Tests for the release metadata contract."""

import json
import shutil
from pathlib import Path

from scripts.release_check import check_release

REPO = Path(__file__).resolve().parents[1]
METADATA = (
    "packages/grudge/package.json",
    "packages/grudge/package-lock.json",
    "packages/grudge/src/version.js",
    "packages/grudge/README.md",
    "packages/grudge/LICENSE",
    "packages/grudge/scripts/verify-release.mjs",
    "pyproject.toml",
    "requirements.lock",
    "CHANGELOG.md",
    "README.md",
)


def _copy_metadata(root: Path) -> Path:
    """Copy the real release surfaces so a test only mutates one field."""
    for relative in METADATA:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / relative, target)
    return root


def _mutate_package(root: Path, **changes: object) -> None:
    path = root / "packages/grudge/package.json"
    package = json.loads(path.read_text(encoding="utf-8"))
    for key, value in changes.items():
        if value is None:
            package.pop(key, None)
        else:
            package[key] = value
    path.write_text(json.dumps(package, indent=2), encoding="utf-8")


def test_release_metadata_is_consistent() -> None:
    assert check_release(REPO) == []


def test_copy_of_the_release_surfaces_is_consistent(tmp_path: Path) -> None:
    assert check_release(_copy_metadata(tmp_path)) == []


def test_missing_prepack_build_is_reported(tmp_path: Path) -> None:
    """0.2.1 shipped a stale dist because nothing rebuilt before packing."""
    root = _copy_metadata(tmp_path)
    path = root / "packages/grudge/package.json"
    package = json.loads(path.read_text(encoding="utf-8"))
    package["scripts"].pop("prepack")
    path.write_text(json.dumps(package, indent=2), encoding="utf-8")

    assert (
        "packages/grudge/package.json prepack must run the build before packing"
        in check_release(root)
    )


def test_missing_prepublish_only_is_reported(tmp_path: Path) -> None:
    root = _copy_metadata(tmp_path)
    _mutate_package(root, scripts={"build": "node scripts/build.mjs"})

    assert (
        "packages/grudge/package.json prepublishOnly must run the test suite"
        in check_release(root)
    )


def test_prepublish_only_must_run_the_artifact_gate(tmp_path: Path) -> None:
    """A green test suite says nothing about the tarball npm would upload."""
    root = _copy_metadata(tmp_path)
    _mutate_package(
        root,
        scripts={"prepack": "npm run build", "prepublishOnly": "npm test"},
    )

    assert (
        "packages/grudge/package.json prepublishOnly must run the release "
        "gate (release:verify)" in check_release(root)
    )


def test_missing_release_gate_script_is_reported(tmp_path: Path) -> None:
    root = _copy_metadata(tmp_path)
    _mutate_package(
        root,
        scripts={
            "prepack": "npm run build",
            "prepublishOnly": "npm test && npm run release:verify",
            "release:verify": "node scripts/verify-release.mjs",
        },
    )
    (root / "packages/grudge/scripts/verify-release.mjs").unlink()

    assert (
        "packages/grudge/scripts/verify-release.mjs is missing"
        in check_release(root)
    )


def test_development_directory_in_files_is_reported(tmp_path: Path) -> None:
    root = _copy_metadata(tmp_path)
    _mutate_package(root, files=["dist", "src", "test", "package.json"])

    assert (
        "packages/grudge/package.json files must not include development "
        "directory test" in check_release(root)
    )


def test_missing_packed_directory_is_reported(tmp_path: Path) -> None:
    root = _copy_metadata(tmp_path)
    _mutate_package(root, files=["src", "package.json"])

    assert (
        "packages/grudge/package.json files is missing dist" in check_release(root)
    )


def test_build_toolchain_drift_is_reported(tmp_path: Path) -> None:
    """The wheel CI tests must come from the same setuptools the lock installs."""
    root = _copy_metadata(tmp_path)
    (root / "requirements.lock").write_text(
        "setuptools==0.0.1\npytest==9.2.0\n", encoding="utf-8"
    )

    errors = check_release(root)
    assert any(
        error.startswith("pyproject.toml builds with setuptools ")
        and "requirements.lock installs 0.0.1" in error
        for error in errors
    )


def test_version_drift_is_reported(tmp_path: Path) -> None:
    root = _copy_metadata(tmp_path)
    _mutate_package(root, version="9.9.9")

    errors = check_release(root)

    assert "CHANGELOG.md has no heading for 9.9.9" in errors
    assert (
        "README.md does not describe 9.9.9 as published or prepared" in errors
    )
    assert any(
        error.startswith("package-lock.json reports") for error in errors
    )
