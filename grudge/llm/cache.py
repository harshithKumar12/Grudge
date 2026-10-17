"""Deterministic, prompt-addressed completion storage."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from grudge import config


@dataclass(frozen=True)
class Completion:
    """Text returned by the completion boundary and its provenance."""

    text: str
    source: Literal["llm", "cache", "fallback"]

    @property
    def cache_hit(self) -> bool:
        return self.source == "cache"

    @property
    def fallback_used(self) -> bool:
        return self.source == "fallback"


class DiskCache:
    """Store UTF-8 completion text under the SHA-256 of the exact prompt."""

    def __init__(self, directory: Path | str | None = None) -> None:
        self.directory = Path(directory) if directory is not None else config.CACHE_DIR

    def _path(self, prompt: str) -> Path:
        digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        return self.directory / f"{digest}.json"

    def get(self, prompt: str) -> str | None:
        try:
            payload = json.loads(self._path(prompt).read_text(encoding="utf-8"))
        except (FileNotFoundError, UnicodeDecodeError, json.JSONDecodeError):
            return None
        if isinstance(payload, dict) and isinstance(payload.get("text"), str):
            return str(payload["text"])
        return None

    def put(self, prompt: str, text: str) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"text": text}, ensure_ascii=False, sort_keys=True) + "\n"
        # A complete entry becomes visible atomically, including to parallel readers.
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", dir=self.directory, delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
        try:
            os.replace(temporary, self._path(prompt))
        finally:
            temporary.unlink(missing_ok=True)


def cached_completion(
    prompt: str,
    request: Callable[[str], str | Completion] | None = None,
    *,
    cache_dir: Path | str | None = None,
    fallback: str,
) -> Completion:
    """Read first; invoke ``request`` only on a miss, or return local fallback.

    Fallback text is never cached as model output, so a later online invocation
    can still synthesize a rule for the same evidence.
    """

    cache = DiskCache(cache_dir)
    text = cache.get(prompt)
    if text is not None:
        return Completion(text, "cache")
    if request is None:
        return Completion(fallback, "fallback")
    response = request(prompt)
    completion = (
        response if isinstance(response, Completion) else Completion(response, "llm")
    )
    if not completion.fallback_used:
        cache.put(prompt, completion.text)
    return completion
