"""Ensure roadmap placeholders import cleanly and fail only on invocation."""

from collections.abc import Callable

import pytest

from grudge.fuzzer.fingerprint_guard import preserve_fingerprint
from grudge.fuzzer.mutators import mutate
from grudge.gate.selector import select_scars
from grudge.integrations.github_comment import publish_github_comment
from grudge.integrations.pytest_plugin import install_pytest_plugin
from grudge.locator.fork import fork_run
from grudge.locator.point_of_no_return import find_point_of_no_return
from grudge.predicates.outcome import check_outcome
from grudge.recorder.adapters.langgraph import record_langgraph
from grudge.recorder.adapters.mcp_proxy import record_mcp_proxy
from grudge.registry.db import open_registry
from grudge.registry.fingerprint import fingerprint
from grudge.registry.flakiness import score_flakiness
from grudge.registry.retirement import retire


@pytest.mark.parametrize(
    ("stub", "item"),
    [
        (fork_run, "locator.fork"),
        (find_point_of_no_return, "locator.point_of_no_return"),
        (mutate, "fuzzer.mutators"),
        (preserve_fingerprint, "fuzzer.fingerprint_guard"),
        (open_registry, "registry.db"),
        (fingerprint, "registry.fingerprint"),
        (score_flakiness, "registry.flakiness"),
        (retire, "registry.retirement"),
        (select_scars, "gate.selector"),
        (install_pytest_plugin, "integrations.pytest_plugin"),
        (publish_github_comment, "integrations.github_comment"),
        (check_outcome, "predicates.outcome"),
        (record_mcp_proxy, "recorder.adapters.mcp_proxy"),
        (record_langgraph, "recorder.adapters.langgraph"),
    ],
)
def test_stretch_stub_raises_only_when_called(
    stub: Callable[[], object], item: str
) -> None:
    with pytest.raises(NotImplementedError, match=f"^roadmap: {item}$"):
        stub()
