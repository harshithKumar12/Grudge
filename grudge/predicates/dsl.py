"""Phase 6 readable predicate parser and canonical printer, with no execution.

Call arguments are exact JSON values or one-key operator objects ($eq,
$contains, $under, $not_under). FilteredTaintFlow adds persisted source filters
to the shared predicate schema. Groups combine rules that must
hold: all_of requires all, any_of requires one, and not negates one.
"""

from __future__ import annotations

import json
import re
from typing import Any, TypeAlias

from grudge.errors import PredicateParseError as _PredicateParseError
from grudge.schema.predicate import (
    CallShape,
    Ordering,
    Outcome,
    Predicate,
    PredicateSet,
    TaintFlow,
)
from grudge.schema.predicate import FilteredTaintFlow as FilteredTaintFlow


class PredicateParseError(_PredicateParseError):
    """A source-located DSL error, also catchable via grudge.errors."""

    def __init__(self, source: str, offset: int, message: str, hint: str) -> None:
        self.line = source.count("\n", 0, offset) + 1
        self.column = offset - source.rfind("\n", 0, offset)
        self.hint = hint
        super().__init__(
            f"line {self.line}, column {self.column}: {message}. Hint: {hint}"
        )


PredicateAST: TypeAlias = Predicate
PredicateGroup = PredicateSet

_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_.-]*")
_OPERATORS = {"$eq", "$contains", "$under", "$not_under"}


class _Parser:
    def __init__(self, source: str) -> None:
        self.source = source
        self.pos = 0

    def skip(self) -> None:
        while self.pos < len(self.source) and self.source[self.pos].isspace():
            self.pos += 1

    def error(self, message: str, hint: str) -> PredicateParseError:
        self.skip()
        return PredicateParseError(self.source, self.pos, message, hint)

    def take(self, text: str) -> bool:
        self.skip()
        end = self.pos + len(text)
        if not self.source.startswith(text, self.pos):
            return False
        if text[-1].isalnum() and end < len(self.source):
            if self.source[end].isalnum() or self.source[end] in "_.-":
                return False
        self.pos = end
        return True

    def expect(self, text: str) -> None:
        if not self.take(text):
            raise self.error(f"expected {text!r}", f"insert {text!r} here")

    def name(self) -> str:
        self.skip()
        if self.source.startswith('"', self.pos):
            value = self.value()
            if isinstance(value, str) and value:
                return value
        else:
            match = _NAME.match(self.source, self.pos)
            if match is not None:
                self.pos = match.end()
                return match.group()
        raise self.error("expected a name", "use a tool/argument name or JSON string")

    def value(self) -> Any:
        self.skip()
        offset = self.pos
        try:
            value, end = json.JSONDecoder().raw_decode(self.source, self.pos)
        except json.JSONDecodeError as exc:
            raise PredicateParseError(
                self.source,
                exc.pos,
                "expected a JSON value",
                'quote text with double quotes, e.g. "workspace/"',
            ) from exc
        try:
            json.dumps(value, allow_nan=False)
        except ValueError as exc:
            raise PredicateParseError(
                self.source,
                offset,
                "non-finite JSON number",
                "use finite numbers instead of NaN or infinity",
            ) from exc
        self.pos = end
        return value

    def condition(self, field: str) -> tuple[str, Any]:
        if self.take("~"):
            operator = "$contains"
        elif self.take("not"):
            self.expect("under")
            operator = "$not_under"
        elif self.take("under"):
            operator = "$under"
        elif self.take("="):
            value = self.value()
            if isinstance(value, dict) and any(k.startswith("$") for k in value):
                return field, {"$eq": value}
            return field, value
        else:
            raise self.error(
                "expected an argument operator", "use =, ~, under, or not under"
            )
        self.skip()
        offset = self.pos
        value = self.value()
        if not isinstance(value, str) or (
            operator in {"$under", "$not_under"} and not value
        ):
            raise PredicateParseError(
                self.source, offset, "operator requires text", "use a JSON string"
            )
        return field, {operator: value}

    def arguments(self, first: str | None = None) -> dict[str, Any]:
        field, value = self.condition(first if first is not None else self.name())
        arguments = {field: value}
        while self.take("and"):
            self.skip()
            offset = self.pos
            field = self.name()
            if field in arguments:
                raise PredicateParseError(
                    self.source,
                    offset,
                    "duplicate argument",
                    "use each argument only once",
                )
            arguments.update([self.condition(field)])
        return arguments

    def rule(self) -> PredicateAST:
        for kind in ("all_of", "any_of", "not"):
            if self.take(kind):
                self.expect("(")
                items = [self.rule()]
                while self.take(";"):
                    items.append(self.rule())
                self.expect(")")
                if kind == "not" and len(items) != 1:
                    raise self.error("not takes one rule", "remove extra rules")
                return PredicateSet(kind=kind, predicates=items)
        if self.take("never"):
            if self.take("flow"):
                source = self.name()
                source_field = self.name() if self.take("field") else None
                self.expect("to")
                sink = self.name()
                sink_field = self.name() if self.take("field") else None
                return TaintFlow(
                    source=source,
                    sink=sink,
                    source_field=source_field,
                    sink_field=sink_field,
                )
            self.expect("call")
            tool = self.name()
            if not self.take("where"):
                return PredicateSet.not_(CallShape(tool=tool))
            field = self.name()
            if self.take("tainted_by"):
                source = self.name()
                self.expect("(")
                args = {} if self.take(")") else self.arguments()
                if args:
                    self.expect(")")
                return FilteredTaintFlow(
                    flow=TaintFlow(source=source, sink=tool, sink_field=field),
                    source_args=args,
                )
            return PredicateSet.not_(
                CallShape(tool=tool, args=self.arguments(first=field))
            )
        if self.take("must"):
            if self.take("finish"):
                if self.take("ok"):
                    return Outcome(outcome="ok")
                if self.take("failed"):
                    return Outcome(outcome="failed")
                raise self.error("unknown outcome", "use ok or failed")
            self.expect("call")
            tool = self.name()
            if self.take("before"):
                self.expect("call")
                return Ordering(before=tool, after=self.name())
            args = self.arguments() if self.take("where") else {}
            return CallShape(tool=tool, args=args)
        raise self.error(
            "expected a predicate", "start with 'never call' or 'must call'"
        )


