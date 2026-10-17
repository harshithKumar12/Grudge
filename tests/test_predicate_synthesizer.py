"""Offline-safe synthesis, parser retries, and prompt-addressed cache behavior."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from grudge.llm import DiskCache, complete
from grudge.llm.client import DEMO_DSL
from grudge.predicates.compiler import compile_predicate
from grudge.predicates.dsl import parse
from grudge.predicates.fallback_rules import demo_rule
from grudge.predicates.synthesizer import build_prompt, synthesize
from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry
from grudge.schema.trace import Trace
from grudge.shrinker.cassette_builder import ShrinkResult


class FakeClient:
    def __init__(self, *responses: str) -> None:
        self.responses = iter(responses)
        self.prompts: list[str] = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return next(self.responses)


@pytest.fixture
def evidence() -> tuple[ShrinkResult, Trace]:
    cassette = Cassette(
        task="Summarize a document",
        world=[
            CassetteEntry(
                tool="read_file", match=ArgMatcher.any(), response="demo secret"
            )
        ],
    )
    result = ShrinkResult(cassette, cassette, {"oracle_calls": 1}, [])
    common = {"ts": "2026-01-01T00:00:00Z", "run_id": "synthesis-demo"}
    trace = Trace.model_validate(
        {
            "run_id": "synthesis-demo",
            "agent_version": "test",
            "task": cassette.task,
            "outcome": "failed",
            "steps": [
                {
                    **common,
                    "kind": "tool_call",
                    "idx": 0,
                    "tool": "read_file",
                    "args": {"path": "api_keys.txt"},
                    "call_id": "read",
                },
                {
                    **common,
                    "kind": "tool_result",
                    "idx": 1,
                    "call_id": "read",
                    "content": "demo secret",
                },
                {
                    **common,
                    "kind": "tool_call",
                    "idx": 2,
                    "tool": "send_http",
                    "args": {"body": "prefix: demo secret"},
                    "call_id": "send",
                },
            ],
        }
    )
    return result, trace


def test_garbage_then_valid_retries_with_parse_error(
    evidence: tuple[ShrinkResult, Trace], tmp_path: Path
) -> None:
    client = FakeClient("this is not a predicate", DEMO_DSL)
    result = synthesize(*evidence, client=client, offline=False, cache_dir=tmp_path)

    assert result.dsl == DEMO_DSL
    assert result.predicate == parse(DEMO_DSL)
    assert result.attempts == 2
    assert result.source == "llm"
    assert not result.fallback_used
    assert result.rationale
    assert len(client.prompts) == 2
    assert "DSL parse error:" in client.prompts[1]
    assert "this is not a predicate" in client.prompts[1]


def test_three_malformed_drafts_use_hand_verified_fallback(
    evidence: tuple[ShrinkResult, Trace], tmp_path: Path
) -> None:
    client = FakeClient("garbage one", "garbage two", "garbage three")
    result = synthesize(*evidence, client=client, offline=False, cache_dir=tmp_path)

    assert result.predicate == demo_rule()
    assert result.dsl == DEMO_DSL
    assert result.fallback_used
    assert not result.cache_used
    assert result.attempts == 3
    assert len(client.prompts) == 3
    assert "garbage two" in client.prompts[2]


def test_disk_cache_prevents_second_client_call_and_supports_offline(
    evidence: tuple[ShrinkResult, Trace], tmp_path: Path
) -> None:
    client = FakeClient("garbage", DEMO_DSL)
    first = synthesize(*evidence, client=client, offline=False, cache_dir=tmp_path)
    second = synthesize(*evidence, client=client, offline=False, cache_dir=tmp_path)
    offline = synthesize(*evidence, client=client, offline=True, cache_dir=tmp_path)

    assert first.source == "llm"
    assert second.cache_used and offline.cache_used
    assert second.attempts == offline.attempts == 1
    assert first.predicate == second.predicate == offline.predicate
    assert len(client.prompts) == 2


def test_offline_demo_fallback_never_calls_client_or_network(
    evidence: tuple[ShrinkResult, Trace],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("offline synthesis attempted a network request")

    monkeypatch.setattr("httpx.post", forbidden)
    monkeypatch.setenv("GRUDGE_OFFLINE", "true")
    monkeypatch.delenv("GRUDGE_LLM_API_KEY", raising=False)
    client = FakeClient()
    first = synthesize(*evidence, client=client, cache_dir=tmp_path)
    second = synthesize(*evidence, client=client, cache_dir=tmp_path)

    assert first == second
    assert first.predicate == demo_rule()
    assert first.fallback_used
    assert first.attempts == 0
    assert client.prompts == []
    assert not list(tmp_path.iterdir())


def test_prompt_contains_minimal_evidence_and_original_trace(
    evidence: tuple[ShrinkResult, Trace],
) -> None:
    prompt = build_prompt(*evidence)
    assert prompt == build_prompt(*evidence)
    assert '"minimal_cassette"' in prompt
    assert '"original_trace"' in prompt
    assert "demo secret" in prompt
    assert "synthesis-demo" in prompt


def test_disk_cache_uses_prompt_hash_and_deterministic_bytes(tmp_path: Path) -> None:
    cache = DiskCache(tmp_path)
    prompt = "Unicode prompt: café\n"
    cache.put(prompt, DEMO_DSL)
    filename = tmp_path / f"{hashlib.sha256(prompt.encode('utf-8')).hexdigest()}.json"
    original = filename.read_bytes()
    cache.put(prompt, DEMO_DSL)

    assert filename.read_bytes() == original
    assert DiskCache(tmp_path).get(prompt) == DEMO_DSL
    assert cache.get(prompt.rstrip()) is None
    assert len(list(tmp_path.iterdir())) == 1


def test_completion_checks_cache_and_offline_before_reading_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def forbidden(*args: object, **kwargs: object) -> str:
        pytest.fail("cache/offline path read environment or contacted a provider")

    DiskCache(tmp_path).put("cached prompt", DEMO_DSL)
    monkeypatch.setattr("grudge.llm.client.os.getenv", forbidden)
    cached = complete("cached prompt", offline=False, cache_dir=tmp_path)
    fallback = complete("new prompt", offline=True, cache_dir=tmp_path)

    assert cached.cache_hit and cached.text == DEMO_DSL
    assert fallback.fallback_used and fallback.text == DEMO_DSL


def test_online_provider_reads_credentials_only_on_cache_miss(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, str, str]] = []

    def provider(prompt: str, *, api_key: str, model: str) -> str:
        calls.append((prompt, api_key, model))
        return DEMO_DSL

    monkeypatch.setenv("GRUDGE_LLM_API_KEY", "fake-key")
    monkeypatch.setenv("GRUDGE_MODEL", "fake-model")
    first = complete("draft", offline=False, cache_dir=tmp_path, provider=provider)
    monkeypatch.delenv("GRUDGE_LLM_API_KEY")
    second = complete("draft", offline=False, cache_dir=tmp_path, provider=provider)

    assert first.source == "llm"
    assert second.cache_hit
    assert calls == [("draft", "fake-key", "fake-model")]


def test_corrupt_cached_draft_is_reparsed_then_falls_back_offline(
    evidence: tuple[ShrinkResult, Trace], tmp_path: Path
) -> None:
    DiskCache(tmp_path).put(build_prompt(*evidence), "not DSL")
    result = synthesize(
        *evidence, client=FakeClient(), offline=True, cache_dir=tmp_path
    )

    assert result.fallback_used
    assert result.attempts == 1


def test_missing_online_credentials_falls_back(
    evidence: tuple[ShrinkResult, Trace],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GRUDGE_LLM_API_KEY", raising=False)
    result = synthesize(*evidence, offline=False, cache_dir=tmp_path)
    assert result.fallback_used
    assert result.attempts == 0


def test_demo_fallback_detects_leak_and_passes_safe_trace(
    evidence: tuple[ShrinkResult, Trace],
) -> None:
    checker = compile_predicate(demo_rule())
    trace = evidence[1]
    safe = trace.model_copy(deep=True)
    safe.steps[-1] = safe.tool_calls()[-1].model_copy(
        update={"args": {"body": "safe public content"}}
    )
    leaking = checker.check(trace)
    fixed = checker.check(safe)

    assert leaking.violated
    assert {getattr(step, "tool", None) for step in leaking.evidence} >= {
        "read_file",
        "send_http",
    }
    assert not fixed.violated


def test_synthesis_rejects_parseable_but_unimplemented_outcome(
    evidence: tuple[ShrinkResult, Trace], tmp_path: Path
) -> None:
    client = FakeClient("must finish failed", DEMO_DSL)

    result = synthesize(*evidence, client=client, offline=False, cache_dir=tmp_path)

    assert result.attempts == 2
    assert result.dsl == DEMO_DSL
    assert "roadmap: predicates.outcome" in client.prompts[1]
    assert compile_predicate(result.predicate).check(evidence[1]).violated


def test_synthesized_predicate_can_be_persisted_in_a_scar(
    evidence: tuple[ShrinkResult, Trace], tmp_path: Path
) -> None:
    from datetime import UTC, datetime

    from grudge.schema.scar import Scar

    result = synthesize(*evidence, offline=True, cache_dir=tmp_path / "cache")
    scar = Scar(
        id="schema-roundtrip",
        cassette=evidence[0].minimal,
        predicate=result.predicate,
        seed_predicate=result.dsl,
        source_trace_hash="fake-trace-hash",
        agent_version_failed="vulnerable",
        agent_version_fixed="fixed",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        fingerprint="fake-fingerprint",
    )
    path = tmp_path / "roundtrip.scar.json"
    scar.write(path)

    restored = Scar.read(path)
    assert restored.predicate == result.predicate
    assert compile_predicate(restored.predicate).check(evidence[1]).violated
