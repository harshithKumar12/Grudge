"""Phase 1 trace contracts for the recorder-to-shrinker pipeline.

The module defines the ordered, discriminated step language shared by later
pipeline stages.  JSONL is deliberately canonical: the first record carries
trace metadata and each following record is one step in the original order.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Any, Literal, Self, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from grudge.errors import SchemaError


class _SchemaModel(BaseModel):
    """Base model that exposes schema failures as Grudge errors."""

    model_config = ConfigDict(
        extra="allow",
        populate_by_name=True,
        validate_assignment=True,
    )

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


class _StepBase(_SchemaModel):
    """Fields shared by every trace step."""

    idx: int = Field(ge=0)
    ts: datetime
    run_id: str = Field(min_length=1)
    parent_idx: int | None = Field(default=None, ge=0)
    meta: dict[str, Any] = Field(default_factory=dict)


class ModelCall(_StepBase):
    """A model request or response observed during an agent run."""

    kind: Literal["model_call"] = "model_call"
    model: str | None = None
    messages: list[dict[str, Any]] | None = None
    prompt: str | None = None
    response: Any = None


class ToolCall(_StepBase):
    """A request for an external tool."""

    kind: Literal["tool_call"] = "tool_call"
    tool: str = Field(min_length=1)
    args: dict[str, Any]
    call_id: str = Field(min_length=1)


class ToolResult(_StepBase):
    """The result, or error, returned for a tool call."""

    kind: Literal["tool_result"] = "tool_result"
    call_id: str = Field(min_length=1)
    content: Any
    error: str | None = None


class StateDiff(_StepBase):
    """A structured change to the agent or world state."""

    kind: Literal["state_diff"] = "state_diff"
    diff: dict[str, Any] = Field(default_factory=dict)


class FinalAnswer(_StepBase):
    """The agent's terminal natural-language answer."""

    kind: Literal["final_answer"] = "final_answer"
    answer: str | None = None


Step: TypeAlias = Annotated[
    ModelCall | ToolCall | ToolResult | StateDiff | FinalAnswer,
    Field(discriminator="kind"),
]


class Trace(_SchemaModel):
    """An ordered run of an agent, suitable for stable JSONL persistence."""

    run_id: str = Field(min_length=1)
    agent_version: str = Field(min_length=1)
    task: str
    steps: list[Step] = Field(default_factory=list)
    outcome: Literal["ok", "failed"]

    @model_validator(mode="after")
    def _validate_step_identity(self) -> Self:
        indexes = [step.idx for step in self.steps]
        if len(indexes) != len(set(indexes)):
            raise ValueError("steps must have unique idx values")
        mismatched = [step.idx for step in self.steps if step.run_id != self.run_id]
        if mismatched:
            raise ValueError(
                f"step run_id must match trace run_id (idx values: {mismatched})"
            )
        return self

    def tool_calls(self) -> list[ToolCall]:
        """Return tool calls in their original trace order."""

        return [step for step in self.steps if isinstance(step, ToolCall)]

    def results_for(self, call_id: str) -> list[ToolResult]:
        """Return all results for ``call_id`` in their original trace order."""

        return [
            step
            for step in self.steps
            if isinstance(step, ToolResult) and step.call_id == call_id
        ]

    def slice(self, idxs: Iterable[int]) -> Trace:
        """Return a trace containing selected steps, preserving list order."""

        selected = set(idxs)
        return self.model_copy(
            update={"steps": [step for step in self.steps if step.idx in selected]}
        )

    def to_jsonl(self) -> str:
        """Serialize this trace to canonical metadata-plus-steps JSONL."""

        records: list[dict[str, Any]] = [
            {
                "type": "trace",
                "run_id": self.run_id,
                "agent_version": self.agent_version,
                "task": self.task,
                "outcome": self.outcome,
            }
        ]
        records.extend(step.model_dump(mode="json") for step in self.steps)
        return (
            "\n".join(
                json.dumps(
                    record,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                for record in records
            )
            + "\n"
        )

    @classmethod
    def from_jsonl(cls, payload: str) -> Trace:
        """Parse canonical JSONL and translate malformed input to ``SchemaError``."""

        try:
            if not isinstance(payload, str):
                raise SchemaError("trace JSONL must be text")
            lines = [line for line in payload.split("\n") if line.strip()]
            if not lines:
                raise SchemaError("trace JSONL is empty")
            header = json.loads(lines[0])
            if not isinstance(header, dict) or header.get("type") != "trace":
                raise SchemaError("trace JSONL must begin with a trace header")
            step_payloads = [json.loads(line) for line in lines[1:]]
            if not all(isinstance(step, dict) for step in step_payloads):
                raise SchemaError("each trace JSONL step must be an object")
            header.pop("type", None)
            return cls.model_validate({**header, "steps": step_payloads})
        except SchemaError:
            raise
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise SchemaError(f"invalid trace JSONL: {exc}") from exc


__all__ = [
    "FinalAnswer",
    "ModelCall",
    "StateDiff",
    "Step",
    "ToolCall",
    "ToolResult",
    "Trace",
]