def parse_predicate(source: str) -> PredicateAST:
    """Parse one rule; all malformed source raises a located PredicateParseError."""
    if not isinstance(source, str):
        raise TypeError("predicate source must be text")
    parser = _Parser(source)
    predicate = parser.rule()
    parser.skip()
    if parser.pos != len(source):
        raise parser.error("unexpected trailing input", "end the rule here")
    return predicate


def _name(value: str) -> str:
    return value if _NAME.fullmatch(value) else json.dumps(value, ensure_ascii=False)


def _arguments(arguments: dict[str, Any]) -> str:
    parts: list[str] = []
    symbols = {
        "$eq": "=",
        "$contains": "~",
        "$under": "under",
        "$not_under": "not under",
    }
    for field, value in sorted(arguments.items()):
        operator = "="
        if isinstance(value, dict) and len(value) == 1:
            key = next(iter(value))
            if key in _OPERATORS:
                operator, value = symbols[key], value[key]
        parts.append(
            f"{_name(field)} {operator} "
            + json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)
        )
    return " and ".join(parts)


def pretty_print(predicate: PredicateAST) -> str:
    """Produce canonical parseable DSL for schema predicates and DSL wrappers."""
    if isinstance(predicate, CallShape):
        suffix = f" where {_arguments(predicate.args)}" if predicate.args else ""
        return f"must call {_name(predicate.tool)}{suffix}"
    if isinstance(predicate, Ordering):
        return (
            f"must call {_name(predicate.before)} before call {_name(predicate.after)}"
        )
    if isinstance(predicate, FilteredTaintFlow):
        flow = predicate.flow
        if flow.source_field is not None or flow.sink_field is None:
            raise TypeError("filtered taint DSL requires a sink field and whole result")
        return (
            f"never call {_name(flow.sink)} where {_name(flow.sink_field)} "
            f"tainted_by {_name(flow.source)}({_arguments(predicate.source_args)})"
        )
    if isinstance(predicate, TaintFlow):
        source = _name(predicate.source)
        sink = _name(predicate.sink)
        if predicate.source_field is not None:
            source += f" field {_name(predicate.source_field)}"
        if predicate.sink_field is not None:
            sink += f" field {_name(predicate.sink_field)}"
        return f"never flow {source} to {sink}"
    if isinstance(predicate, Outcome):
        return f"must finish {predicate.outcome}"
    if isinstance(predicate, PredicateSet | PredicateGroup):
        if (
            isinstance(predicate, PredicateSet)
            and predicate.kind == "not"
            and len(predicate.predicates) == 1
        ):
            child = predicate.predicates[0]
            if isinstance(child, CallShape):
                return pretty_print(child).replace("must call", "never call", 1)
        children = "; ".join(pretty_print(p) for p in predicate.predicates)
        return f"{predicate.kind}({children})"
    raise TypeError(f"unsupported predicate: {type(predicate).__name__}")


parse = parse_predicate
