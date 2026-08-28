"""Token-gated static server for temporary MASSFRONT phone playtests.

The listener stays on loopback; a temporary HTTPS tunnel may forward to it.
Only the player-facing runtime surface is served. Tools, tests, source Blender
files, dotfiles, and the rest of the repository are never reachable.
"""

from __future__ import annotations

import argparse
import hmac
import http.cookies
import http.server
import os
import posixpath
import urllib.parse
from pathlib import Path


ALLOWED_EXACT = {"/", "/index.html"}
ALLOWED_PREFIXES = ("/src/", "/lib/", "/assets/models/", "/assets/textures/")
COOKIE_NAME = "mf_phone_access"


class PhoneTestServer(http.server.ThreadingHTTPServer):
    # A phone launch fans out across dozens of scripts and authored assets. The
    # TCPServer default backlog of five intermittently refused Cloudflare origin
    # connections, leaving the visible loader stuck during RUNTIME BOOT.
    request_queue_size = 128
    daemon_threads = True


class RestrictedHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "MASSFRONTPhoneTest/1.0"

    def _authorized(self) -> bool:
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        token_prefix = f"/t/{self.server.access_token}"
        if path == token_prefix or path.startswith(token_prefix + "/"):
            return True
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        supplied = query.get("access", [""])[0]
        if supplied and hmac.compare_digest(supplied, self.server.access_token):
            self._new_session = True
            return True
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        saved = cookies.get(COOKIE_NAME)
        return bool(saved and hmac.compare_digest(saved.value, self.server.access_token))

    def _safe_runtime_path(self) -> str | None:
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        token_prefix = f"/t/{self.server.access_token}"
        if path == token_prefix:
            path = "/"
        elif path.startswith(token_prefix + "/"):
            path = path[len(token_prefix):]
        path = posixpath.normpath("/" + path.lstrip("/"))
        if path in ALLOWED_EXACT or any(path.startswith(prefix) for prefix in ALLOWED_PREFIXES):
            if "/." not in path and not path.endswith(".blend"):
                return path
        return None

    def do_GET(self) -> None:
        self._new_session = False
        if not self._authorized():
            self.send_error(404)
            return
        public_path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        token_prefix = f"/t/{self.server.access_token}"
        if public_path == token_prefix:
            self.send_response(302)
            self.send_header("Location", token_prefix + "/")
            self.end_headers()
            return
        safe_path = self._safe_runtime_path()
        if safe_path is None:
            self.send_error(404)
            return
        if self._new_session:
            self.send_response(302)
            self.send_header("Location", safe_path if safe_path != "/index.html" else "/")
            self.send_header(
                "Set-Cookie",
                f"{COOKIE_NAME}={self.server.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict",
            )
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        self.path = safe_path
        super().do_GET()

    def do_HEAD(self) -> None:
        self._new_session = False
        if not self._authorized() or self._safe_runtime_path() is None:
            self.send_error(404)
            return
        self.path = self._safe_runtime_path()
        super().do_HEAD()

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8992)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "index.html").is_file():
        raise SystemExit(f"index.html not found under {root}")
    os.chdir(root)
    server = PhoneTestServer(("127.0.0.1", args.port), RestrictedHandler)
    server.access_token = args.token
    print(f"MASSFRONT restricted phone server on 127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
