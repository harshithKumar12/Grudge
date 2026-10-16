"""Property tests for stable trace JSONL round trips."""

from datetime import UTC, datetime

from hypothesis import given
from hypothesis import strategies as st

from grudge.schema import ToolCall, Trace


@given(
    st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=10_000),
            st.text(min_size=1, max_size=16),
        ),
        unique_by=lambda value: value[0],
        max_size=12,
    )
)
def test_trace_jsonl_round_trip_preserves_arbitrary_tool_steps(
    entries: list[tuple[int, str]],
) -> None:
    """Canonical JSONL preserves generated order, values, and metadata."""
    trace = Trace(
        run_id="hypothesis-run",
        agent_version="agent-1",
        task="property test",
        outcome="ok",
        steps=[
            ToolCall(
                idx=idx,
                ts=datetime(2026, 1, 1, tzinfo=UTC),
                run_id="hypothesis-run",
                tool="echo",
                args={"value": value},
                call_id=f"call-{idx}",
            )
            for idx, value in entries
        ],
    )

    restored = Trace.from_jsonl(trace.to_jsonl())

    assert restored.model_dump(mode="json") == trace.model_dump(mode="json")
