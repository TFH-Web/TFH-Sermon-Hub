# Tests for authorized caption downloads, track selection and safe error messages.
import json
from urllib.parse import parse_qs

import pytest
import requests
from google.auth.exceptions import RefreshError, TransportError

from tsh import captions

VIDEO_ID = "F_OiCiZ3Y3Y"
VTT = b"WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello<00:00:01.500><c> church.</c>\n"
SECRETS = ("test-client-id", "test-client-secret", "test-refresh-token", "test-access-token")


def track(track_id="track", kind="asr", language="en", **snippet):
    """Build a caption track without real channel or credential data."""
    return {"id": track_id, "snippet": {
        "trackKind": kind, "language": language, "status": "serving", "isDraft": False, **snippet,
    }}


def response(status=200, body=None, content=None):
    """Build a requests response for the HTTP and OAuth transports."""
    result = requests.Response()
    result.status_code = status
    result._content = content if content is not None else json.dumps(body).encode()
    result.headers["Content-Type"] = "application/json"
    return result


@pytest.fixture()
def configured(app):
    """Use fake OAuth credentials; the shared app fixture clears all real credentials."""
    app.config.update(dict(zip(captions.OAUTH_SETTINGS, SECRETS[:3])))
    return app


def test_track_selection_prefers_manual_english():
    """A serving manual English track wins over ASR and unrelated languages."""
    selected = captions.select_track([
        track("spanish", "standard", "es"),
        track("auto"),
        track("draft", "standard", isDraft=True),
        track("failed", "standard", status="failed"),
        track("forced", "forced"),
        track("manual", "standard", "en-US"),
    ])
    assert selected["id"] == "manual"


def test_track_selection_uses_asr_when_no_manual_track():
    """The English ASR track verified in the spike is eligible without a manual track."""
    assert captions.select_track([track("auto"), track("foreign", "standard", "fr")])["id"] == "auto"


def test_track_selection_prefers_exact_language_and_is_deterministic():
    """Equal-quality tracks use exact language first and stable id order second."""
    assert captions.select_track([track("regional", language="en-GB"), track("b"), track("a")])["id"] == "a"


@pytest.mark.parametrize("tracks", [[], [track(language="es")], [track(status="syncing")], [None, {}]])
def test_no_suitable_track_has_actionable_error(tracks):
    """Missing, pending or wrong-language captions explain what an admin must do."""
    with pytest.raises(captions.CaptionError, match="publish a caption track"):
        captions.select_track(tracks)


def test_oauth_refresh_bearer_header_and_download(configured, monkeypatch):
    """The real AuthorizedSession refreshes in memory and sends Bearer authorization, never an API key."""
    calls = []

    def request(session, method, url, **kwargs):
        calls.append((method, url, kwargs))
        if url == captions.TOKEN_URI:
            return response(body={"access_token": SECRETS[3], "expires_in": 3600, "token_type": "Bearer"})
        if url == captions.API:
            return response(body={"items": [track("track/with?characters")]})
        return response(content=VTT)

    monkeypatch.setattr(requests.Session, "request", request)
    segments = captions.get_transcript(VIDEO_ID)
    assert segments == [{"start": 1.0, "end": 3.0, "text": "Hello church."}]
    assert len(calls) == 3
    token_request, listing, download = calls
    assert token_request[0:2] == ("POST", captions.TOKEN_URI)
    token_data = token_request[2]["data"]
    if isinstance(token_data, bytes):
        token_data = token_data.decode()
    token_data = parse_qs(token_data)
    assert token_data["grant_type"] == ["refresh_token"]
    assert token_data["refresh_token"] == [SECRETS[2]]
    assert token_data["client_id"] == [SECRETS[0]]
    assert token_data["client_secret"] == [SECRETS[1]]
    assert listing[2]["params"] == {"part": "snippet", "videoId": VIDEO_ID}
    assert download[1] == captions.API + "/track%2Fwith%3Fcharacters"
    assert download[2]["params"] == {"tfmt": "vtt"}
    for _, url, kwargs in (listing, download):
        assert kwargs["headers"]["authorization"] == "Bearer " + SECRETS[3]
        assert not any(secret in url or secret in str(kwargs["params"]) for secret in SECRETS)
        assert "X-Goog-Api-Key" not in kwargs["headers"]
        assert kwargs["timeout"] == captions.TIMEOUT


def test_unauthorized_response_refreshes_once_then_stops(configured, monkeypatch):
    """An invalid access token gets one refresh retry before a safe permission error."""
    counts = {"token": 0, "list": 0}

    def request(session, method, url, **kwargs):
        if url == captions.TOKEN_URI:
            counts["token"] += 1
            return response(body={"access_token": SECRETS[3], "expires_in": 3600})
        counts["list"] += 1
        return response(401, {"error": {"errors": [{"reason": "authError"}]}})

    monkeypatch.setattr(requests.Session, "request", request)
    with pytest.raises(captions.CaptionError, match="permission denied"):
        captions.get_transcript(VIDEO_ID)
    assert counts == {"token": 2, "list": 2}


