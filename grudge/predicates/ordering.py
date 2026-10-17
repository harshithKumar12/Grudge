"""Phase 6 ordering rules use trace list order, never timestamps or idx sorting.

Every target call requires an earlier prerequisite call. No target is vacuously
safe. The prerequisite is a call, not a successful result or a consumable token.
"""

from dataclasses import dataclass

from grudge.predicates.compiler import PredicateResult
from grudge.schema.predicate import Ordering
from grudge.schema.trace import Step, Trace


@dataclass(frozen=True)
class OrderingChecker:
    predicate: Ordering

    def check(self, trace: Trace) -> PredicateResult:
        prior = False
        evidence: list[Step] = []
        for call in trace.tool_calls():
            if call.tool == self.predicate.after and not prior:
                evidence.append(call)
            if call.tool == self.predicate.before:
                prior = True
        return PredicateResult(
            violated=bool(evidence),
            evidence=evidence,
            explanation=(
                f"{len(evidence)} call(s) to {self.predicate.after} lacked an earlier "
                f"call to {self.predicate.before}."
            ),
        )
