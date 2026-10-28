"""Phase 10 event, orchestration, and local server acceptance tests."""

from __future__ import annotations

import json
import socket
import time
from types import SimpleNamespace
from typing import Any, cast
from urllib.request import Request, urlopen

import pytest

from grudge.demo.events import (
    AdmissionResult,
    BeatStarted,
    DemoEvent,
    DemoFinished,
    DemoStarted,
    EventBus,
    GateResult,
    PredicateSynthesized,
    RegressionDetected,
    ShrinkAttempt,
    ShrinkDone,
    ShrinkStarted,
    TraceOutcome,
    TraceStep,
)
from grudge.demo.orchestrator import DEFAULT_PACING, run_demo
from grudge.demo.server import DemoServer, _DemoHandler


def _types(events: list[DemoEvent]) -> list[str]:
    return [event.type for event in events]


def test_event_bus_sequences_events_and_unsubscribes() -> None:
    bus = EventBus()
    received: list[DemoEvent] = []
    unsubscribe = bus.subscribe(received.append)

    bus.publish(DemoStarted())
    bus.publish(BeatStarted(n=1, title="start"))
    unsubscribe()
    bus.publish(DemoFinished())

    assert [event.seq for event in bus.snapshot()] == [1, 2, 3]
    assert [event.type for event in received] == ["demo.started", "beat.started"]


def test_all_required_event_models_are_json_friendly() -> None:
    events: list[DemoEvent] = [
        DemoStarted(),
        BeatStarted(n=1, title="beat"),
        TraceStep(idx=0, kind="tool_call", summary="call", status="ok"),
        TraceOutcome(leaked=True),
        ShrinkStarted(total=4),
        ShrinkAttempt(removed=1, kept=True, remaining=3),
        ShrinkDone(before=4, after=3, bytes=123),
        PredicateSynthesized(dsl="rule", english="rule", source="fallback"),
        AdmissionResult(admitted=True, bad="red", good="green"),
        GateResult(
            agent="fixed", passes=20, n=20, wilson=0.8, threshold=0.8, passed=True
        ),
        RegressionDetected(markdown="blocked"),
        DemoFinished(),
    ]

    assert [event.model_dump(mode="json")["type"] for event in events] == [
        "demo.started",
        "beat.started",
        "trace.step",
        "trace.outcome",
        "shrink.started",
        "shrink.attempt",
        "shrink.done",
        "predicate.synthesized",
        "admission.result",
        "gate.result",
        "regression.detected",
        "demo.finished",
    ]


def test_default_presenter_pacing_matches_phase_runtime_budget() -> None:
    assert 0.35 <= DEFAULT_PACING <= 0.45


def test_fast_demo_event_order_and_gate_colors() -> None:
    started = time.perf_counter()
    events = run_demo(fast=True, runs=20)
    elapsed = time.perf_counter() - started
    types = _types(events)

    assert elapsed < 10
    assert types[0] == "demo.started"
    assert types[-1] == "demo.finished"
    beats = [event.n for event in events if isinstance(event, BeatStarted)]
    assert beats == [1, 2, 3, 4, 5]
    assert types.index("trace.step") < types.index("trace.outcome")
    assert types.index("shrink.started") < types.index("shrink.done")
    assert types.index("predicate.synthesized") < types.index("admission.result")

    gates = [event for event in events if isinstance(event, GateResult)]
    assert gates[0].agent == "vulnerable" and gates[0].passed is False
    assert gates[1].agent == "fixed" and gates[1].passed is True
    assert gates[-1].agent == "vulnerable" and gates[-1].passed is False
    assert events[-2].type == "regression.detected"


def test_demo_has_no_network_side_effect(monkeypatch: pytest.MonkeyPatch) -> None:
    def blocked(*_args: object, **_kwargs: object) -> socket.socket:
        raise AssertionError("demo attempted network access")

    monkeypatch.setattr(socket, "socket", blocked)
    events = run_demo(fast=True, runs=1)
    assert events[-1].type == "demo.finished"


def _get_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=3) as response:
        return cast(dict[str, Any], json.loads(response.read().decode("utf-8")))


def test_server_serves_state_restart_and_sse_replay() -> None:
    bus = EventBus()
    server = DemoServer(
        port=0,
        bus=bus,
        runner=lambda: run_demo(bus=bus, fast=True, runs=1),
    ).start()
    try:
        server.restart()
        deadline = time.monotonic() + 5
        state: dict[str, Any] = {"events": []}
        while time.monotonic() < deadline:
            state = _get_json(f"http://{server.address[0]}:{server.address[1]}/state")
            if state["events"] and state["events"][-1]["type"] == "demo.finished":
                break
            time.sleep(0.02)
        assert state["events"][-1]["type"] == "demo.finished"

        with urlopen(
            f"http://{server.address[0]}:{server.address[1]}/events", timeout=3
        ) as response:
            stream = response.read().decode("utf-8")
        assert "event: demo.started" in stream
        assert "event: demo.finished" in stream

        request = Request(
            f"http://{server.address[0]}:{server.address[1]}/restart",
            method="POST",
        )
        with urlopen(request, timeout=3) as response:
            assert response.status == 202
        assert _get_json(f"http://{server.address[0]}:{server.address[1]}/state")[
            "events"
        ]
        with urlopen(
            f"http://{server.address[0]}:{server.address[1]}/index.html", timeout=3
        ) as response:
            assert response.status == 200
            assert b"<html" in response.read()
        with urlopen(
            f"http://{server.address[0]}:{server.address[1]}/app.js", timeout=3
        ) as response:
            assert response.status == 200
    finally:
        server.close()


def test_sse_ignores_connection_aborted_client_disconnect() -> None:
    bus = EventBus()
    bus.publish(DemoStarted())

    def raise_connection_aborted(_event: DemoEvent) -> None:
        raise ConnectionAbortedError(10053, "client disconnected")

    handler = SimpleNamespace(
        server=SimpleNamespace(bus=bus),
        send_response=lambda _status: None,
        send_header=lambda *_args: None,
        end_headers=lambda: None,
        wfile=SimpleNamespace(flush=lambda: None),
        _write_event=raise_connection_aborted,
    )

    _DemoHandler._events(handler)  # type: ignore[arg-type]
