"""Check that local release metadata agrees across package surfaces."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check_release(root: Path = ROOT) -> list[str]:
    """Return release metadata inconsistencies without contacting registries."""

    npm = json.loads(
        (root / "packages/grudge/package.json").read_text(encoding="utf-8")
    )
    lock = json.loads(
        (root / "packages/grudge/package-lock.json").read_text(encoding="utf-8")
    )
    source = (root / "packages/grudge/src/version.js").read_text(encoding="utf-8")
    pyproject = (root / "pyproject.toml").read_text(encoding="utf-8")
    changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
    readme = (root / "README.md").read_text(encoding="utf-8")

    versions = {
        "package.json": str(npm.get("version")),
        "package-lock.json": str(lock.get("version")),
        "package-lock root": str(lock.get("packages", {}).get("", {}).get("version")),
        "src/version.js": _match(source, r'VERSION\s*=\s*["\']([^"\']+)["\']'),
        "pyproject.toml": _match(
            pyproject,
            r'^version\s*=\s*["\']([^"\']+)["\']',
            flags=re.MULTILINE,
        ),
    }
    errors: list[str] = []
    expected = next(iter(versions.values()))
    errors.extend(
        f"{name} reports {version}, expected {expected}"
        for name, version in versions.items()
        if version != expected
    )
    if f"## {expected} " not in changelog:
        errors.append(f"CHANGELOG.md has no heading for {expected}")
    published = (
        rf"Grudge CLI `{re.escape(expected)}` is published in both public "
        "package registries"
    )
    prepared = rf"source version `{re.escape(expected)}` is being prepared"
    if not re.search(published, readme) and not re.search(prepared, readme):
        errors.append(
            f"README.md does not describe {expected} as published or prepared"
        )
    return errors


def _match(text: str, pattern: str, *, flags: int = 0) -> str:
    match = re.search(pattern, text, flags)
    return match.group(1) if match else "missing"


def main() -> int:
    errors = check_release()
    if errors:
        for error in errors:
            print(f"release-check: {error}")
        return 1
    print("release-check: local npm/PyPI metadata and published-version "
          "documentation agree")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
