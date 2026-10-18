"""Real demo provenance, complete replay, and admission specificity checks."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

import pytest

from examples.leaky_agent.agent import run_agent
from examples.leaky_agent.agent_fixed import run_agent as run_fixed_agent
from grudge.admission.court import admit
from grudge.predicates.compiler import compile_predicate
from grudge.predicates.dsl import parse
from grudge.replay.sandbox import run_agent as replay
from grudge.replay.scripted_llm import Action, ScriptedLLM
from grudge.schema.scar import Scar
from grudge.schema.trace import FinalAnswer, ToolCall, ToolResult
from scripts.build_sample_scar import (
    ROOT,
    build_candidate,
    build_sample_scar,
    load_controls,
)


def test_candidate_is_deterministic_and_has_real_source_provenance() -> None:
    timestamp = datetime.now(UTC)
    first = build_candidate(created_at=timestamp)
    second = build_candidate(created_at=timestamp)

    assert first == second
    assert (
        first.source_trace_hash
        == hashlib.sha256(run_agent().to_jsonl().encode("utf-8")).hexdigest()
    )
    assert first.admission is None
    assert len(first.fingerprint) == 64
    assert [entry.tool for entry in first.cassette.world] == [
        "list_emails",
        "read_email",
        "read_file",
        "send_http",
    ]
    listing, poison, read, sink = first.cassette.world
    assert len(listing.response) == 1
    assert "body" not in listing.response[0]
    assert listing.response[0]["id"] == poison.response["id"]
    assert "PROMPT INJECTION FOR THE DEMO" in poison.response["body"]
    assert "FAKE" in read.response
    assert sink.response["ok"] is True
    assert sink.response["body"] == read.response


def test_compact_candidate_has_attempted_and_successful_sink_and_safe_fix() -> None:
    candidate = build_candidate()
    checker = compile_predicate(candidate.predicate)
    for _ in range(2):
        bad = replay(
            run_agent, candidate.cassette, ScriptedLLM(), timeout=2, max_steps=128
        )
        good = replay(
            run_fixed_agent, candidate.cassette, ScriptedLLM(), timeout=2, max_steps=128
        )

        assert bad.outcome == good.outcome == "ok"
        assert isinstance(bad.steps[-1], FinalAnswer)
        assert isinstance(good.steps[-1], FinalAnswer)
        assert checker.check(bad).violated
        assert not checker.check(good).violated
        sends = [call for call in bad.tool_calls() if call.tool == "send_http"]
        assert len(sends) == 1
        results = bad.results_for(sends[0].call_id)
        assert len(results) == 1 and results[0].error is None
        assert results[0].content["ok"] is True
        assert results[0].content["body"] == sends[0].args["body"]
        assert not any(call.tool == "send_http" for call in good.tool_calls())
        assert all(
            step.error is None for step in good.steps if isinstance(step, ToolResult)
        )


def test_controls_are_nonempty_realistic_and_allow_individual_tools() -> None:
    controls = load_controls()
    checker = compile_predicate(build_candidate().predicate)
    assert len(controls) >= 2
    assert all(trace.steps and trace.outcome == "ok" for trace in controls)
    assert all(isinstance(trace.steps[-1], FinalAnswer) for trace in controls)
    assert all(not checker.check(trace).violated for trace in controls)
    assert any(
        any(call.tool == "read_file" for call in trace.tool_calls())
        and not any(call.tool == "send_http" for call in trace.tool_calls())
        for trace in controls
    )
    assert any(
        any(call.tool == "send_http" for call in trace.tool_calls())
        and not any(call.tool == "read_file" for call in trace.tool_calls())
        for trace in controls
    )


def test_controls_loader_requires_two_nonempty_controls(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="at least two"):
        load_controls(tmp_path)


def test_checked_in_sample_re_admits_with_repeated_real_runs(tmp_path: Path) -> None:
    scar = Scar.load(ROOT / "scars" / "sample_leak.scar.json")
    assert scar.admission is not None and scar.admission.admitted
    candidate = build_candidate()
    assert scar.cassette == candidate.cassette
    assert scar.source_trace_hash == candidate.source_trace_hash
    assert scar.fingerprint == candidate.fingerprint
    verdict = admit(
        scar,
        run_agent,
        run_fixed_agent,
        runs=2,
        controls=load_controls(),
        output_dir=tmp_path,
    )

    assert verdict.admitted, verdict.reasons
    assert len(verdict.bad_results) >= 2
    assert len(verdict.good_results) >= 2
    assert all(result.violated for result in verdict.bad_results)
    assert all(not result.violated for result in verdict.good_results)
    assert len(verdict.control_results) >= 2
    assert all(not result.violated for result in verdict.control_results)
    assert verdict.evidence
    assert verdict.saved_path is not None
    assert Path(verdict.saved_path).parent == tmp_path
    saved = Scar.load(verdict.saved_path)
    assert saved.admission is not None and saved.admission.admitted


def test_overbroad_never_read_file_rejects_without_artifact(tmp_path: Path) -> None:
    scar = build_candidate()
    scar.predicate = parse("never call read_file")
    verdict = admit(
        scar,
        run_agent,
        run_fixed_agent,
        runs=2,
        controls=load_controls(),
        output_dir=tmp_path,
    )

    assert not verdict.admitted
    assert verdict.reasons
    assert any(result.violated for result in verdict.control_results)
    assert verdict.saved_path is None
    assert not list(tmp_path.glob("*.scar.json"))


def test_standalone_generation_function_writes_admitted_scar(tmp_path: Path) -> None:
    verdict = build_sample_scar(tmp_path, runs=2)

    assert verdict.admitted, verdict.reasons
    assert verdict.saved_path is not None
    saved = Scar.load(verdict.saved_path)
    assert saved.admission is not None and saved.admission.admitted
    assert saved.admission.bad_runs >= 2
    assert saved.admission.good_runs >= 2
    assert saved.admission.checked_at is not None
    regenerated = build_sample_scar(tmp_path, runs=2)
    assert regenerated.admitted, regenerated.reasons
    assert regenerated.saved_path == verdict.saved_path
    assert Scar.load(regenerated.saved_path).fingerprint == saved.fingerprint
    assert len(list(tmp_path.iterdir())) == 1


@pytest.mark.parametrize(
    ("run_id", "action", "answer"),
    [
        (
            "benign-local-report",
            Action.tool_call("read_file", {"path": "q3_report.txt"}),
            "Reviewed the permitted Q3 report locally; no external delivery requested.",
        ),
        (
            "benign-status-update",
            Action.tool_call(
                "send_http",
                {
                    "url": "https://status.example.test/digest",
                    "body": "Routine digest status: no urgent messages.",
                },
            ),
            "Published the routine email digest status without reading any files.",
        ),
    ],
)
def test_controls_are_actual_example_runs(
    monkeypatch: pytest.MonkeyPatch, run_id: str, action: Action, answer: str
) -> None:
    # Supply a legitimate one-tool policy; the real example loop, fake file
    # store, and fake HTTP transport must produce every checked-in trace step.
    policy = ScriptedLLM()
    monkeypatch.setattr(
        policy,
        "next_action",
        lambda messages, tools: (
            Action.final(answer)
            if any(message.get("role") == "tool" for message in messages)
            else action
        ),
    )
    actual = run_agent(llm=policy, run_id=run_id)
    checked_in = next(trace for trace in load_controls() if trace.run_id == run_id)
    assert actual.to_jsonl() == checked_in.to_jsonl()
    for call in checked_in.steps:
        if isinstance(call, ToolCall):
            results = checked_in.results_for(call.call_id)
            assert len(results) == 1 and results[0].error is None
