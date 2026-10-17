"""Phase 4 cassette-backed tool layer for deterministic replay."""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import partial
from typing import Any

from grudge.errors import ReplayMismatch
from grudge.schema.cassette import Cassette, CassetteEntry

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ReplayMiss:
    """A tool invocation for which the cassette had no available response."""

    tool: str
    args: dict[str, Any]


class CassettePlayer:
    """Serve each matching cassette response at most once.

    Entries are selected by tool name, then by matcher precedence (``exact``,
    ``subset``, ``any``), with cassette order as the deterministic tie-breaker.
    The player is callable and also exposes ``call``/``invoke`` plus bound
    tool functions through :meth:`tool` and :attr:`tools`.
    """

    def __init__(self, cassette: Cassette, *, strict: bool = True) -> None:
        self.cassette = cassette
        self.strict = strict
        self._consumed_indices: list[int] = []
        self._misses: list[ReplayMiss] = []

    @property
    def consumed_indices(self) -> tuple[int, ...]:
        """Return cassette indexes in the order their entries were consumed."""

        return tuple(self._consumed_indices)

    @property
    def consumed_entries(self) -> tuple[CassetteEntry, ...]:
        """Return consumed entries in invocation order."""

        return tuple(self.cassette.world[index] for index in self._consumed_indices)

    @property
    def consumed(self) -> tuple[CassetteEntry, ...]:
        """Compatibility alias for :attr:`consumed_entries`."""

        return self.consumed_entries

    @property
    def remaining_entries(self) -> tuple[CassetteEntry, ...]:
        """Return entries that have not yet been consumed."""

        consumed = set(self._consumed_indices)
        return tuple(
            entry
            for index, entry in enumerate(self.cassette.world)
            if index not in consumed
        )

    @property
    def misses(self) -> tuple[ReplayMiss, ...]:
        """Return recorded misses in invocation order."""

        return tuple(self._misses)

    @property
    def miss_log(self) -> tuple[ReplayMiss, ...]:
        """Compatibility alias for :attr:`misses`."""

        return self.misses

    def call(
        self,
        tool: str,
        args: Mapping[str, Any] | None = None,
        **keyword_args: Any,
    ) -> Any:
        """Invoke a cassette-backed tool.

        Arguments may be supplied as one mapping or as keyword arguments. A
        matching entry is consumed before its response is returned.
        """

        if args is not None and keyword_args:
            raise TypeError("provide tool arguments as a mapping or keywords, not both")
        actual_args = dict(args) if args is not None else dict(keyword_args)

        for kind in ("exact", "subset", "any"):
            for index, entry in enumerate(self.cassette.world):
                if index in self._consumed_indices:
                    continue
                if entry.tool != tool or entry.match.kind != kind:
                    continue
                if entry.match.matches(actual_args):
                    self._consumed_indices.append(index)
                    return entry.response

        miss = ReplayMiss(tool=tool, args=actual_args)
        self._misses.append(miss)
        message = f"no cassette response for tool {tool!r} with args {actual_args!r}"
        if self.strict:
            raise ReplayMismatch(message)
        logger.warning("cassette replay miss: %s", message)
        return {}

    def invoke(
        self,
        tool: str,
        args: Mapping[str, Any] | None = None,
        **keyword_args: Any,
    ) -> Any:
        """Alias for :meth:`call` suitable for tool-dispatch loops."""

        return self.call(tool, args, **keyword_args)

    def __call__(
        self,
        tool: str,
        args: Mapping[str, Any] | None = None,
        **keyword_args: Any,
    ) -> Any:
        """Alias allowing a player to be used directly as a tool dispatcher."""

        return self.call(tool, args, **keyword_args)

    def tool(self, tool: str) -> Callable[..., Any]:
        """Return a callable bound to one cassette tool name."""

        return partial(self.call, tool)

    def get_tool(self, tool: str) -> Callable[..., Any]:
        """Compatibility alias for :meth:`tool`."""

        return self.tool(tool)

    @property
    def tools(self) -> dict[str, Callable[..., Any]]:
        """Return bound callables for every tool named in the cassette."""

        names = dict.fromkeys(entry.tool for entry in self.cassette.world)
        return {name: self.tool(name) for name in names}


def play_cassette(cassette: Cassette, *, strict: bool = True) -> CassettePlayer:
    """Build a cassette player through the legacy factory name."""

    return CassettePlayer(cassette, strict=strict)


__all__ = ["CassettePlayer", "ReplayMiss", "play_cassette"]
