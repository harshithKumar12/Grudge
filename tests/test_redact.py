"""Focused tests for Phase 3 recorder redaction."""

from __future__ import annotations

from grudge.recorder.redact import RedactionRule, redact_text, redact_trace

FAKE_PHASE_2_KEY = "FAKE_KEY_sk_demo_phase2"


def test_default_rules_mask_the_phase_2_fake_key() -> None:
    """The deterministic Phase 2 fixture secret cannot appear in output."""

    redacted = redact_text(f"tool output: {FAKE_PHASE_2_KEY}")

    assert FAKE_PHASE_2_KEY not in redacted
    assert "[REDACTED]" in redacted


def test_rules_are_pluggable_and_applied_in_order() -> None:
    """Callers can replace defaults with their own regex rule list."""

    rules = [
        RedactionRule(r"customer-[0-9]+", "<customer>"),
        RedactionRule(r"<customer>", "<redacted-customer>"),
    ]

    assert redact_text("customer-42", rules=rules) == "<redacted-customer>"
    assert redact_text(FAKE_PHASE_2_KEY, rules=rules) == FAKE_PHASE_2_KEY


def test_disabled_mode_is_a_no_op() -> None:
    """Tests can inspect an unchanged value by disabling redaction."""

    original = f"secret={FAKE_PHASE_2_KEY}"

    assert redact_text(original, enabled=False) == original
    assert redact_trace({"body": original}, enabled=False) == {"body": original}


def test_trace_values_are_redacted_without_mutating_the_input() -> None:
    """Nested string values are copied and redacted across trace containers."""

    trace = {
        "body": FAKE_PHASE_2_KEY,
        "steps": ["safe", {"value": FAKE_PHASE_2_KEY}],
        "metadata": (FAKE_PHASE_2_KEY,),
    }

    redacted = redact_trace(trace)

    assert trace["body"] == FAKE_PHASE_2_KEY
    assert redacted == {
        "body": "[REDACTED]",
        "steps": ["safe", {"value": "[REDACTED]"}],
        "metadata": ("[REDACTED]",),
    }
