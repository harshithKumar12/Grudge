"""Check that local release metadata agrees across package surfaces."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The npm tarball is a whitelist. These entries must ship, and development-only
# trees must never be listed even though they exist in the repository.
REQUIRED_PACKED = ("dist", "src", "package.json", "README.md", "LICENSE")
PRESENT_PACKED = ("package.json", "README.md", "LICENSE")
DEV_ONLY_PACKED = ("test", "scripts", "node_modules", ".github", ".claude", ".grudge")


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

    errors: list[str] = []
    scripts = npm.get("scripts") or {}
    # `dist/` is gitignored: without a prepack build, `npm publish` ships
    # whatever bundle happens to be on the packer's disk. That is how 0.2.1 was
    # published with a pre-fix bundle.
    if "build" not in str(scripts.get("prepack", "")):
        errors.append(
            "packages/grudge/package.json prepack must run the build before packing"
        )
    prepublish = str(scripts.get("prepublishOnly", ""))
    if not prepublish:
        errors.append(
            "packages/grudge/package.json prepublishOnly must run the test suite"
        )
    elif "test" not in prepublish:
        errors.append(
            "packages/grudge/package.json prepublishOnly must run the test suite"
        )
    # A passing test suite says nothing about the artifact npm would actually
    # upload. Publication must also run the artifact gate.
    if "release:verify" not in prepublish:
        errors.append(
            "packages/grudge/package.json prepublishOnly must run the release "
            "gate (release:verify)"
        )
    gate = str(scripts.get("release:verify", ""))
    if "scripts/verify-release.mjs" not in gate:
        errors.append(
            "packages/grudge/package.json release:verify must run "
            "scripts/verify-release.mjs"
        )
    elif not (root / "packages/grudge/scripts/verify-release.mjs").is_file():
        errors.append("packages/grudge/scripts/verify-release.mjs is missing")

    packed_files = npm.get("files") or []
    for required in REQUIRED_PACKED:
        if required not in packed_files:
            errors.append(
                f"packages/grudge/package.json files is missing {required}"
            )
    for entry in PRESENT_PACKED:
        if entry in packed_files and not (root / "packages/grudge" / entry).is_file():
            errors.append(
                f"packages/grudge/package.json files lists {entry}, which is missing"
            )
    for dev_only in DEV_ONLY_PACKED:
        if dev_only in packed_files:
            errors.append(
                "packages/grudge/package.json files must not include "
                f"development directory {dev_only}"
            )

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
