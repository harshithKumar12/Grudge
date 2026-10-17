"""Pure content reducers used after cassette-entry delta debugging.

Each reducer accepts a JSON-compatible value (including a validated Pydantic
model), makes copies before trying candidates, and keeps a candidate only when
the supplied reproduction test still passes.  That makes the reducers safe to
compose and keeps cassette validation at the model boundary.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any, Protocol

from pydantic import BaseModel

from grudge.shrinker.ddmin import minimize

PathPart = str | int
Path = tuple[PathPart, ...]
ContentTest = Callable[[Any], bool]


class ContentReducer(Protocol):
    """The small common interface implemented by all content reducers."""

    def reduce(self, value: Any, test: ContentTest) -> Any:
        """Return the smallest accepted value this reducer can find."""


def _passes(test: ContentTest, value: Any) -> bool:
    """Treat structural lookup failures as a rejected candidate."""

    try:
        return bool(test(value))
    except (AttributeError, IndexError, KeyError, TypeError):
        return False


def _children(value: Any) -> Iterable[tuple[PathPart, Any]]:
    if isinstance(value, BaseModel):
        for name in type(value).model_fields:
            yield name, getattr(value, name)
    elif isinstance(value, Mapping):
        for key, child in value.items():
            if isinstance(key, str | int):
                yield key, child
    elif isinstance(value, list):
        yield from enumerate(value)


def _paths(value: Any, prefix: Path = ()) -> Iterable[Path]:
    for part, child in _children(value):
        path = (*prefix, part)
        yield path
        yield from _paths(child, path)


def _get_path(value: Any, path: Path) -> Any:
    current = value
    for part in path:
        if isinstance(current, BaseModel):
            current = getattr(current, str(part))
        else:
            current = current[part]
    return current


def _set_path(value: Any, path: Path, replacement: Any) -> None:
    if not path:
        raise ValueError("a reducer path must not be empty")
    parent = _get_path(value, path[:-1])
    part = path[-1]
    if isinstance(parent, BaseModel):
        setattr(parent, str(part), replacement)
    else:
        parent[part] = replacement


def _candidate(value: Any, path: Path, replacement: Any) -> Any | None:
    try:
        result = copy.deepcopy(value)
        _set_path(result, path, replacement)
    except (AttributeError, KeyError, IndexError, TypeError, ValueError):
        # Invalid assignments are expected for constrained Cassette fields
        # (for example, replacing a required tool name with "").
        return None
    return result


def _sentences(text: str) -> list[str]:
    """Split prose without dropping its terminal punctuation."""

    parts = re.split(r"(?<=[.!?])\s+", text)
    return [part for part in parts if part]


def _join_chunks(chunks: Sequence[str], *, lines: bool) -> str:
    return ("" if lines else " ").join(chunks)


def _tests_text(value: Any, path: Path, text: str, test: ContentTest) -> bool:
    candidate = _candidate(value, path, text)
    return candidate is not None and _passes(test, candidate)


class TrimDocument:
    """Remove irrelevant lines and sentences from text fields via ddmin."""

    def reduce(self, value: Any, test: ContentTest) -> Any:
        """Try every text field in stable traversal order."""

        result = copy.deepcopy(value)
        for path in list(_paths(result)):
            try:
                text = _get_path(result, path)
            except (AttributeError, KeyError, IndexError, TypeError):
                continue
            if not isinstance(text, str) or len(text) < 2:
                continue

            lines = text.splitlines(keepends=True)
            chunks = lines if len(lines) > 1 else _sentences(text)
            if len(chunks) > 1:

                def accepts_lines(
                    candidate: list[str],
                    base: Any = result,
                    field_path: Path = path,
                    line_mode: bool = len(lines) > 1,
                ) -> bool:
                    return _tests_text(
                        base,
                        field_path,
                        _join_chunks(candidate, lines=line_mode),
                        test,
                    )

                reduced_chunks, _ = minimize(
                    chunks,
                    accepts_lines,
                )
                replacement = _join_chunks(reduced_chunks, lines=len(lines) > 1)
                candidate = _candidate(result, path, replacement)
                if candidate is not None and _passes(test, candidate):
                    result = candidate

            # Once line noise is removed, sentence-level reduction can still
            # remove irrelevant prose within the surviving line(s).
            try:
                current_text = _get_path(result, path)
            except (AttributeError, KeyError, IndexError, TypeError):
                continue
            if not isinstance(current_text, str):
                continue
            sentences = _sentences(current_text)
            if len(sentences) <= 1:
                continue

            def accepts_sentences(
                candidate: list[str],
                base: Any = result,
                field_path: Path = path,
            ) -> bool:
                return _tests_text(
                    base,
                    field_path,
                    _join_chunks(candidate, lines=False),
                    test,
                )

            reduced_sentences, _ = minimize(
                sentences,
                accepts_sentences,
            )
            replacement = _join_chunks(reduced_sentences, lines=False)
            candidate = _candidate(result, path, replacement)
            if candidate is not None and _passes(test, candidate):
                result = candidate
        return result

    apply = reduce

    def __call__(self, value: Any, test: ContentTest) -> Any:
        return self.reduce(value, test)


def _neutral(value: Any) -> Any:
    if isinstance(value, str):
        return ""
    if isinstance(value, bool):
        return False
    if isinstance(value, int | float):
        return 0
    if isinstance(value, list):
        return []
    if isinstance(value, dict):
        return {}
    return None


class BlankField:
    """Blank fields one at a time whenever reproduction remains sound."""

    def __init__(self, fields: Sequence[str] | None = None) -> None:
        self.fields = frozenset(fields) if fields is not None else None

    def reduce(self, value: Any, test: ContentTest) -> Any:
        result = copy.deepcopy(value)
        for path in list(_paths(result)):
            if self.fields is not None and str(path[-1]) not in self.fields:
                continue
            try:
                old = _get_path(result, path)
            except (AttributeError, KeyError, IndexError, TypeError):
                continue
            replacement = _neutral(old)
            if replacement == old:
                continue
            candidate = _candidate(result, path, replacement)
            if candidate is not None and _passes(test, candidate):
                result = candidate
        return result

    apply = reduce

    def __call__(self, value: Any, test: ContentTest) -> Any:
        return self.reduce(value, test)


_ID_TOKEN = re.compile(
    r"\b(?P<prefix>email|user|account|order|ticket|message|document|file)"
    r"[-_][A-Za-z0-9]+\b",
    re.IGNORECASE,
)


def _id_tokens(value: Any) -> list[str]:
    tokens: list[str] = []
    for path in _paths(value):
        try:
            child = _get_path(value, path)
        except (AttributeError, KeyError, IndexError, TypeError):
            continue
        if not isinstance(child, str):
            continue
        for match in _ID_TOKEN.finditer(child):
            token = match.group(0)
            if token not in tokens:
                tokens.append(token)
    return tokens


def _replace_ids(value: Any, replacements: Mapping[str, str]) -> Any | None:
    result = copy.deepcopy(value)
    for path in list(_paths(result)):
        try:
            child = _get_path(result, path)
        except (AttributeError, KeyError, IndexError, TypeError):
            continue
        if not isinstance(child, str):
            continue
        replacement = child
        for old, new in replacements.items():
            replacement = re.sub(
                rf"(?<![A-Za-z0-9_-]){re.escape(old)}(?![A-Za-z0-9_-])",
                new,
                replacement,
            )
        if replacement != child:
            try:
                _set_path(result, path, replacement)
            except (AttributeError, KeyError, IndexError, TypeError, ValueError):
                return None
    return result


class NormalizeIds:
    """Canonicalize stable entity IDs only when the reproduction test passes."""

    def reduce(self, value: Any, test: ContentTest) -> Any:
        tokens = _id_tokens(value)
        if not tokens:
            return copy.deepcopy(value)

        counters: dict[str, int] = {}
        replacements: dict[str, str] = {}
        for token in tokens:
            prefix = token.split("-", 1)[0].split("_", 1)[0].lower()
            counters[prefix] = counters.get(prefix, 0) + 1
            replacements[token] = f"{prefix}_{counters[prefix]}"

        all_ids = _replace_ids(value, replacements)
        if all_ids is not None and _passes(test, all_ids):
            return all_ids

        result = copy.deepcopy(value)
        for token, replacement in replacements.items():
            candidate = _replace_ids(result, {token: replacement})
            if candidate is not None and _passes(test, candidate):
                result = candidate
        return result

    apply = reduce

    def __call__(self, value: Any, test: ContentTest) -> Any:
        return self.reduce(value, test)


def reduce_content(
    value: Any,
    test: ContentTest,
    *,
    reducers: Sequence[ContentReducer] | None = None,
) -> Any:
    """Apply the content-reducer pipeline in deterministic order."""

    current = value
    selected = reducers or (TrimDocument(), BlankField(), NormalizeIds())
    for reducer in selected:
        current = reducer.reduce(current, test)
    return current


__all__ = [
    "BlankField",
    "NormalizeIds",
    "TrimDocument",
    "reduce_content",
]
