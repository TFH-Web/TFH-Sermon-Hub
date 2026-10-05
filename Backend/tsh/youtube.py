# Thin client for the YouTube Data API v3. All YouTube HTTP goes through here, so tests can monkeypatch it.
from typing import Any, Iterator

import requests
from flask import current_app

API_URL = "https://www.googleapis.com/youtube/v3/"
# videos.list and playlistItems.list take at most 50 per call.
PAGE_SIZE = 50
TIMEOUT = 20


class YouTubeError(Exception):
    """A YouTube API call failed. status is the HTTP status, or None if YouTube could not be reached."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def list_playlists(channel_id: str) -> list[dict]:
    """Return every playlist on the channel as {"id", "title", "item_count", "privacy"}.

    Only public playlists come back, since this uses an API key, not OAuth.
    Raises YouTubeError if the API key is missing or the call fails.
    """
    items = _get_all("playlists", {"part": "snippet,contentDetails,status", "channelId": channel_id})
    return [
        {
            "id": p["id"],
            "title": p["snippet"]["title"],
            "item_count": p["contentDetails"]["itemCount"],
            "privacy": p["status"]["privacyStatus"],
        }
        for p in items
    ]


def list_playlist_items(playlist_id: str) -> list[dict]:
    """Return the videos in a playlist, in playlist order, as {"video_id", "title", "privacy"}.

    Private and deleted videos are included (titled "Private video" / "Deleted video") so the caller can report them.
    Raises YouTubeError if the call fails, e.g. status 404 when the playlist is private or deleted.
    """
    items = _get_all("playlistItems", {"part": "snippet,status", "playlistId": playlist_id})
    return [
        {
            "video_id": item["snippet"]["resourceId"]["videoId"],
            "title": item["snippet"]["title"],
            "privacy": item.get("status", {}).get("privacyStatus"),
        }
        for item in items
    ]


def get_videos(video_ids: list[str]) -> list[dict]:
    """Return details for the given videos as {"id", "title", "description", "published_at", "live_started_at", "duration", "privacy"}.

    published_at and live_started_at are ISO-8601 strings (live_started_at is None unless the video was a live stream).
    duration is ISO-8601, e.g. "PT1H2M3S". Videos that are private or deleted are left out of the result.
    Raises YouTubeError if a call fails.
    """
    videos = []
    for start in range(0, len(video_ids), PAGE_SIZE):
        batch = video_ids[start:start + PAGE_SIZE]
        data = _get("videos", {"part": "snippet,contentDetails,status,liveStreamingDetails", "id": ",".join(batch)})
        for v in data.get("items", []):
            videos.append({
                "id": v["id"],
                "title": v["snippet"]["title"],
                "description": v["snippet"].get("description", ""),
                "published_at": v["snippet"]["publishedAt"],
                "live_started_at": v.get("liveStreamingDetails", {}).get("actualStartTime"),
                "duration": v["contentDetails"].get("duration"),
                "privacy": v["status"]["privacyStatus"],
            })
    return videos


def _get_all(endpoint: str, params: dict) -> Iterator[dict]:
    """Yield every item from a list endpoint, following nextPageToken."""
    params = {**params, "maxResults": PAGE_SIZE}
    while True:
        data = _get(endpoint, params)
        yield from data.get("items", [])
        token = data.get("nextPageToken")
        if not token:
            return
        params["pageToken"] = token


def _get(endpoint: str, params: dict) -> dict[str, Any]:
    """Make one GET call and return the JSON body. Raises YouTubeError on any failure."""
    api_key = current_app.config.get("YOUTUBE_API_KEY")
    if not api_key:
        raise YouTubeError("YOUTUBE_API_KEY is not set")

    try:
        # The key goes in a header, not the query string, so it never shows up in a URL, log line or error message.
        res = requests.get(API_URL + endpoint, params=params, headers={"X-Goog-Api-Key": api_key}, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise YouTubeError(f"{endpoint}: could not reach YouTube ({type(e).__name__})") from None

    if not res.ok:
        try:
            reason = res.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            reason = res.reason
        raise YouTubeError(f"{endpoint}: HTTP {res.status_code}: {reason}", status=res.status_code)
    return res.json()
