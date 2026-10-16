"""Phase 1 cassette contracts for frozen tool worlds and deterministic replay."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from grudge.errors import SchemaError


class _SchemaModel(BaseModel):
    """Base model that exposes schema failures as Grudge errors."""

    model_config = ConfigDict(populate_by_name=True, validate_assignment=True)

    def __init__(self, **data: Any) -> None:
        try:
            super().__init__(**data)
        except ValidationError as exc:
            raise SchemaError(str(exc)) from exc

    @classmethod
    def model_validate(
        cls,
        obj: Any,
        *,
        strict: bool | None = None,
        from_attributes: bool | None = None,
        context: dict[str, Any] | None = None,
    ) -> Self:
        try:
            return super().model_validate(
                obj,
                strict=strict,
                from_attributes=from_attributes,
                context=context,
            )
        except ValidationError as exc:
            raise SchemaError(str(exc)) from exc

    @classmethod
    def model_validate_json(
        cls,
        json_data: str | bytes | bytearray,
        *,
        strict: bool | None = None,
        context: dict[str, Any] | None = None,
    ) -> Self:
        try:
            return super().model_validate_json(
                json_data,
                strict=strict,
                context=context,
            )
        except (ValidationError, ValueError) as exc:
            raise SchemaError(str(exc)) from exc


def _is_subset(expected: Mapping[str, Any], actual: Mapping[str, Any]) -> bool:
    """Compare mappings recursively while treating non-mappings as exact."""

    for key, value in expected.items():
        if key not in actual:
            return False
        actual_value = actual[key]
        if isinstance(value, Mapping):
            if not isinstance(actual_value, Mapping) or not _is_subset(
                value, actual_value
            ):
                return False
        elif actual_value != value:
            return False
    return True


class ArgMatcher(_SchemaModel):
    """A deterministic exact, recursive subset, or wildcard argument matcher."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    kind: Literal["exact", "subset", "any"]
    args: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _normalise_shapes(cls, value: Any) -> Any:
        if not isinstance(value, Mapping):
            return value
        data = dict(value)
        kind = data.get("kind", data.get("mode", data.get("type")))
        if kind is None:
            for candidate in ("exact", "subset", "any"):
                if candidate in data:
                    kind = candidate
                    candidate_value = data[candidate]
                    return {
                        "kind": kind,
                        "args": {} if candidate == "any" else candidate_value,
                    }
        if kind is not None:
            data["kind"] = kind
            data.pop("mode", None)
            data.pop("type", None)
            if "args" not in data:
                if "value" in data:
                    data["args"] = data.pop("value")
                elif kind == "any":
                    data["args"] = {}
        return data

    @classmethod
    def exact(cls, args: dict[str, Any]) -> ArgMatcher:
        """Build an exact matcher."""

        return cls(kind="exact", args=args)

    @classmethod
    def subset(cls, args: dict[str, Any]) -> ArgMatcher:
        """Build a recursive subset matcher."""

        return cls(kind="subset", args=args)

    @classmethod
    def any(cls) -> ArgMatcher:
        """Build a matcher accepting any argument mapping."""

        return cls(kind="any")

    def matches(self, actual: Mapping[str, Any]) -> bool:
        """Return whether ``actual`` satisfies this matcher."""

        if self.kind == "any":
            return True
        if self.kind == "exact":
            return dict(actual) == self.args
        return _is_subset(self.args, actual)


class CassetteEntry(_SchemaModel):
    """One frozen response available from a cassette-backed tool world."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    tool: str = Field(min_length=1)
    match: ArgMatcher
    response: Any
    order_hint: int | None = None


class Cassette(_SchemaModel):
    """A task and ordered set of tool responses used during replay."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    task: str
    world: list[CassetteEntry] = Field(default_factory=list)

    def _canonical_json(self) -> str:
        return json.dumps(
            self.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    def size_bytes(self) -> int:
        """Return the UTF-8 byte size of the canonical cassette JSON."""

        return len(self._canonical_json().encode("utf-8"))

    @property
    def content_hash(self) -> str:
        """Return the stable SHA-256 hash of canonical cassette content."""

        return hashlib.sha256(self._canonical_json().encode("utf-8")).hexdigest()


__all__ = ["ArgMatcher", "Cassette", "CassetteEntry"]
