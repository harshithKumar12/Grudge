"""Exception hierarchy for errors crossing Grudge pipeline boundaries."""


class GrudgeError(Exception):
    """Base class for expected Grudge failures."""


class SchemaError(GrudgeError):
    """A trace, cassette, predicate, or scar does not match its contract."""


class OracleError(GrudgeError):
    """The failure-reproduction oracle could not evaluate a candidate."""


class PredicateParseError(GrudgeError):
    """A predicate source string cannot be parsed."""


class AdmissionRejected(GrudgeError):
    """A candidate scar did not prove red-on-bad and green-on-good."""


class ReplayMismatch(GrudgeError):
    """An agent requested a response absent from a cassette."""
