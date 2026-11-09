#!/usr/bin/env python3
"""Check live API role boundaries using separately obtained Entra access tokens.

Tokens stay in private files. Output contains statuses only, never account claims,
authorization headers or response bodies. Browser sign-in remains a separate check.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import ipaddress
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Never forward a credential to a login page, another host or plain HTTP.
        return None


def origin(value: str) -> str:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        loopback = host == "localhost"
        if host and not loopback:
            try:
                loopback = ipaddress.ip_address(host).is_loopback
            except ValueError:
                pass
        if (
            not host or parsed.username is not None or parsed.password is not None
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment
            or (parsed.scheme != "https" and not (parsed.scheme == "http" and loopback))
            or parsed.port == 0
        ):
            raise ValueError()
    except ValueError:
        raise ValueError("Use an HTTPS origin, or HTTP localhost through the approved SSH tunnel") from None
    return value.rstrip("/")


def token_file(path: Path) -> str:
    if path.stat().st_size > 16_384:
        raise ValueError("Access-token file is too large")
    token = path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
        raise ValueError("Expected a file containing one Entra API access token")
    return token


def status(opener, url: str, token: str | None, *, method: str = "GET") -> int | None:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    # Non-object JSON is rejected before any write. ID 0 also avoids selecting
    # an ordinary saved sermon for the PATCH permission check.
    data = b"[]" if method in {"POST", "PATCH"} else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(request, timeout=15) as response:
            return response.status
    except HTTPError as error:
        try:
            return error.code
        finally:
            error.close()
    except (OSError, URLError):
        # Exception messages can contain URLs or proxy details; retain no body/exception.
        return None


def verify(base_url: str, tokens: dict[str, str], *, opener=None) -> dict:
    base_url = origin(base_url)
    if set(tokens) != {"admin", "staff", "unassigned"} or any(not t for t in tokens.values()):
        raise ValueError("Provide separate admin, staff and unassigned account access-token files")
    if len(set(tokens.values())) != 3:
        raise ValueError("Use separate access tokens for the three account categories")
    opener = opener or build_opener(NoRedirect())
    checks = []
    cases = [
        ("anonymous", None, "GET", "/api/sermons?pageSize=1", 401),
        ("admin", tokens["admin"], "GET", "/api/sermons?pageSize=1", 200),
        ("staff", tokens["staff"], "GET", "/api/sermons?pageSize=1", 200),
        ("unassigned", tokens["unassigned"], "GET", "/api/sermons?pageSize=1", 403),
        ("admin", tokens["admin"], "POST", "/api/sermons", 422),
        ("staff", tokens["staff"], "POST", "/api/sermons", 403),
        ("unassigned", tokens["unassigned"], "POST", "/api/sermons", 403),
        ("admin", tokens["admin"], "PATCH", "/api/sermons/0", 404),
        ("staff", tokens["staff"], "PATCH", "/api/sermons/0", 403),
        ("unassigned", tokens["unassigned"], "PATCH", "/api/sermons/0", 403),
    ]
    for account, token, method, path, expected in cases:
        actual = status(opener, base_url + path, token, method=method)
        checks.append({
            "account_category": account, "method": method, "path": path,
            "expected_status": expected, "actual_status": actual,
            "passed": actual == expected,
        })
    return {
        "checked_at": datetime.now(UTC).isoformat(), "origin": base_url,
        "passed": all(check["passed"] for check in checks), "checks": checks,
        "scope": "Live API boundaries only; real browser sign-in, UI visibility and account switching need separate evidence",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    for account in ("admin", "staff", "unassigned"):
        parser.add_argument(f"--{account}-token-file", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        tokens = {
            account: token_file(getattr(args, account + "_token_file"))
            for account in ("admin", "staff", "unassigned")
        }
        result = verify(args.base_url, tokens)
    except (OSError, UnicodeError, ValueError):
        print("Role verification could not start; check the origin and private token files", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
