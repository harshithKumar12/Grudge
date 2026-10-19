"""Static integration checks for the dependency-free Phase 11 viewer."""

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VIEWER_ROOT = REPO_ROOT / "viewer"

COMPONENTS = {
    "timeline.js": "mountTimeline",
    "shrink_animation.js": "mountShrinkAnimation",
    "predicate_card.js": "mountPredicateCard",
    "gate_panel.js": "mountGatePanel",
    "pr_comment.js": "mountPrComment",
    "scar_browser.js": "mountScarBrowser",
}

CORE_EVENT_TYPES = (
    "demo.started",
    "beat.started",
    "trace.step",
    "trace.outcome",
    "shrink.started",
    "shrink.attempt",
    "shrink.done",
    "predicate.synthesized",
    "admission.result",
    "gate.result",
    "regression.detected",
    "demo.finished",
)


def _read(relative: str) -> str:
    """Read a viewer asset as UTF-8 text."""

    return (VIEWER_ROOT / relative).read_text(encoding="utf-8")


def test_index_references_every_component_module() -> None:
    """The index's module entry point imports every required component."""

    index = _read("index.html")
    app = _read("app.js")
    script_sources = re.findall(r'<script[^>]+src=["\']([^"\']+)', index)

    assert "app.js" in script_sources
    for module in COMPONENTS:
        assert f'"./components/{module}"' in app
        assert (VIEWER_ROOT / "components" / module).is_file()


def test_each_component_exports_its_mount_function() -> None:
    """Each statically imported component exposes the mount API used by app.js."""

    for module, mount_function in COMPONENTS.items():
        source = _read(f"components/{module}")
        assert re.search(
            rf"\bexport\s+function\s+{re.escape(mount_function)}\s*\(",
            source,
        )


def test_app_contains_stream_reconnect_replay_and_pause_behaviors() -> None:
    """The app stays useful while disconnected and supports presenter controls."""

    app = _read("app.js")

    assert "new EventSource(" in app
    assert "source.onerror" in app
    assert "Disconnected · retrying" in app
    assert 'fetch("/restart", { method: "POST" })' in app
    assert "function setPaused(" in app
    assert "buffered" in app
    assert 'event.code !== "Space"' in app


def test_viewer_has_no_external_cdn_or_dependency_references() -> None:
    """All viewer assets and imports remain local to the static directory."""

    assets = sorted(
        path
        for path in VIEWER_ROOT.rglob("*")
        if path.is_file() and path.suffix in {".html", ".js", ".css"}
    )
    external_url = re.compile(r"https?://|//cdn\.|//unpkg\.|//jsdelivr\.", re.I)
    import_specifier = re.compile(r"\bimport(?:[^\"']*from\s*)?[\"']([^\"']+)[\"']")

    for asset in assets:
        source = asset.read_text(encoding="utf-8")
        assert not external_url.search(source), asset.relative_to(REPO_ROOT)
        for specifier in import_specifier.findall(source):
            assert specifier.startswith("."), (
                asset.relative_to(REPO_ROOT),
                specifier,
            )


def test_core_event_types_are_covered_by_the_viewer() -> None:
    """Every Phase 10 event discriminator is handled or subscribed to in JS."""

    javascript = "\n".join(
        path.read_text(encoding="utf-8") for path in VIEWER_ROOT.rglob("*.js")
    )

    missing = [
        event_type for event_type in CORE_EVENT_TYPES if event_type not in javascript
    ]
    assert not missing, f"viewer is missing event types: {missing}"
