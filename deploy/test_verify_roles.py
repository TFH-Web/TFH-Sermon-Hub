"""Synthetic HTTP responses verify the operator tool, not real Entra acceptance."""

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import build_opener

import verify_roles


TOKENS = {account: f"header.{account}.PRIVATE_SIGNATURE" for account in ("admin", "staff", "unassigned")}


class Response:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class Opener:
    def __init__(self, *, staff_can_write=False, expired=False):
        self.requests = []
        self.staff_can_write = staff_can_write
        self.expired = expired

    def open(self, request, timeout):
        self.requests.append(request)
        token = request.get_header("Authorization", "")
        if not token or self.expired:
            code = 401
        elif TOKENS["unassigned"] in token:
            code = 403
        elif request.method in {"POST", "PATCH"}:
            if TOKENS["staff"] in token and not self.staff_can_write:
                code = 403
            else:
                code = 404 if request.method == "PATCH" else 422
        else:
            code = 200
        if code >= 400:
            raise HTTPError(request.full_url, code, "PRIVATE_RESPONSE", {}, io.BytesIO(b"PRIVATE_BODY"))
        return Response(code)


class RoleVerificationTests(unittest.TestCase):
    def test_expected_role_matrix_and_no_saved_content_in_output(self):
        opener = Opener()
        result = verify_roles.verify("http://localhost:5173/", TOKENS, opener=opener)
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["checks"]), 10)
        serialized = json.dumps(result)
        for secret in [*TOKENS.values(), "PRIVATE_RESPONSE", "PRIVATE_BODY"]:
            self.assertNotIn(secret, serialized)
        for request in opener.requests:
            if request.method in {"POST", "PATCH"}:
                self.assertEqual(json.loads(request.data), [])

    def test_an_expired_staff_token_cannot_look_like_a_successful_write_denial(self):
        result = verify_roles.verify("https://sermonhub.tfh.org", TOKENS, opener=Opener(expired=True))
        self.assertFalse(result["passed"])
        staff = [c for c in result["checks"] if c["account_category"] == "staff"]
        self.assertTrue(all(not c["passed"] for c in staff))

    def test_staff_writes_becoming_accessible_fail_the_check(self):
        result = verify_roles.verify("https://sermonhub.tfh.org", TOKENS, opener=Opener(staff_can_write=True))
        self.assertFalse(result["passed"])
        denied = [c for c in result["checks"] if not c["passed"]]
        self.assertEqual({c["method"] for c in denied}, {"POST", "PATCH"})

    def test_network_failure_is_a_failure_without_leaking_exception_details(self):
        opener = Opener()
        with patch.object(opener, "open", side_effect=URLError("PRIVATE_PROXY_AND_TOKEN")):
            result = verify_roles.verify("https://sermonhub.tfh.org", TOKENS, opener=opener)
        self.assertFalse(result["passed"])
        self.assertTrue(all(c["actual_status"] is None for c in result["checks"]))
        self.assertNotIn("PRIVATE_PROXY_AND_TOKEN", json.dumps(result))

    def test_redirect_status_never_counts_as_authenticated_access(self):
        opener = Opener()
        with patch.object(opener, "open", side_effect=HTTPError(
            "https://sermonhub.tfh.org/api/sermons", 302, "redirect", {}, io.BytesIO(),
        )):
            result = verify_roles.verify("https://sermonhub.tfh.org", TOKENS, opener=opener)
        self.assertFalse(result["passed"])

    def test_real_redirect_handler_never_forwards_a_bearer_token(self):
        received = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(self.path)
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/credential-trap")
                else:
                    self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/redirect"
                result = verify_roles.status(build_opener(verify_roles.NoRedirect()), url, TOKENS["admin"])
            finally:
                server.shutdown()
                thread.join(timeout=2)
        self.assertEqual(result, 302)
        self.assertEqual(received, ["/redirect"])

    def test_unsafe_or_ambiguous_origins_are_rejected_before_sending_tokens(self):
        for value in (
            "http://sermonhub.tfh.org", "https://user:password@example.org",
            "https://example.org/?token=private", "https://example.org/#fragment",
            "https://example.org/api", "file:///tmp/token", "https://example.org:invalid",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                verify_roles.verify(value, TOKENS, opener=Opener())

    def test_one_token_cannot_be_reused_for_multiple_account_categories(self):
        with self.assertRaisesRegex(ValueError, "separate access tokens"):
            verify_roles.verify("https://sermonhub.tfh.org", dict.fromkeys(TOKENS, TOKENS["admin"]))

    def test_invalid_token_file_fails_without_printing_its_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private-token"
            path.write_text("PRIVATE_INVALID_TOKEN", encoding="utf-8")
            output = io.StringIO()
            with patch("sys.stderr", new=output), redirect_stdout(output):
                code = verify_roles.main([
                    "--base-url", "https://sermonhub.tfh.org",
                    "--admin-token-file", str(path), "--staff-token-file", str(path),
                    "--unassigned-token-file", str(path),
                ])
            self.assertEqual(code, 2)
            self.assertNotIn("PRIVATE_INVALID_TOKEN", output.getvalue())


if __name__ == "__main__":
    unittest.main()
