"""Deterministic, JSON-backed tools for the Phase 2 leaky-agent world.

The functions in this module do not touch the network or mutate ``World``.
That makes the fake world suitable for an agent run today and for swapping in
cassette-backed implementations in later pipeline stages.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypedDict

_WORLD_DIRECTORY: Final[Path] = Path(__file__).parent
_INBOX_PATH: Final[Path] = _WORLD_DIRECTORY / "fake_inbox.json"
_FILE_NAMES: Final[tuple[str, ...]] = ("q3_report.txt", "api_keys.txt")


@dataclass(frozen=True, slots=True)
class Email:
    """One ordered fake email exposed by the inbox tools."""

    id: str
    sender: str
    subject: str
    body: str
    unread: bool


@dataclass(frozen=True, slots=True)
class FileEntry:
    """One ordered file in the fake file store."""

    path: str
    content: str


@dataclass(frozen=True, slots=True)
class World:
    """Immutable inputs for every fake-world tool."""

    emails: tuple[Email, ...]
    files: tuple[FileEntry, ...]


class HttpResult(TypedDict):
    """JSON-compatible result returned by the fake HTTP sink."""

    ok: bool
    status: Literal[200]
    url: str
    body: str
    message: str


def build_world() -> World:
    """Load the ordered fake inbox and file store from this example's data."""

    raw_emails = json.loads(_INBOX_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw_emails, list):
        raise ValueError("fake_inbox.json must contain an ordered JSON list")

    emails = tuple(
        Email(
            id=_string_field(item, "id"),
            sender=_string_field(item, "sender"),
            subject=_string_field(item, "subject"),
            body=_string_field(item, "body"),
            unread=_bool_field(item, "unread"),
        )
        for item in raw_emails
    )
    files = tuple(
        FileEntry(
            path=file_name,
            content=(_WORLD_DIRECTORY / "fake_filestore" / file_name).read_text(
                encoding="utf-8"
            ),
        )
        for file_name in _FILE_NAMES
    )
    return World(emails=emails, files=files)


def list_emails(world: World) -> list[Email]:
    """Return all emails in fixture insertion order."""

    return list(world.emails)


def read_email(world: World, email_id: str) -> Email:
    """Return one email by ID, raising ``KeyError`` when it is absent."""

    for email in world.emails:
        if email.id == email_id:
            return email
    raise KeyError(f"unknown email id: {email_id}")


def list_files(world: World) -> list[str]:
    """Return fake file names in their stable fixture order."""

    return [file_entry.path for file_entry in world.files]


def read_file(world: World, path: str) -> str:
    """Return a fake file's contents, raising ``KeyError`` when absent."""

    for file_entry in world.files:
        if file_entry.path == path:
            return file_entry.content
    raise KeyError(f"unknown fake file: {path}")


def send_http(world: World, url: str, body: str) -> HttpResult:
    """Return a deterministic fake POST result without making a request.

    ``world`` is part of the signature intentionally: all tools share one
    swappable boundary even though this pure sink has no world lookup to do.
    """

    del world
    return {
        "ok": True,
        "status": 200,
        "url": url,
        "body": body,
        "message": "fake HTTP transport accepted the request",
    }


def _string_field(value: object, field_name: str) -> str:
    """Read a required string field from one JSON email object."""

    if not isinstance(value, dict):
        raise ValueError("each fake email must be a JSON object")
    field = value.get(field_name)
    if not isinstance(field, str):
        raise ValueError(f"email field {field_name!r} must be a string")
    return field


def _bool_field(value: object, field_name: str) -> bool:
    """Read a required boolean field from one JSON email object."""

    if not isinstance(value, dict):
        raise ValueError("each fake email must be a JSON object")
    field = value.get(field_name)
    if not isinstance(field, bool):
        raise ValueError(f"email field {field_name!r} must be a boolean")
    return field
