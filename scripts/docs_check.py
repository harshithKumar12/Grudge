"""Validate the Phase 0 documentation index, metadata, and links."""

import re
from pathlib import Path

REQUIRED_METADATA = ("Purpose:", "Audience:", "Status:", "Last updated (phase):")
MARKDOWN_LINK = re.compile(r"\]\(([^)]+)\)")


def _indexed_paths(index: Path, docs_root: Path) -> set[str]:
    """Return repository-relative docs paths linked from the index."""
    indexed: set[str] = set()
    text = index.read_text(encoding="utf-8")
    for raw_link in MARKDOWN_LINK.findall(text):
        link = raw_link.split("#", 1)[0].split("?", 1)[0]
        if not link or "://" in link or link.startswith("mailto:"):
            continue
        target = (index.parent / link).resolve()
        if target.is_relative_to(docs_root.resolve()) and target.is_file():
            indexed.add(target.relative_to(docs_root).as_posix())
    return indexed


def _link_errors(path: Path, docs_root: Path) -> list[str]:
    """Return broken relative Markdown links found in one document."""
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    for raw_link in MARKDOWN_LINK.findall(text):
        link = raw_link.split("#", 1)[0].split("?", 1)[0]
        if not link or "://" in link or link.startswith("mailto:"):
            continue
        target = (path.parent / link).resolve()
        if not target.is_file():
            errors.append(f"{path.relative_to(docs_root)} -> {link}")
    return errors


def check_docs(repo_root: Path) -> list[str]:
    """Return human-readable documentation violations for ``repo_root``."""
    docs_root = repo_root / "docs"
    index = docs_root / "INDEX.md"
    errors: list[str] = []
    if not index.is_file():
        return ["missing docs/INDEX.md"]

    files = sorted(path for path in docs_root.rglob("*") if path.is_file())
    indexed = _indexed_paths(index, docs_root)
    for path in files:
        relative = path.relative_to(docs_root).as_posix()
        if relative not in indexed:
            errors.append(f"unindexed docs file: docs/{relative}")
        if not path.read_bytes():
            errors.append(f"empty docs file: docs/{relative}")
        if path.suffix.lower() == ".md" and relative != "PROGRESS.md":
            text = path.read_text(encoding="utf-8")
            for field in REQUIRED_METADATA:
                if field not in text:
                    errors.append(f"{relative} is missing metadata: {field}")
            errors.extend(_link_errors(path, docs_root))
    return errors


def main() -> None:
    """Validate documentation and exit non-zero when a rule is violated."""
    repo_root = Path(__file__).resolve().parents[1]
    errors = check_docs(repo_root)
    if errors:
        raise SystemExit("docs-check failed:\n- " + "\n- ".join(errors))
    files = sum(1 for path in (repo_root / "docs").rglob("*") if path.is_file())
    print(f"docs-check: {files} indexed, non-empty, linked documentation files")


if __name__ == "__main__":
    main()
