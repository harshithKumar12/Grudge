"""Phase 1 Scar contracts and persistence for admitted regression failures."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, TypeAlias

from pydantic import ConfigDict, Field

from grudge.errors import SchemaError
from grudge.schema.cassette import Cassette, _SchemaModel
from grudge.schema.predicate import Predicate


class AdmissionRecord(_SchemaModel):
    """The admission evidence recorded alongside a Scar."""

    model_config = ConfigDict(
        extra="allow",
        populate_by_name=True,
        validate_assignment=True,
    )

    admitted: bool
    reasons: list[str] = Field(default_factory=list)
    bad_runs: int = Field(default=0, ge=0)
    good_runs: int = Field(default=0, ge=0)
    checked_at: datetime | None = None


SeedPredicate: TypeAlias = Predicate | str


class Scar(_SchemaModel):
    """A cassette, behavioural predicate, and provenance metadata."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )

    id: str = Field(min_length=1)
    cassette: Cassette
    predicate: Predicate
    seed_predicate: SeedPredicate
    source_trace_hash: str = Field(min_length=1)
    agent_version_failed: str = Field(min_length=1)
    agent_version_fixed: str = Field(min_length=1)
    created_at: datetime
    admission: AdmissionRecord | None = None
    fingerprint: str = Field(min_length=1)

    @staticmethod
    def _check_path(path: str | Path) -> Path:
        """Validate and normalize the required Scar filename convention."""

        target = Path(path)
        if target.name.endswith(".scar.json") is False:
            raise SchemaError("Scar files must use the *.scar.json filename suffix")
        return target

    def write(self, path: str | Path) -> Path:
        """Write this Scar as canonical, human-readable JSON."""

        target = self._check_path(path)
        try:
            target.write_text(
                self.model_dump_json(indent=2) + "\n",
                encoding="utf-8",
            )
        except OSError as exc:
            raise SchemaError(f"could not write Scar file {target}: {exc}") from exc
        return target

    def save(self, path: str | Path) -> Path:
        """Alias for :meth:`write` used by callers that prefer persistence verbs."""

        return self.write(path)

    def to_file(self, path: str | Path) -> Path:
        """Alias for :meth:`write`."""

        return self.write(path)

    @classmethod
    def read(cls, path: str | Path) -> Scar:
        """Read and validate a ``*.scar.json`` file."""

        target = cls._check_path(path)
        try:
            payload = target.read_text(encoding="utf-8")
            data: Any = json.loads(payload)
        except (OSError, json.JSONDecodeError, UnicodeError) as exc:
            raise SchemaError(f"could not read Scar file {target}: {exc}") from exc
        return cls.model_validate(data)

    @classmethod
    def load(cls, path: str | Path) -> Scar:
        """Alias for :meth:`read`."""

        return cls.read(path)

    @classmethod
    def from_file(cls, path: str | Path) -> Scar:
        """Alias for :meth:`read` for explicit file-oriented call sites."""

        return cls.read(path)


__all__ = ["AdmissionRecord", "Scar", "SeedPredicate"]
