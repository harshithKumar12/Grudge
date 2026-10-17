"""Offline-first boundary for any OpenAI-compatible completion provider."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

import httpx

from grudge import config
from grudge.llm.cache import Completion, cached_completion

DEMO_DSL = "never call send_http where body tainted_by read_file()"


class Provider(Protocol):
    """An injectable adapter, independent of any provider SDK."""

    def __call__(self, prompt: str, *, api_key: str, model: str) -> str: ...


def is_offline(offline: bool | None = None) -> bool:
    """Resolve explicit mode, then the environment, then offline-safe defaults."""

    if offline is not None:
        return offline
    value = os.getenv("GRUDGE_OFFLINE")
    if value is None:
        return config.OFFLINE
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _http_completion(prompt: str, *, api_key: str, model: str) -> str:
    url = os.getenv("GRUDGE_LLM_URL")
    if not url:
        raise ValueError("online completion requires GRUDGE_LLM_URL")
    response = httpx.post(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    text = response.json()["choices"][0]["message"]["content"]
    if not isinstance(text, str):
        raise ValueError("completion provider returned non-text content")
    return text


def complete(
    prompt: str,
    *,
    offline: bool | None = None,
    cache_dir: Path | str | None = None,
    provider: Provider | None = None,
    fallback: str = DEMO_DSL,
) -> Completion:
    """Return cached, generated, or fallback text without eager credential reads.

    ``GRUDGE_LLM_API_KEY`` and ``GRUDGE_MODEL`` are consulted only for an online
    cache miss. The HTTP adapter accepts the full chat-completions endpoint in
    ``GRUDGE_LLM_URL``; callers may instead inject another provider adapter.
    """

    def request(text: str) -> str:
        api_key = os.getenv("GRUDGE_LLM_API_KEY")
        if not api_key:
            raise ValueError("online completion requires GRUDGE_LLM_API_KEY")
        model = os.getenv("GRUDGE_MODEL", config.DEFAULT_MODEL)
        return (provider or _http_completion)(text, api_key=api_key, model=model)

    return cached_completion(
        prompt,
        None if is_offline(offline) else request,
        cache_dir=cache_dir,
        fallback=fallback,
    )
