"""Structured proof and diagnostics returned by the admission court."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from grudge.predicates.compiler import PredicateResult
from grudge.schema.trace import Step


class AdmissionVerdict(BaseModel):
    """Admission succeeds only after every proof gate and persistence succeed."""

    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    admitted: bool
    reasons: list[str] = Field(default_factory=list)
    evidence: list[Step] = Field(default_factory=list)
    bad_results: list[PredicateResult] = Field(default_factory=list)
    good_results: list[PredicateResult] = Field(default_factory=list)
    control_results: list[PredicateResult] = Field(default_factory=list)
    empty_result: PredicateResult | None = None
    saved_path: Path | None = None


__all__ = ["AdmissionVerdict"]
