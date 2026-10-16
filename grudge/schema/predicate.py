"""Phase 1 predicate AST contracts for describing agent behaviour.

The models in this module are data contracts only.  They describe call shapes,
ordering, taint flow, and run outcomes for later deterministic checkers; they
do not evaluate a trace themselves.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import AliasChoices, ConfigDict, Field, model_validator

from grudge.schema.cassette import _SchemaModel


def _arguments_text(arguments: dict[str, Any]) -> str:
    """Render argument matching data deterministically for descriptions."""

    return json.dumps(
        arguments,
        ensure_ascii=False,
        sort_keys=True,
        separators=(", ", ": "),
    )


class CallShape(_SchemaModel):
    """A tool call shape identified by tool name and matching arguments."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    kind: Literal["call_shape"] = "call_shape"
    tool: str = Field(min_length=1)
    args: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("args", "arguments"),
    )

    def describe(self) -> str:
        """Return a plain-English description of this call shape."""

        arguments = _arguments_text(self.args)
        return f"Call `{self.tool}` with arguments matching {arguments}."


class Ordering(_SchemaModel):
    """A relationship requiring one tool call to precede another."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    kind: Literal["ordering"] = "ordering"
    before: str = Field(
        min_length=1,
        validation_alias=AliasChoices("before", "first"),
    )
    after: str = Field(
        min_length=1,
        validation_alias=AliasChoices("after", "then"),
    )

    def describe(self) -> str:
        """Return a plain-English description of this ordering rule."""

        return f"Call `{self.before}` before calling `{self.after}`."


class TaintFlow(_SchemaModel):
    """A flow relationship from a source tool to a sink tool."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    kind: Literal["taint_flow"] = "taint_flow"
    source: str = Field(min_length=1)
    sink: str = Field(min_length=1)
    source_field: str | None = Field(
        default=None,
        validation_alias=AliasChoices("source_field", "from_field"),
    )
    sink_field: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sink_field", "to_field"),
    )

    def describe(self) -> str:
        """Return a plain-English description of this taint flow."""

        source = self.source
        sink = self.sink
        if self.source_field is not None:
            source = f"{source}.{self.source_field}"
        if self.sink_field is not None:
            sink = f"{sink}.{self.sink_field}"
        return f"Data from `{source}` must not flow to `{sink}`."


class Outcome(_SchemaModel):
    """The Phase 1 run-outcome data contract used by predicate ASTs.

    This model records the expected terminal outcome value.  It intentionally
    contains no checker or trace-evaluation behaviour; that belongs to a later
    predicate implementation stage.
    """

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    kind: Literal["outcome"] = "outcome"
    outcome: Literal["ok", "failed"] = Field(
        validation_alias=AliasChoices("outcome", "status", "value"),
    )

    def describe(self) -> str:
        """Return a plain-English description of the expected outcome."""

        return f"The run must finish with outcome `{self.outcome}`."


class PredicateSet(_SchemaModel):
    """A logical combination of predicate AST nodes."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    kind: Literal["all_of", "any_of", "not"]
    predicates: list[Predicate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_arity(self) -> PredicateSet:
        """Ensure each logical operator has the appropriate number of terms."""

        if self.kind in {"all_of", "any_of"} and not self.predicates:
            raise ValueError(f"{self.kind} requires at least one predicate")
        if self.kind == "not" and len(self.predicates) != 1:
            raise ValueError("not requires exactly one predicate")
        return self

    @staticmethod
    def _items(
        predicates: tuple[Predicate | Sequence[Predicate], ...],
    ) -> list[Predicate]:
        """Accept either a sequence or variadic predicate arguments."""

        if (
            len(predicates) == 1
            and isinstance(predicates[0], Sequence)
            and not isinstance(predicates[0], str | bytes)
        ):
            return list(predicates[0])
        return list(predicates)  # type: ignore[arg-type]

    @classmethod
    def all_of(
        cls,
        *predicates: Predicate | Sequence[Predicate],
    ) -> PredicateSet:
        """Combine predicates that must all hold."""

        return cls(kind="all_of", predicates=cls._items(predicates))

    @classmethod
    def any_of(
        cls,
        *predicates: Predicate | Sequence[Predicate],
    ) -> PredicateSet:
        """Combine predicates where at least one must hold."""

        return cls(kind="any_of", predicates=cls._items(predicates))

    @classmethod
    def not_(cls, predicate: Predicate) -> PredicateSet:
        """Negate one predicate.

        ``not`` is a Python keyword, so the public Python spelling is
        ``PredicateSet.not_`` while the serialized AST kind remains ``not``.
        """

        return cls(kind="not", predicates=[predicate])

    def describe(self) -> str:
        """Return a plain-English description of this logical combination."""

        descriptions = [predicate.describe() for predicate in self.predicates]
        if self.kind == "not":
            return f"The following must not be true: {descriptions[0]}"
        joined = " ".join(descriptions)
        if self.kind == "all_of":
            return f"All of the following must be true: {joined}"
        return f"At least one of the following must be true: {joined}"


Predicate: TypeAlias = Annotated[
    CallShape | Ordering | TaintFlow | Outcome | PredicateSet,
    Field(discriminator="kind"),
]

PredicateSet.model_rebuild()


__all__ = [
    "CallShape",
    "Ordering",
    "Outcome",
    "Predicate",
    "PredicateSet",
    "TaintFlow",
]