def test_invalid_grant_from_real_refresh_is_sanitized(configured, monkeypatch, caplog):
    """The actual refresh transport cannot leak Google's credential-bearing error into logs."""
    monkeypatch.setattr(requests.Session, "request", lambda *args, **kwargs: response(400, {
        "error": "invalid_grant", "error_description": " ".join(SECRETS),
    }))
    with pytest.raises(captions.CaptionError, match="invalid_grant") as raised:
        captions.get_transcript(VIDEO_ID)
    assert raised.value.__suppress_context__
    assert all(secret not in str(raised.value) and secret not in caplog.text for secret in SECRETS)


@pytest.mark.parametrize("missing", captions.OAUTH_SETTINGS)
def test_missing_credentials_fail_before_network(configured, monkeypatch, missing):
    """A missing OAuth value reports its setting name without trying the network."""
    configured.config[missing] = ""
    monkeypatch.setattr(requests.Session, "request", lambda *args, **kwargs: pytest.fail("unexpected network"))
    with pytest.raises(captions.CaptionError, match=missing):
        captions.get_transcript(VIDEO_ID)


@pytest.mark.parametrize("video_id", ["", "not a video", "F_OiCiZ3Y3Y?token=secret", "https://youtu.be/F_OiCiZ3Y3Y"])
def test_invalid_video_id_fails_before_network(configured, monkeypatch, video_id):
    """Only a video id can reach the captions API."""
    monkeypatch.setattr(requests.Session, "request", lambda *args, **kwargs: pytest.fail("unexpected network"))
    with pytest.raises(captions.CaptionError, match="invalid YouTube video id"):
        captions.get_transcript(video_id)


class FakeSession:
    """Return a fixed list and download response without making HTTP calls."""

    def __init__(self, results):
        self.results = iter(results)
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        result = next(self.results)
        if isinstance(result, Exception):
            raise result
        return result


@pytest.mark.parametrize(("status", "reason", "expected"), [
    (403, "quotaExceeded", "quota exceeded"),
    (403, "dailyLimitExceeded", "quota exceeded"),
    (403, "forbidden", "permission denied"),
    (401, "authError", "permission denied"),
    (404, "videoNotFound", "not found"),
    (429, "rateLimitExceeded", "rate limit"),
    (503, "backendError", "HTTP 503"),
])
@pytest.mark.parametrize("phase", ["list", "download"])
def test_api_failures_are_actionable_and_never_echo_secrets(configured, monkeypatch, status, reason, expected, phase):
    """List and download failures retain the error category without remote text or credentials."""
    failure = response(status, {"error": {
        "message": " ".join(SECRETS), "errors": [{"reason": reason, "message": " ".join(SECRETS)}],
    }})
    results = [failure] if phase == "list" else [response(body={"items": [track()]}), failure]
    session = FakeSession(results)
    monkeypatch.setattr(captions, "AuthorizedSession", lambda *args, **kwargs: session)
    with pytest.raises(captions.CaptionError, match=expected) as raised:
        captions.get_transcript(VIDEO_ID)
    assert all(secret not in str(raised.value) for secret in SECRETS)
    assert len(session.calls) == (1 if phase == "list" else 2)


@pytest.mark.parametrize(("error", "expected"), [
    (RefreshError("test-refresh-token", {"error": "invalid_grant"}), "invalid_grant"),
    (RefreshError("test-client-secret", {"error": "invalid_client"}), "token refresh failed"),
    (requests.Timeout("test-access-token"), "timed out"),
    (TransportError("test-refresh-token"), "could not connect"),
])
def test_transport_errors_do_not_expose_their_exception_context(configured, monkeypatch, error, expected):
    """OAuth and transport exceptions become safe messages and suppress credential-bearing context."""
    monkeypatch.setattr(captions, "AuthorizedSession", lambda *args, **kwargs: FakeSession([error]))
    with pytest.raises(captions.CaptionError, match=expected) as raised:
        captions.get_transcript(VIDEO_ID)
    assert raised.value.__suppress_context__
    assert all(secret not in str(raised.value) for secret in SECRETS)


@pytest.mark.parametrize("body", [None, {}, {"items": {}}, {"items": []}])
def test_empty_or_invalid_list_fails_without_download(configured, monkeypatch, body):
    """A bad list or no tracks fails before spending download quota."""
    session = FakeSession([response(body=body)])
    monkeypatch.setattr(captions, "AuthorizedSession", lambda *args, **kwargs: session)
    with pytest.raises(captions.CaptionError):
        captions.get_transcript(VIDEO_ID)
    assert len(session.calls) == 1


@pytest.mark.parametrize("content", [b"", b"not vtt", b"\xff\xfe", b"WEBVTT\n\n"])
def test_unusable_download_is_not_saved(configured, monkeypatch, content):
    """Empty, malformed or incorrectly encoded captions produce an actionable parse error."""
    session = FakeSession([response(body={"items": [track()]}), response(content=content)])
    monkeypatch.setattr(captions, "AuthorizedSession", lambda *args, **kwargs: session)
    with pytest.raises(captions.CaptionError, match="invalid WebVTT"):
        captions.get_transcript(VIDEO_ID)
