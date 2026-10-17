"""Hermetic replay of an agent against an in-memory cassette world.

The sandbox keeps the policy live while replacing every tool boundary with a
frozen cassette response.  It never constructs the example world, and its
failure path always produces a valid :class:`~grudge.schema.trace.Trace`.
"""

from __future__ import annotations

import builtins
import inspect
import io
import os
import socket
import threading
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, NoReturn

from grudge.errors import ReplayMismatch
from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry
from grudge.schema.trace import StateDiff, Step, ToolCall, ToolResult, Trace

_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


class CassetteWorld:
    """Expose cassette entries as methods compatible with ``_invoke_tool``.

    Entries are consumed at most once.  Among unconsumed entries, exact
    matchers win over subset matchers, which win over wildcard matchers; ties
    retain cassette order.  In lenient mode a miss is recorded and returns an
    empty mapping instead of raising.
    """

    def __init__(self, cassette: Cassette, *, strict: bool = True) -> None:
        self.cassette = cassette
        self.strict = strict
        self._consumed: set[int] = set()
        self._misses: list[tuple[str, dict[str, Any]]] = []

    @property
    def consumed(self) -> tuple[CassetteEntry, ...]:
        """Return consumed entries in cassette order."""

        return tuple(
            entry
            for index, entry in enumerate(self.cassette.world)
            if index in self._consumed
        )

    @property
    def consumed_indexes(self) -> frozenset[int]:
        """Return the indexes of entries served by this world."""

        return frozenset(self._consumed)

    @property
    def misses(self) -> tuple[tuple[str, dict[str, Any]], ...]:
        """Return unmatched calls observed in lenient mode."""

        return tuple((tool, dict(args)) for tool, args in self._misses)

    def call(self, tool: str, args: Mapping[str, Any] | None = None) -> Any:
        """Serve one frozen response for ``tool`` and ``args``."""

        actual = dict(args or {})
        candidates = [
            (index, entry)
            for index, entry in enumerate(self.cassette.world)
            if index not in self._consumed
            and entry.tool == tool
            and entry.match.matches(actual)
        ]
        priorities = {"exact": 0, "subset": 1, "any": 2}
        if candidates:
            index, entry = min(
                candidates,
                key=lambda item: (
                    priorities[item[1].match.kind],
                    item[1].order_hint if item[1].order_hint is not None else item[0],
                    item[0],
                ),
            )
            self._consumed.add(index)
            return entry.response

        self._misses.append((tool, actual))
        if self.strict:
            raise ReplayMismatch(
                f"no cassette response for {tool} with arguments {actual!r}"
            )
        return {}

    def list_emails(self) -> Any:
        """Serve the ``list_emails`` tool."""

        return self.call("list_emails")

    def read_email(self, id: str) -> Any:
        """Serve the ``read_email`` tool."""

        return self.call("read_email", {"id": id})

    def list_files(self) -> Any:
        """Serve the ``list_files`` tool."""

        return self.call("list_files")

    def read_file(self, path: str) -> Any:
        """Serve the ``read_file`` tool."""

        return self.call("read_file", {"path": path})

    def send_http(self, url: str, body: str) -> Any:
        """Serve the ``send_http`` tool without opening a connection."""

        return self.call("send_http", {"url": url, "body": body})

    def __getattr__(self, name: str) -> Callable[..., Any]:
        """Allow compatible agents to request cassette-defined tool names."""

        if name.startswith("_"):
            raise AttributeError(name)

        def invoke(**kwargs: Any) -> Any:
            return self.call(name, kwargs)

        return invoke


# A descriptive alias for callers that think of this object as a tool layer.
CassetteToolAdapter = CassetteWorld


@contextmanager
def _hermetic_guards() -> Iterator[None]:
    """Reject filesystem and socket access while an agent is running."""

    def blocked_filesystem(*args: Any, **kwargs: Any) -> NoReturn:
        del args, kwargs
        raise PermissionError("replay sandbox forbids filesystem access")

    def blocked_network(*args: Any, **kwargs: Any) -> NoReturn:
        del args, kwargs
        raise PermissionError("replay sandbox forbids network access")

    owner_ident = threading.get_ident()

    def guard(original: Any, blocked: Callable[..., NoReturn]) -> Callable[..., Any]:
        def guarded(*args: Any, **kwargs: Any) -> Any:
            if threading.get_ident() == owner_ident:
                return blocked(*args, **kwargs)
            return original(*args, **kwargs)

        return guarded

    patches: list[tuple[object, str, Any]] = [
        (builtins, "open", blocked_filesystem),
        (io, "open", blocked_filesystem),
        (os, "open", blocked_filesystem),
        (os, "fdopen", blocked_filesystem),
        (Path, "open", blocked_filesystem),
        (Path, "read_text", blocked_filesystem),
        (Path, "read_bytes", blocked_filesystem),
        (Path, "write_text", blocked_filesystem),
        (Path, "write_bytes", blocked_filesystem),
        (socket, "socket", blocked_network),
        (socket, "create_connection", blocked_network),
        (socket, "getaddrinfo", blocked_network),
        (socket, "gethostbyname", blocked_network),
        (socket, "gethostbyname_ex", blocked_network),
    ]
    originals: list[tuple[object, str, Any]] = []
    try:
        for owner, name, replacement in patches:
            if hasattr(owner, name):
                originals.append((owner, name, getattr(owner, name)))
                setattr(owner, name, guard(getattr(owner, name), replacement))
        yield
    finally:
        for owner, name, original in reversed(originals):
            setattr(owner, name, original)


