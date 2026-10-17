"""Small, dependency-free redaction helpers for recorded trace values."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import TypeVar, cast


@dataclass(frozen=True, slots=True)
class RedactionRule:
    """A regular expression and replacement used by :func:`redact_text`."""

    pattern: str | re.Pattern[str]
    replacement: str = "[REDACTED]"
    flags: int = 0

    def compiled(self) -> re.Pattern[str]:
        """Return the rule's compiled regular expression."""
        if isinstance(self.pattern, str):
            return re.compile(self.pattern, self.flags)
        if self.flags:
            raise ValueError("flags cannot be used with a compiled pattern")
        return self.pattern


DEFAULT_REDACTION_RULES: tuple[RedactionRule, ...] = (
    RedactionRule(r"\bFAKE_KEY_[A-Za-z0-9_-]+\b"),
    RedactionRule(r"\b(?:sk-ant-|sk-)[A-Za-z0-9_-]{12,}\b"),
    RedactionRule(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    RedactionRule(r"\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{20,}\b"),
    RedactionRule(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
    RedactionRule(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    RedactionRule(
        r"(?i)\b(?:api[_-]?key|access[_-]?token|secret|token|password)"
        r"(\s*[:=]\s*)['\"]?[A-Za-z0-9_./+=-]{8,}['\"]?",
        replacement=r"\1[REDACTED]",
    ),
)

# A short alias keeps the public rule list convenient to discover.
DEFAULT_RULES = DEFAULT_REDACTION_RULES

_T = TypeVar("_T")
_RuleLike = RedactionRule | str | re.Pattern[str]


def _as_rule(rule: _RuleLike) -> RedactionRule:
    """Normalize a shorthand regex into a standard redaction rule."""
    if isinstance(rule, RedactionRule):
        return rule
    return RedactionRule(rule)


def redact_text(
    text: str,
    *,
    rules: Sequence[_RuleLike] | None = None,
    enabled: bool = True,
) -> str:
    """Redact key-like substrings in ``text`` using rules in list order.

    Passing ``enabled=False`` is an intentional no-op for tests that need to
    inspect the original trace.  Passing an empty rule sequence also disables
    the default rules while leaving redaction enabled.
    """
    if not enabled:
        return text

    selected_rules = DEFAULT_REDACTION_RULES if rules is None else rules
    redacted = text
    for rule in selected_rules:
        normalized = _as_rule(rule)
        redacted = normalized.compiled().sub(normalized.replacement, redacted)
    return redacted


def redact_trace(
    trace: _T,
    *,
    rules: Sequence[_RuleLike] | None = None,
    enabled: bool = True,
) -> _T:
    """Return ``trace`` with string values redacted recursively.

    Mappings, lists, and tuples are copied so the supplied trace is not
    mutated.  Other values pass through unchanged.  With ``enabled=False``
    the original object is returned untouched.
    """
    if not enabled:
        return trace

    def redact_value(value: object) -> object:
        if isinstance(value, str):
            return redact_text(value, rules=rules)
        if isinstance(value, Mapping):
            return {key: redact_value(item) for key, item in value.items()}
        if isinstance(value, list):
            return [redact_value(item) for item in value]
        if isinstance(value, tuple):
            return tuple(redact_value(item) for item in value)
        return value

    return cast(_T, redact_value(trace))
