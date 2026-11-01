"""Verify the built Python wheel: contents, clean install, installed behaviour.

The wheel is the thing users install. A green source tree proves nothing about
it, so this script builds the wheel, inspects its members and metadata, installs
it into a fresh virtual environment, and drives the installed console script.

It never publishes anything. By default every temporary directory is removed;
pass ``--outdir`` or ``--venv`` to keep an artifact for inspection.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
import zipfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Data files the installed package reads at runtime. A wheel without these
# installs cleanly and then fails on first use.
REQUIRED_MEMBERS = (
    "grudge/__init__.py",
    "grudge/cli/main.py",
    "grudge/demo/e2e_guard.mjs",
    "grudge/demo/payloads/leak-session/01-read.json",
    "scars/sample_leak.scar.json",
    "examples/leaky_agent/fake_inbox.json",
)

TIMEOUT_S = 600


def project_version(root: Path = ROOT) -> str:
    """Return the version declared in pyproject.toml."""

    config = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    return str(config["project"]["version"])


def _headers(metadata: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in metadata.splitlines():
        if not line or line.startswith((" ", "\t")):
            continue
        key, _, value = line.partition(":")
        headers.setdefault(key.strip().lower(), value.strip())
    return headers


def check_wheel(wheel: Path, expected_version: str) -> list[str]:
    """Return everything wrong with one built wheel."""

    try:
        archive = zipfile.ZipFile(wheel)
    except (OSError, zipfile.BadZipFile) as exc:
        return [f"{wheel.name} is not a readable wheel: {exc}"]
    with archive:
        members = set(archive.namelist())
        metadata_name = next(
            (name for name in members if name.endswith(".dist-info/METADATA")),
            None,
        )
        if metadata_name is None:
            return [f"{wheel.name} has no .dist-info/METADATA"]
        metadata = archive.read(metadata_name).decode("utf-8")

    errors = [
        f"{wheel.name} is missing {member}"
        for member in REQUIRED_MEMBERS
        if member not in members
    ]
    headers = _headers(metadata)
    if headers.get("name") != "grudge-cli":
        errors.append(
            f"{wheel.name} METADATA names {headers.get('name')!r}, "
            "expected 'grudge-cli'"
        )
    if headers.get("version") != expected_version:
        errors.append(
            f"{wheel.name} METADATA reports {headers.get('version')!r}, "
            f"expected {expected_version!r}"
        )
    if "license" not in headers and "license-expression" not in headers:
        errors.append(f"{wheel.name} METADATA has no license field")
    return errors


def _run(
    command: Sequence[str], *, cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    """Run a command without ever raising: a missing binary or a timeout is a
    recorded failure, not a traceback that skips ``finish()``."""

    try:
        return subprocess.run(
            list(command),
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(
            list(command), 127, "", f"{type(exc).__name__}: {exc}"
        )


def _venv_bin(venv: Path, name: str) -> Path:
    if os.name == "nt":
        return venv / "Scripts" / f"{name}.exe"
    return venv / "bin" / name


def build_wheel(outdir: Path) -> tuple[Path | None, str]:
    """Build a wheel into ``outdir`` and return the one just written."""

    outdir.mkdir(parents=True, exist_ok=True)
    # `--outdir` is documented as keepable, so it may already hold wheels from
    # earlier runs. The build overwrites same-named files rather than adding
    # them, so identify the fresh artifact by modification time; check_wheel
    # then independently verifies its metadata version and contents.
    result = _run(
        [sys.executable, "-m", "build", "--wheel", "--outdir", str(outdir)],
        cwd=ROOT,
    )
    if result.returncode != 0:
        return None, result.stderr.strip()[-400:]
    wheels = sorted(
        outdir.glob("*.whl"),
        key=lambda path: path.stat().st_mtime_ns,
        reverse=True,
    )
    if not wheels:
        return None, f"the build produced no wheel in {outdir}"
    return wheels[0], ""


def record(checks: list[bool], name: str, ok: bool, detail: str = "") -> None:
    checks.append(ok)
    suffix = f": {detail}" if detail else ""
    print(f"{'[ok]' if ok else '[fail]'} {name}{suffix}")


def install_and_check(
    wheel: Path, venv: Path, expected_version: str, checks: list[bool]
) -> None:
    """Install the wheel into ``venv`` and drive the installed console script."""

    python = _venv_bin(venv, "python")
    engine = _venv_bin(venv, "grudge-engine")

    install = _run(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            str(wheel),
        ]
    )
    record(
        checks,
        "install the wheel into a clean virtualenv",
        install.returncode == 0,
        install.stderr.strip()[-300:] if install.returncode else str(wheel.name),
    )
    if install.returncode != 0:
        return

    version = _run([str(engine), "--version"])
    record(
        checks,
        "installed grudge-engine reports the package version",
        version.returncode == 0
        and version.stdout.strip() == f"grudge {expected_version}",
        version.stdout.strip() or f"exit {version.returncode}",
    )

    help_text = _run([str(engine), "--help"])
    record(
        checks,
        "installed grudge-engine --help works",
        help_text.returncode == 0 and "demo" in help_text.stdout,
        f"exit {help_text.returncode}",
    )

    demo = _run(
        [str(engine), "demo", "--no-browser", "--fast", "--json"], cwd=venv
    )
    detail = demo.stderr.strip()[-300:]
    ok = demo.returncode == 0
    if ok:
        try:
            payload = json.loads(demo.stdout)
        except json.JSONDecodeError:
            ok = False
            detail = "demo did not print JSON"
        else:
            ok = (
                payload.get("fixed", {}).get("passed") is True
                and payload.get("vulnerable", {}).get("passed") is False
            )
            detail = "fixed passes, vulnerable fails" if ok else str(payload)
    record(checks, "installed demo behaves like the source", ok, detail)

    # Run the import probe outside the checkout: `python -c` puts the current
    # directory first on sys.path, so a repo-root CWD would import the source
    # tree and falsely "prove" the wheel.
    module = _run(
        [
            str(python),
            "-c",
            "import grudge, pathlib; "
            "print(pathlib.Path(grudge.__file__).resolve())",
        ],
        cwd=venv,
    )
    resolved = module.stdout.strip()
    inside = bool(resolved) and venv.resolve() in Path(resolved).parents
    record(
        checks,
        "installed module resolves inside the virtualenv",
        module.returncode == 0 and inside,
        resolved or f"exit {module.returncode}",
    )


def finish(checks: list[bool], wheel: Path | None = None) -> int:
    failed = sum(1 for ok in checks if not ok)
    print()
    if failed:
        print(f"Result: FAIL ({failed}/{len(checks)} checks failed)")
    else:
        print(f"Result: PASS ({len(checks)}/{len(checks)} checks)")
    if wheel is not None:
        print(f"Wheel: {wheel}")
    print("Nothing was published.")
    return 1 if failed else 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--outdir", type=Path, help="keep the built wheel in this directory"
    )
    parser.add_argument(
        "--wheel", type=Path, help="verify this wheel instead of building one"
    )
    parser.add_argument(
        "--venv", type=Path, help="keep the smoke-test virtualenv here"
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    checks: list[bool] = []
    expected = project_version()
    temporary = Path(tempfile.mkdtemp(prefix="grudge-wheel-"))
    venv = (args.venv or temporary / "venv").resolve()
    try:
        wheel = args.wheel.resolve() if args.wheel else None
        if wheel is not None:
            record(checks, "wheel exists", wheel.is_file(), str(wheel))
            if not wheel.is_file():
                return finish(checks, wheel)
        else:
            outdir = (args.outdir or temporary / "dist").resolve()
            wheel, error = build_wheel(outdir)
            record(
                checks,
                "build the wheel",
                wheel is not None,
                error or str(outdir),
            )
            if wheel is None:
                return finish(checks)

        errors = check_wheel(wheel, expected)
        record(
            checks,
            "wheel contents and metadata",
            not errors,
            "; ".join(errors) if errors else f"grudge-cli {expected}",
        )

        created = _run([sys.executable, "-m", "venv", str(venv)])
        record(
            checks,
            "create a clean virtualenv",
            created.returncode == 0,
            created.stderr.strip()[-300:] if created.returncode else str(venv),
        )
        if created.returncode == 0:
            install_and_check(wheel, venv, expected, checks)
        return finish(checks, wheel)
    finally:
        if args.venv is None:
            shutil.rmtree(venv, ignore_errors=True)
        shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