def run_agent(
    agent_fn: Callable[..., Any],
    cassette: Cassette,
    llm: Any,
    *,
    timeout: float,
    max_steps: int,
) -> Trace:
    """Run ``agent_fn`` against ``cassette`` and always return a ``Trace``.

    The agent runs in a daemon thread so a non-cooperative policy cannot block
    the caller beyond ``timeout``.  Agent functions accepting ``run_id`` and
    ``max_actions`` receive deterministic replay values; narrower compatible
    callables receive only the parameters present in their signature.
    """

    if timeout <= 0 or max_steps < 0:
        return _failure_trace(cassette, agent_fn, "invalid replay limit", max_steps)

    world = CassetteWorld(cassette)
    result: list[Any] = []
    failure: list[BaseException] = []

    def target() -> None:
        try:
            with _hermetic_guards():
                result.append(_call_agent(agent_fn, world, llm, max_steps))
        except BaseException as exc:  # The public contract converts all failures.
            failure.append(exc)

    worker = threading.Thread(target=target, name="grudge-replay", daemon=True)
    worker.start()
    worker.join(timeout)
    if worker.is_alive():
        return _failure_trace(
            cassette, agent_fn, f"sandbox timeout after {timeout:g}s", max_steps
        )
    if failure:
        return _failure_trace(
            cassette, agent_fn, _failure_reason(failure[0]), max_steps
        )
    if not result or not isinstance(result[0], Trace):
        return _failure_trace(
            cassette, agent_fn, "agent did not return a Trace", max_steps
        )

    trace = result[0]
    if len(trace.steps) > max_steps:
        return trace.model_copy(
            update={"steps": trace.steps[:max_steps], "outcome": "failed"}
        )
    return trace


def world_from_trace(trace: Trace) -> Cassette:
    """Build a full, unshrunk cassette from every tool call in ``trace``."""

    results: dict[str, list[ToolResult]] = {}
    for step in trace.steps:
        if isinstance(step, ToolResult):
            results.setdefault(step.call_id, []).append(step)

    entries: list[CassetteEntry] = []
    for step in trace.steps:
        if not isinstance(step, ToolCall):
            continue
        result_list = results.get(step.call_id, [])
        result = result_list.pop(0) if result_list else None
        response = result.content if result is not None else {"error": "missing result"}
        entries.append(
            CassetteEntry(
                tool=step.tool,
                match=ArgMatcher.exact(dict(step.args)),
                response=response,
                order_hint=step.idx,
            )
        )
    return Cassette(task=trace.task, world=entries)


def _call_agent(
    agent_fn: Callable[..., Any],
    world: CassetteWorld,
    llm: Any,
    max_steps: int,
) -> Any:
    """Call an agent with only the compatible optional keyword arguments."""

    parameters: Mapping[str, inspect.Parameter]
    try:
        parameters = inspect.signature(agent_fn).parameters
    except (TypeError, ValueError):
        parameters = {}
    kwargs: dict[str, Any] = {}
    if "llm" in parameters or any(
        parameter.kind is inspect.Parameter.VAR_KEYWORD
        for parameter in parameters.values()
    ):
        kwargs["llm"] = llm
    if "run_id" in parameters:
        kwargs["run_id"] = "replay-run"
    if "max_actions" in parameters:
        kwargs["max_actions"] = max_steps
    return agent_fn(world, **kwargs)


def _failure_trace(
    cassette: Cassette,
    agent_fn: Callable[..., Any],
    reason: str,
    max_steps: int | None = None,
) -> Trace:
    """Create a deterministic schema-valid trace for a sandbox failure."""

    run_id = "replay-run"
    agent_name = getattr(
        agent_fn, "__qualname__", getattr(agent_fn, "__name__", "agent")
    )
    module = getattr(agent_fn, "__module__", "__main__")
    if max_steps == 0:
        steps: list[Step] = []
    else:
        steps = [
            StateDiff(
                idx=0,
                ts=_EPOCH,
                run_id=run_id,
                diff={},
                meta={"failure": reason},
            )
        ]
    return Trace(
        run_id=run_id,
        agent_version=f"{module}.{agent_name}",
        task=cassette.task,
        steps=steps,
        outcome="failed",
    )


def _failure_reason(error: BaseException) -> str:
    """Format an exception without including unstable traceback locations."""

    text = str(error)
    return f"{type(error).__name__}: {text}" if text else type(error).__name__


__all__ = [
    "CassetteToolAdapter",
    "CassetteWorld",
    "run_agent",
    "world_from_trace",
]
