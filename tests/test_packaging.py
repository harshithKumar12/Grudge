"""Packaging checks for data that must ship inside the wheel."""

from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_sample_scar_ships_with_the_package() -> None:
    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    packages = config["tool"]["setuptools"]["packages"]["find"]["include"]
    data = config["tool"]["setuptools"]["package-data"]

    # The offline demo resolves the shipped scar next to the installed modules,
    # so a wheel without this data fails on a clean `pip install`.
    assert "scars*" in packages
    assert "*.json" in data["scars"]
    assert (ROOT / "scars" / "sample_leak.scar.json").is_file()

    # The demo world reads its inbox, controls, and fake file store from disk.
    example_data = data["examples.leaky_agent"]
    assert "*.json" in example_data
    assert "controls/*" in example_data
    assert "fake_filestore/*" in example_data
    assert (ROOT / "examples" / "leaky_agent" / "fake_inbox.json").is_file()


def test_guard_demo_ships_with_the_package() -> None:
    """`grudge demo --guard` must work from an installed wheel, not a checkout."""

    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    data = config["tool"]["setuptools"]["package-data"]

    assert "*.mjs" in data["grudge.demo"]
    assert "payloads/*/*.json" in data["grudge.demo"]
    assert (ROOT / "grudge" / "demo" / "e2e_guard.mjs").is_file()
    payloads = ROOT / "grudge" / "demo" / "payloads" / "leak-session"
    assert sorted(path.name for path in payloads.glob("*.json")) == [
        "01-read.json",
        "02-http.json",
        "03-read-session-2.json",
        "04-http-session-2.json",
    ]
