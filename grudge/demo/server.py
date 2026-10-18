"""Dependency-free local server for the Phase 10 event stream and viewer."""

from __future__ import annotations

import json
import mimetypes
import queue
import threading
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from grudge.demo.events import DemoEvent, EventBus

ROOT = Path(__file__).resolve().parents[2]
VIEWER_DIR = ROOT / "viewer"


class _DemoHTTPServer(ThreadingHTTPServer):
    """HTTP server carrying the bus and orchestration callback."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        address: tuple[str, int],
        bus: EventBus,
        viewer_dir: Path,
        runner: Callable[[], object] | None,
    ) -> None:
        self.bus = bus
        self.viewer_dir = viewer_dir.resolve()
        self.runner = runner
        self._run_thread: threading.Thread | None = None
        super().__init__(address, _DemoHandler)

    def restart(self) -> None:
        """Clear the replay buffer and run the configured demo in the background."""

        self.bus.clear()
        if self.runner is None:
            return
        self._run_thread = threading.Thread(target=self.runner, daemon=True)
        self._run_thread.start()


class _DemoHandler(BaseHTTPRequestHandler):
    """Serve static viewer files and the bus's SSE/JSON endpoints."""

    server: _DemoHTTPServer
    protocol_version = "HTTP/1.1"

    def _json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/state":
            self._json(
                {"events": [_payload(event) for event in self.server.bus.snapshot()]}
            )
            return
        if path == "/events":
            self._events()
            return
        self._static(path)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/restart":
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        self.server.restart()
        self._json({"restarted": True}, HTTPStatus.ACCEPTED)

    def _events(self) -> None:
        pending: queue.Queue[DemoEvent] = queue.Queue()
        unsubscribe = self.server.bus.subscribe(pending.put)
        history = self.server.bus.snapshot()
        sent = {event.seq for event in history}
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            for event in history:
                self._write_event(event)
            self.wfile.flush()
            # A completed replay is finite and useful to curl/test clients;
            # a running stream remains open for the next event.
            if history and history[-1].type == "demo.finished":
                return
            while True:
                try:
                    event = pending.get(timeout=0.5)
                except queue.Empty:
                    continue
                if event.seq in sent:
                    continue
                sent.add(event.seq)
                self._write_event(event)
                self.wfile.flush()
                if event.type == "demo.finished":
                    return
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            return
        finally:
            unsubscribe()

    def _write_event(self, event: DemoEvent) -> None:
        payload = json.dumps(_payload(event), ensure_ascii=False, separators=(",", ":"))
        self.wfile.write(f"event: {event.type}\ndata: {payload}\n\n".encode())

    def _static(self, path: str) -> None:
        relative = unquote(path.lstrip("/")) or "index.html"
        candidate = (self.server.viewer_dir / relative).resolve()
        if not candidate.is_file() or not candidate.is_relative_to(
            self.server.viewer_dir
        ):
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or (
            "application/octet-stream"
        )
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def _payload(event: DemoEvent) -> dict[str, object]:
    return event.model_dump(mode="json")


class DemoServer:
    """Lifecycle wrapper around the local HTTP server."""

    def __init__(
        self,
        *,
        host: str = "127.0.0.1",
        port: int = 8765,
        bus: EventBus | None = None,
        viewer_dir: Path | str = VIEWER_DIR,
        runner: Callable[[], object] | None = None,
    ) -> None:
        self.bus = bus or EventBus()
        self.httpd = _DemoHTTPServer((host, port), self.bus, Path(viewer_dir), runner)
        self.thread: threading.Thread | None = None

    @property
    def address(self) -> tuple[str, int]:
        """Return the bound host and port, including an ephemeral port."""

        host, port = self.httpd.server_address[:2]
        return str(host), int(port)

    @property
    def server_address(self) -> tuple[str, int]:
        """Compatibility alias matching :class:`HTTPServer`."""

        return self.address

    def start(self, *, run_demo: bool = False) -> DemoServer:
        """Start serving in a daemon thread and optionally begin the demo."""

        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        if run_demo:
            self.httpd.restart()
        return self

    def restart(self) -> None:
        self.httpd.restart()

    def close(self) -> None:
        """Stop the server and release its listening socket."""

        self.httpd.shutdown()
        self.httpd.server_close()

    shutdown = close

    def __enter__(self) -> DemoServer:
        return self.start()

    def __exit__(self, *_args: object) -> None:
        self.close()


def serve_demo(
    *,
    port: int = 8765,
    host: str = "127.0.0.1",
    bus: EventBus | None = None,
    runner: Callable[[], object] | None = None,
) -> DemoServer:
    """Start a local viewer server and return its lifecycle handle."""

    return DemoServer(host=host, port=port, bus=bus, runner=runner).start()


__all__ = ["DemoServer", "serve_demo"]
