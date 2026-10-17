"""Two-level cassette shrinking orchestration.

Level one removes whole cassette entries using ordered delta debugging.  Level
two removes irrelevant response fields, list members, text tokens, and matcher
detail.  Every attempted candidate is recorded in ``history`` so callers can
animate or audit the deterministic search.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any, TypeAlias

from grudge.errors import OracleError
from grudge.schema.cassette import ArgMatcher, Cassette, CassetteEntry
from grudge.shrinker.oracle import Oracle, PredicateOracle, SeedPredicate

ReductionEvent: TypeAlias = dict[str, Any]
ContentReducer: TypeAlias = Callable[[Cassette], Iterable[tuple[str, Cassette]]]


class ShrinkResult:
    """The original cassette, its minimal candidate, and deterministic history."""

    def __init__(
        self,
        original: Cassette,
        minimal: Cassette,
        stats: Mapping[str, int],
        history: Sequence[ReductionEvent],
    ) -> None:
        self.original = original
        self.minimal = minimal
        self.stats = dict(stats)
        self.history = list(history)


def _candidate(
    current: Cassette,
    entries: Sequence[CassetteEntry],
) -> Cassette:
    """Copy a cassette while replacing its ordered world."""

    return current.model_copy(update={"world": list(entries)}, deep=True)


def _event(
    *,
    level: str,
    reducer: str,
    kept: bool,
    before: Cassette,
    after: Cassette,
    attempted_removal: int,
) -> ReductionEvent:
    return {
        "level": level,
        "reducer": reducer,
        "attempted_removal": attempted_removal,
        "kept": kept,
        "size_before": len(before.world),
        "size_after": len(after.world),
        "bytes_before": before.size_bytes(),
        "bytes_after": after.size_bytes(),
    }


def _chunks(items: Sequence[CassetteEntry], count: int) -> list[list[CassetteEntry]]:
    """Partition items into contiguous, stable chunks."""

    size, remainder = divmod(len(items), count)
    chunks: list[list[CassetteEntry]] = []
    start = 0
    for index in range(count):
        width = size + (1 if index < remainder else 0)
        if width:
            chunks.append(list(items[start : start + width]))
        start += width
    return chunks


def _complement(
    items: Sequence[CassetteEntry], subset: Sequence[CassetteEntry]
) -> list[CassetteEntry]:
    """Remove one occurrence of each subset item, preserving duplicates."""

    remaining = list(subset)
    complement: list[CassetteEntry] = []
    for item in items:
        try:
            index = remaining.index(item)
        except ValueError:
            complement.append(item)
        else:
            remaining.pop(index)
    return complement


def _entry_ddmin(
    cassette: Cassette,
    oracle: Oracle,
    history: list[ReductionEvent],
) -> Cassette:
    """Perform classic Zeller ddmin over the ordered cassette entries."""

    current = cassette
    granularity = 2
    while len(current.world) >= 2:
        granularity = min(granularity, len(current.world))
        partitions = _chunks(current.world, granularity)
        reduced = False

        # First try each subset, then each complement.  This is the classic
        # algorithm and handles both single culprits and interacting pairs.
        for subset in partitions:
            candidate = _candidate(current, subset)
            result = oracle.reproduces(candidate)
            history.append(
                _event(
                    level="entries",
                    reducer="ddmin-subset",
                    kept=result.reproduced,
                    before=current,
                    after=candidate if result.reproduced else current,
                    attempted_removal=len(current.world) - len(subset),
                )
            )
            if result.reproduced:
                current = candidate
                granularity = max(granularity - 1, 2)
                reduced = True
                break
        if reduced:
            continue

        for subset in partitions:
            complement = _complement(current.world, subset)
            candidate = _candidate(current, complement)
            result = oracle.reproduces(candidate)
            history.append(
                _event(
                    level="entries",
                    reducer="ddmin-complement",
                    kept=result.reproduced,
                    before=current,
                    after=candidate if result.reproduced else current,
                    attempted_removal=len(current.world) - len(complement),
                )
            )
            if result.reproduced:
                current = candidate
                granularity = max(granularity - 1, 2)
                reduced = True
                break
        if reduced:
            continue

        if granularity == len(current.world):
            break
        granularity = min(len(current.world), granularity * 2)
    return current


def _string_variants(value: str) -> Iterable[str]:
    """Yield stable text reductions from coarse to fine."""

    if not value:
        return
    yield ""
    words = value.split()
    if len(words) > 1:
        # Chunk removal is enough to preserve the two meaningful fragments in
        # the demo injection while discarding its prose and filler.
        for count in range(2, len(words) + 1):
            chunks = _word_chunks(words, count)
            for chunk in chunks:
                yield " ".join(
                    word for index, word in enumerate(words) if index not in chunk
                )
    if len(value) > 1:
        yield value[: len(value) // 2]


def _word_chunks(words: Sequence[str], count: int) -> list[set[int]]:
    """Return index chunks for deterministic token-level reduction."""

    width, remainder = divmod(len(words), count)
    chunks: list[set[int]] = []
    start = 0
    for index in range(count):
        chunk_width = width + (1 if index < remainder else 0)
        if chunk_width:
            chunks.append(set(range(start, start + chunk_width)))
        start += chunk_width
    return chunks


def _value_variants(value: Any) -> Iterable[Any]:
    """Yield one deterministic, local reduction for a JSON-like value."""

    if isinstance(value, str):
        yield from _string_variants(value)
        return
    if isinstance(value, Mapping):
        for key in value:
            reduced = dict(value)
            del reduced[key]
            yield reduced
        for key, child in value.items():
            for replacement in _value_variants(child):
                reduced = dict(value)
                reduced[key] = replacement
                yield reduced
        return
    if isinstance(value, list):
        for index in range(len(value)):
            yield value[:index] + value[index + 1 :]
        for index, child in enumerate(value):
            for replacement in _value_variants(child):
                reduced_list = list(value)
                reduced_list[index] = replacement
                yield reduced_list


def _content_candidates(cassette: Cassette) -> Iterable[tuple[str, Cassette]]:
    """Yield candidate cassettes for the current level-two pass."""

    for entry_index, entry in enumerate(cassette.world):
        for replacement in _value_variants(entry.response):
            entries = list(cassette.world)
            entries[entry_index] = entry.model_copy(update={"response": replacement})
            yield "content", _candidate(cassette, entries)
        if entry.match.kind != "any":
            entries = list(cassette.world)
            entries[entry_index] = entry.model_copy(update={"match": ArgMatcher.any()})
            yield "matcher", _candidate(cassette, entries)


def _reduce_content(
    cassette: Cassette,
    oracle: Oracle,
    history: list[ReductionEvent],
) -> Cassette:
    """Apply content reductions to a fixed point in stable order."""

    current = cassette
    while True:
        accepted = False
        for reducer, candidate in _content_candidates(current):
            result = oracle.reproduces(candidate)
            history.append(
                _event(
                    level="content",
                    reducer=reducer,
                    kept=result.reproduced,
                    before=current,
                    after=candidate if result.reproduced else current,
                    attempted_removal=0,
                )
            )
            if result.reproduced:
                current = candidate
                accepted = True
                break
        if not accepted:
            return current


def build_minimal_cassette(
    original: Cassette,
    oracle: Oracle | None = None,
    *,
    agent_fn: Callable[..., Any] | None = None,
    seed_predicate: SeedPredicate | Any | None = None,
    llm: Any = None,
    repeats: int = 1,
    max_oracle_calls: int | None = 1000,
    timeout: float = 2.0,
    max_steps: int = 128,
) -> ShrinkResult:
    """Build a minimal reproducing cassette with ordered reduction history.

    Callers may provide an existing ``Oracle`` or the ``agent_fn`` and
    ``seed_predicate`` needed to construct a :class:`PredicateOracle`.
    """

    if oracle is None:
        if agent_fn is None or seed_predicate is None:
            raise TypeError(
                "provide oracle, or provide both agent_fn and seed_predicate"
            )
        oracle = PredicateOracle(
            agent_fn,
            seed_predicate,
            llm=llm,
            repeats=repeats,
            max_oracle_calls=max_oracle_calls,
            timeout=timeout,
            max_steps=max_steps,
        )
    original_copy = original.model_copy(deep=True)
    initial = oracle.reproduces(original_copy)
    if not initial.reproduced:
        raise OracleError(
            "cannot shrink a cassette that does not reproduce: " + initial.reason
        )

    history: list[ReductionEvent] = []
    entry_minimal = _entry_ddmin(original_copy, oracle, history)
    minimal = _reduce_content(entry_minimal, oracle, history)
    stats = {
        "oracle_calls": int(getattr(oracle, "calls", 0)),
        "cache_hits": int(getattr(oracle, "cache_hits", 0)),
        "history_events": len(history),
        "original_entries": len(original_copy.world),
        "minimal_entries": len(minimal.world),
        "original_bytes": original_copy.size_bytes(),
        "minimal_bytes": minimal.size_bytes(),
    }
    return ShrinkResult(original_copy, minimal, stats, history)


__all__ = [
    "ContentReducer",
    "ReductionEvent",
    "ShrinkResult",
    "build_minimal_cassette",
]
