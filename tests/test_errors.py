"""Focused tests for the public Phase 0 exception hierarchy."""

from grudge.errors import (
    AdmissionRejected,
    GrudgeError,
    OracleError,
    PredicateParseError,
    ReplayMismatch,
    SchemaError,
)


def test_all_domain_errors_inherit_from_grudge_error() -> None:
    for error_type in (
        SchemaError,
        OracleError,
        PredicateParseError,
        AdmissionRejected,
        ReplayMismatch,
    ):
        assert issubclass(error_type, GrudgeError)
        assert issubclass(error_type, Exception)
