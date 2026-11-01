"""Integration test for the real wheel this repository builds.

``tests/test_verify_wheel.py`` exercises the inspector against synthetic
wheels. That proves the inspection logic is correct; it does not prove the
project produces an installable artifact, because a synthetic fixture is
written by the test that asserts on it.

This module closes that gap. It builds the actual distribution from a copy of
the source, runs the same ``check_wheel`` the release gate runs, inspects the
console-script entry points, installs the wheel into a virtual environment and
drives the installed CLI from outside both the checkout and the build tree.

The build runs on a copy so ``build/`` and ``*.egg-info`` never appear in the
working tree, and it uses the already-installed build backend
(``setuptools.build_meta``) so it needs no network isolation step. Runtime
dependencies come from the locked environment the suite already runs in, which
is why the virtual environment is created with ``--system-site-packages`` and
the wheel is installed with ``--no-deps``: the test is about the artifact, not
about pip resolving the dependency graph.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from scripts.verify_wheel import (
    REQUIRED_MEMBERS,
    _venv_bin,
    check_wheel,
    project_version,
)

REPO = Path(__file__).resolve().parents[1]

# Everything setuptools reads to build the distributions.
BUILD_INPUTS = (
    "pyproject.toml",
    "README.md",
    "LICENSE",
    "grudge",
    "scars",
    "examples",
)

# Paths that must never ship: development-only trees and compiled leftovers.
FORBIDDEN_PREFIXES = (
    "tests/",
    "scripts/",
    "docs/",
    "packages/",
    "spec/",
    "viewer/",
    "coordination/",
    "build/",
    "node_modules/",
    ".git",
)
FORBIDDEN_SUFFIXES = (".pyc", ".pyo", ".log")


def _copy_build_inputs(destination: Path) -> None:
    """Copy the packaging inputs into ``destination`` without build output."""

    ignored = shutil.ignore_patterns(
        "__pycache__", "*.pyc", "*.pyo", "*.egg-info", ".pytest_cache"
    )
    for name in BUILD_INPUTS:
        source = REPO / name
        target = destination / name
        if source.is_dir():
            shutil.copytree(source, target, ignore=ignored)
        elif source.is_file():
            shutil.copy2(source, target)
        else:  # pragma: no cover - a missing build input is a real failure
            raise AssertionError(f"build input {name} is missing from {REPO}")


def _run(command: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
        timeout=600,
    )


def _build_wheel(project: Path, outdir: Path) -> Path:
    """Build the wheel with the project's declared backend.

    ``setuptools.build_meta`` is invoked in a child process so the build cannot
    import this test session's modules, and ``python -m build`` is a fallback
    for environments whose setuptools does not expose a usable backend API.
    """

    outdir.mkdir(parents=True, exist_ok=True)
    backend = (
        "import sys; from setuptools import build_meta; "
        "print(build_meta.build_wheel(sys.argv[1]))"
    )
    attempt = _run([sys.executable, "-c", backend, str(outdir)], cwd=project)
    if attempt.returncode != 0:
        fallback = _run(
            [
                sys.executable,
                "-m",
                "build",
                "--wheel",
                "--no-isolation",
                "--outdir",
                str(outdir),
            ],
            cwd=project,
        )
        assert fallback.returncode == 0, (
            "the project does not build a wheel\n"
            f"setuptools backend: {attempt.stderr.strip()[-1500:]}\n"
            f"python -m build: {fallback.stderr.strip()[-1500:]}"
        )

    wheels = sorted(outdir.glob("*.whl"))
    assert len(wheels) == 1, [path.name for path in wheels]
    return wheels[0]


@pytest.fixture(scope="module")
def real_wheel(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The wheel built from this working tree, once per test session."""

    root = tmp_path_factory.mktemp("real-wheel")
    project = root / "project"
    project.mkdir()
    _copy_build_inputs(project)
    return _build_wheel(project, root / "dist")


def _entry_points(wheel: Path) -> dict[str, str]:
    with zipfile.ZipFile(wheel) as archive:
        name = next(
            member
            for member in archive.namelist()
            if member.endswith(".dist-info/entry_points.txt")
        )
        text = archive.read(name).decode("utf-8")
    entries: dict[str, str] = {}
    section = ""
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        key, _, value = line.partition("=")
        entries[f"{section}:{key.strip()}"] = value.strip()
    return entries


def _installed(wheel: Path, root: Path) -> tuple[Path, Path]:
    """Install ``wheel`` into a virtualenv and return (python, console script)."""

    venv = root / "venv"
    created = _run(
        [sys.executable, "-m", "venv", "--system-site-packages", str(venv)], cwd=root
    )
    assert created.returncode == 0, created.stderr
    python = _venv_bin(venv, "python")
    installed = _run(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-deps",
            str(wheel),
        ],
        cwd=root,
    )
    assert installed.returncode == 0, installed.stderr
    return python, venv


def test_real_wheel_passes_the_release_gate_inspection(real_wheel: Path) -> None:
    expected = project_version()

    assert check_wheel(real_wheel, expected) == []
    assert f"-{expected}-" in real_wheel.name
    with zipfile.ZipFile(real_wheel) as archive:
        members = set(archive.namelist())
    for member in REQUIRED_MEMBERS:
        assert member in members, member


def test_real_wheel_declares_both_console_scripts(real_wheel: Path) -> None:
    entries = _entry_points(real_wheel)

    assert entries.get("console_scripts:grudge") == "grudge.cli.main:app"
    assert entries.get("console_scripts:grudge-engine") == "grudge.cli.main:app"


def test_real_wheel_ships_no_development_trees(real_wheel: Path) -> None:
    with zipfile.ZipFile(real_wheel) as archive:
        members = archive.namelist()

    shipped = [
        member
        for member in members
        if member.startswith(FORBIDDEN_PREFIXES) or member.endswith(FORBIDDEN_SUFFIXES)
    ]
    assert shipped == []


def test_real_wheel_installs_and_runs_outside_the_checkout(
    real_wheel: Path, tmp_path: Path
) -> None:
    expected = project_version()
    python, venv = _installed(real_wheel, tmp_path)
    engine = _venv_bin(venv, "grudge")
    assert engine.is_file(), engine

    # Run from inside the virtualenv: neither the checkout nor the build tree is
    # on sys.path, so only the installed wheel can answer.
    version = _run([str(engine), "--version"], cwd=venv)
    assert version.returncode == 0, version.stderr
    assert version.stdout.strip() == f"grudge {expected}"

    legacy = _venv_bin(venv, "grudge-engine")
    legacy_version = _run([str(legacy), "--version"], cwd=venv)
    assert legacy_version.returncode == 0, legacy_version.stderr
    assert legacy_version.stdout.strip() == f"grudge {expected}"

    help_text = _run([str(engine), "--help"], cwd=venv)
    assert help_text.returncode == 0, help_text.stderr
    assert "demo" in help_text.stdout

    probe = _run(
        [
            str(python),
            "-c",
            "import grudge, pathlib; print(pathlib.Path(grudge.__file__).resolve())",
        ],
        cwd=venv,
    )
    resolved = Path(probe.stdout.strip())
    assert probe.returncode == 0, probe.stderr
    assert venv.resolve() in resolved.parents, resolved
    assert REPO.resolve() not in resolved.parents, resolved
    assert os.access(resolved, os.R_OK)
