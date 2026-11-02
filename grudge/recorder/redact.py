"""Small, dependency-free redaction helpers for recorded trace values."""

from __future__ import annotations

import json
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
    # Order mirrors packages/grudge/src/core/redact.js so both runtimes store
    # the same text for the same input.
    RedactionRule(
        r"-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----",
        replacement="[REDACTED PRIVATE KEY]",
    ),
    # `Authorization: Bearer <token>` is separated from its label by a scheme
    # word, so the labelled-value rule below cannot see it.
    RedactionRule(
        r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}",
        replacement="Bearer [REDACTED]",
    ),
    # The separator is re-emitted unchanged, so `api_key=value` stays an
    # assignment and `?api_key=value&next=1` stays a valid query string. The
    # value may be quoted; `?`, `&`, and brackets end it.
    RedactionRule(
        r"(?i)\b((?:api[_ -]?key|access[_ -]?key|access[_ -]?token"
        r"|refresh[_ -]?token|client[_ -]?secret|secret|token|password|passwd"
        r"|authorization|cookie|set-cookie))\b(\s*[:=]\s*)(['\"]?)"
        r"([^\s\"'`,;}?&\[\]]{8,})\3",
        replacement=r"\1\2[REDACTED]",
    ),
    RedactionRule(
        r"\b([A-Z][A-Z0-9_]{2,})(\s*=\s*)([^\s,;)}\[\]]+)",
        replacement=r"\1\2[REDACTED]",
    ),
    RedactionRule(
        r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b", replacement="[REDACTED KEY]"
    ),
    RedactionRule(
        r"\b(?:sk|pk|rk|ghp|gho|ghs|ghr|github_pat|xox[baprs])"
        r"[-_][A-Za-z0-9][A-Za-z0-9_.\-]{10,}\b",
        replacement="[REDACTED KEY]",
    ),
    RedactionRule(
        r"\b(?:FAKE_)?KEY_[A-Za-z0-9][A-Za-z0-9_.\-]{8,}\b",
        replacement="[REDACTED KEY]",
    ),
)

# A short alias keeps the public rule list convenient to discover.
DEFAULT_RULES = DEFAULT_REDACTION_RULES

# Keys whose value is a credential regardless of its shape. Matching is on
# whole underscore-separated segments after camelCase normalization, so
# `db_password`, `x-api-key`, `apiKey`, and `set-cookie` match while
# `keyboard` and `monkey` do not.
SENSITIVE_KEY_PATTERN = re.compile(
    r"(?:^|_)(?:password|passwd|passphrase|secret|token|api_?key|apikey"
    r"|client_?secret|authorization|cookie|set_?cookie|access_?token"
    r"|refresh_?token|access_?key|secret_?key|private_?key|credential"
    r"|credentials)(?:_|$)"
)

_CAMEL_BOUNDARY = re.compile(r"([a-z0-9])([A-Z])")
_KEY_SEPARATORS = re.compile(r"[\s.\-]+")

_T = TypeVar("_T")
_RuleLike = RedactionRule | str | re.Pattern[str]


def _as_rule(rule: _RuleLike) -> RedactionRule:
    """Normalize a shorthand regex into a standard redaction rule."""
    if isinstance(rule, RedactionRule):
        return rule
    return RedactionRule(rule)


def normalize_key(key: object) -> str:
    """Normalize a structured key for sensitive-key matching."""

    text = _CAMEL_BOUNDARY.sub(r"\1_\2", str(key))
    return _KEY_SEPARATORS.sub("_", text).lower()


def is_sensitive_key(key: object) -> bool:
    """Return whether a structured field name names a credential."""

    normalized = normalize_key(key)
    return bool(normalized) and SENSITIVE_KEY_PATTERN.search(normalized) is not None


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
    """Return ``trace`` with secret fields and string values redacted recursively.

    A value stored under a sensitive key (``password``, ``api_key``,
    ``auth.token``, ``set-cookie``, ...) is replaced wholesale at any depth and
    never reaches the sink. Other strings are scanned with :func:`redact_text`.

    Mappings, lists, and tuples are copied so the supplied trace is not
    mutated.  Other values pass through unchanged.  With ``enabled=False``
    the original object is returned untouched.
    """
    if not enabled:
        return trace

    def redact_value(value: object, key: object = None) -> object:
        if key is not None and is_sensitive_key(key):
            return None if value is None else "[REDACTED]"
        if isinstance(value, str):
            return redact_text(value, rules=rules)
        if isinstance(value, Mapping):
            return {
                item_key: redact_value(item, item_key)
                for item_key, item in value.items()
            }
        if isinstance(value, list):
            return [redact_value(item) for item in value]
        if isinstance(value, tuple):
            return tuple(redact_value(item) for item in value)
        return value

    return cast(_T, redact_value(trace))


def redact_jsonl(
    payload: str,
    *,
    rules: Sequence[_RuleLike] | None = None,
    enabled: bool = True,
) -> str:
    """Redact each JSON object line of a canonical JSONL document.

    A line that is not valid JSON is preserved unchanged: a redactor must never
    turn a readable artifact into a corrupt one.
    """
    if not enabled:
        return payload
    lines: list[str] = []
    for line in payload.split("\n"):
        if not line.strip():
            lines.append(line)
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            lines.append(line)
            continue
        redacted = redact_trace(value, rules=rules)
        lines.append(
            json.dumps(
                redacted, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
        )
    return "\n".join(lines)


__all__ = [
    "DEFAULT_REDACTION_RULES",
    "DEFAULT_RULES",
    "SENSITIVE_KEY_PATTERN",
    "RedactionRule",
    "is_sensitive_key",
    "normalize_key",
    "redact_jsonl",
    "redact_text",
    "redact_trace",
]
