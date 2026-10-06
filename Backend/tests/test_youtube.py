# Tests for the YouTube API client. requests.get is faked, so nothing goes over the network.
import pytest
import requests
from flask import Flask

from tsh import youtube

FAKE_KEY = "test-key-not-real"


class FakeResponse:
    def __init__(self, body: dict, status: int = 200):
        self.body = body
        self.status_code = status
        self.ok = status < 400
        self.reason = "Bad Request"

    def json(self) -> dict:
        return self.body


class Recorded(list):
    responses: list


@pytest.fixture()
def api(app: Flask, monkeypatch) -> Recorded:
    """Fake requests.get. Append FakeResponses to api.responses; every call is recorded in api."""
    app.config["YOUTUBE_API_KEY"] = FAKE_KEY
    recorded = Recorded()
    recorded.responses = []

    def fake_get(url, params=None, headers=None, timeout=None):
        recorded.append({"url": url, "params": dict(params or {}), "headers": headers or {}})
        return recorded.responses.pop(0)

    monkeypatch.setattr(requests, "get", fake_get)
    return recorded


def playlist(id: str, title: str) -> dict:
    return {"id": id, "snippet": {"title": title}, "contentDetails": {"itemCount": 3}, "status": {"privacyStatus": "public"}}


def test_list_playlists_follows_pages(api: Recorded):
    """list_playlists follows nextPageToken until the last page and returns plain dicts."""
    api.responses += [
        FakeResponse({"items": [playlist("PL1", "Holy Spirit")], "nextPageToken": "page2"}),
        FakeResponse({"items": [playlist("PL2", "Who Is Jesus?")]}),
    ]

    result = youtube.list_playlists("UC123")

    assert result == [
        {"id": "PL1", "title": "Holy Spirit", "item_count": 3, "privacy": "public"},
        {"id": "PL2", "title": "Who Is Jesus?", "item_count": 3, "privacy": "public"},
    ]
    assert "pageToken" not in api[0]["params"]
    assert api[1]["params"]["pageToken"] == "page2"
    assert api[0]["params"]["maxResults"] == 50


def test_api_key_goes_in_header_not_url(api: Recorded):
    """The key is sent in the X-Goog-Api-Key header and never in the URL or query string."""
    api.responses.append(FakeResponse({"items": []}))

    youtube.list_playlists("UC123")

    assert api[0]["headers"] == {"X-Goog-Api-Key": FAKE_KEY}
    assert FAKE_KEY not in api[0]["url"]
    assert FAKE_KEY not in str(api[0]["params"])


def test_list_playlist_items(api: Recorded):
    """list_playlist_items returns video id, title and privacy, keeping hidden entries for the report."""
    api.responses.append(FakeResponse({"items": [
        {"snippet": {"title": "The Guide", "resourceId": {"videoId": "vid00000001"}}, "status": {"privacyStatus": "public"}},
        {"snippet": {"title": "Private video", "resourceId": {"videoId": "vid00000002"}}, "status": {"privacyStatus": "private"}},
    ]}))

    assert youtube.list_playlist_items("PL1") == [
        {"video_id": "vid00000001", "title": "The Guide", "privacy": "public"},
        {"video_id": "vid00000002", "title": "Private video", "privacy": "private"},
    ]


def test_get_videos_batches_of_50(api: Recorded):
    """get_videos asks for at most 50 ids per call and maps each video to a plain dict."""
    ids = [f"vid{i:08d}" for i in range(51)]

    def video(id: str) -> dict:
        return {
            "id": id,
            "snippet": {"title": "T", "description": "D", "publishedAt": "2026-10-04T23:00:24Z"},
            "contentDetails": {"duration": "PT38M25S"},
            "status": {"privacyStatus": "public"},
        }

    api.responses += [
        FakeResponse({"items": [video(i) for i in ids[:50]]}),
        FakeResponse({"items": [video(ids[50])]}),
    ]

    result = youtube.get_videos(ids)

    assert len(result) == 51
    assert len(api[0]["params"]["id"].split(",")) == 50
    assert api[1]["params"]["id"] == ids[50]
    assert result[0] == {
        "id": ids[0],
        "title": "T",
        "description": "D",
        "published_at": "2026-10-04T23:00:24Z",
        "duration": "PT38M25S",
        "privacy": "public",
    }


def test_missing_key(app: Flask):
    """Without YOUTUBE_API_KEY the client raises before making any request."""
    with pytest.raises(youtube.YouTubeError, match="YOUTUBE_API_KEY is not set"):
        youtube.list_playlists("UC123")


def test_http_error_uses_api_message(api: Recorded):
    """An HTTP error raises YouTubeError with the status and YouTube's own message, never the key."""
    api.responses.append(FakeResponse({"error": {"message": "playlistNotFound"}}, status=404))

    with pytest.raises(youtube.YouTubeError) as error:
        youtube.list_playlist_items("PL404")

    assert error.value.status == 404
    assert str(error.value) == "playlistItems: HTTP 404: playlistNotFound"
    assert FAKE_KEY not in str(error.value)


def test_network_error(app: Flask, monkeypatch):
    """A network failure raises YouTubeError with no status and without the request details."""
    app.config["YOUTUBE_API_KEY"] = FAKE_KEY

    def fail(*args, **kwargs):
        raise requests.ConnectionError(f"failed with key {FAKE_KEY}")

    monkeypatch.setattr(requests, "get", fail)

    with pytest.raises(youtube.YouTubeError) as error:
        youtube.list_playlists("UC123")

    assert error.value.status is None
    assert str(error.value) == "playlists: could not reach YouTube (ConnectionError)"
    assert error.value.__cause__ is None
