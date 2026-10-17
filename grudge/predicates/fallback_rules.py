"""Hand-verified behavioral rule for the file-exfiltration demo."""

from grudge.llm.client import DEMO_DSL
from grudge.predicates.dsl import PredicateAST, parse


def demo_rule() -> PredicateAST:
    """Detect data from a ``read_file`` result reaching ``send_http.body``."""

    return parse(DEMO_DSL)
