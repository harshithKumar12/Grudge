"""Readable Phase 6 DSL grammar, source diagnostics and canonical round trips."""

from __future__ import annotations

import pytest
from pydantic import TypeAdapter

from grudge.errors import PredicateParseError as DomainParseError
from grudge.predicates.dsl import (
    FilteredTaintFlow,
    PredicateParseError,
    parse_predicate,
    pretty_print,
)
from grudge.schema.predicate import (
    CallShape,
    Ordering,
    Outcome,
    Predicate,
    PredicateSet,
    TaintFlow,
)


@pytest.mark.parametrize(
    "source",
    [
        'never call send_http where body tainted_by read_file(path ~ "keys")',
        "must call verify_user before call transfer_funds",
        'never call delete_file where path not under "workspace/"',
        'must call read_file where path under "workspace/"',
        "never call send_http where body tainted_by read_file()",
        'must call send_http where body = {"items": [null, true, 2.5]}',
        'must call "tool with spaces" where "odd field" = "line\\nquote\\""',
        'must call save where document = {"$contains": "literal"}',
        'never call send_http where url ~ "invalid" and body = "secret"',
        "never flow read_file to send_http",
        "never flow read_file field content to send_http field body",
        "must finish ok",
        "must finish failed",
        "all_of(never call erase; any_of(must call verify; never call send))",
        "not(must call send)",
        'all_of(never call send where body tainted_by read(path ~ "keys"); '
        "must call verify)",
    ],
)
def test_dsl_round_trip(source: str) -> None:
    predicate = parse_predicate(source)
    rendered = pretty_print(predicate)
    restored = parse_predicate(rendered)
    assert restored == predicate
    assert pretty_print(restored) == rendered
    assert predicate.describe()


def test_parser_preserves_schema_and_filtered_taint_details() -> None:
    assert parse_predicate(
        "must call verify_user before call transfer_funds"
    ) == Ordering(before="verify_user", after="transfer_funds")
    assert parse_predicate('never call erase where path not under "workspace/"') == (
        PredicateSet.not_(
            CallShape(tool="erase", args={"path": {"$not_under": "workspace/"}})
        )
    )
    flow = parse_predicate(
        'never call send_http where body tainted_by read_file(path ~ "keys")'
    )
    assert isinstance(flow, FilteredTaintFlow)
    assert flow.flow == TaintFlow(
        source="read_file", sink="send_http", sink_field="body"
    )
    assert flow.source_args == {"path": {"$contains": "keys"}}


def test_canonical_spacing_argument_order_and_unicode() -> None:
    predicate = parse_predicate(
        '  must  call send_http\nwhere z = "café" and a = true  '
    )
    assert (
        pretty_print(predicate) == 'must call send_http where a = true and z = "café"'
    )


@pytest.mark.parametrize(
    ("source", "line", "column", "hint"),
    [
        ("", 1, 1, "start with"),
        ("never send_http", 1, 7, "insert 'call'"),
        ("must call verify before transfer", 1, 25, "insert 'call'"),
        (
            'never call delete_file\nwhere path not "workspace/"',
            2,
            16,
            "insert 'under'",
        ),
        ("never call delete_file where path under workspace", 1, 41, "double quotes"),
        ("never call delete_file where path under 12", 1, 41, "JSON string"),
        ('never call read_file where path ~ "keys', 1, 35, "double quotes"),
        ("never call send_http trailing", 1, 22, "end the rule"),
        ("all_of()", 1, 8, "start with"),
        ("not(must call a; must call b)", 1, 30, "remove extra"),
        ("must finish unknown", 1, 13, "ok or failed"),
        ("never call delete where path = 1 and path = 2", 1, 38, "only once"),
        ("must call x where v = NaN", 1, 23, "finite numbers"),
        ("must call x where v = 1e999", 1, 23, "finite numbers"),
    ],
)
def test_parse_errors_have_location_and_hint(
    source: str, line: int, column: int, hint: str
) -> None:
    with pytest.raises(PredicateParseError) as error:
        parse_predicate(source)
    assert isinstance(error.value, DomainParseError)
    assert (error.value.line, error.value.column) == (line, column)
    assert hint in error.value.hint
    assert f"line {line}, column {column}" in str(error.value)


@pytest.mark.parametrize(
    "predicate",
    [
        CallShape(tool="read", args={"path": "keys"}),
        PredicateSet.not_(CallShape(tool="erase")),
        Ordering(before="verify", after="transfer"),
        TaintFlow(source="read", sink="send", source_field="text", sink_field="body"),
        Outcome(outcome="ok"),
    ],
)
def test_schema_nodes_pretty_print_to_equivalent_nodes(
    predicate: CallShape | PredicateSet | Ordering | TaintFlow | Outcome,
) -> None:
    assert parse_predicate(pretty_print(predicate)) == predicate


@pytest.mark.parametrize(
    "source",
    [
        'never call send_http where body tainted_by read_file(path ~ "keys")',
        "all_of(never call send_http where body tainted_by read_file(); "
        "must call verify_user before call transfer_funds)",
    ],
)
def test_dsl_ast_round_trips_through_shared_predicate_schema(source: str) -> None:
    predicate = parse_predicate(source)
    adapter: TypeAdapter[Predicate] = TypeAdapter(Predicate)

    restored = adapter.validate_json(adapter.dump_json(predicate))

    assert restored == predicate
    assert pretty_print(restored) == pretty_print(predicate)
