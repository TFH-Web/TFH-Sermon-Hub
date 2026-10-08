# Download YouTube captions with the channel's OAuth refresh credentials.
import re
from urllib.parse import quote

import requests
from flask import current_app
from google.auth.exceptions import RefreshError, TransportError
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials

from tsh.transcripts import TranscriptSegment, parse_vtt

API = "https://www.googleapis.com/youtube/v3/captions"
TOKEN_URI = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"
TIMEOUT = (5, 30)
OAUTH_SETTINGS = (
    "YOUTUBE_OAUTH_CLIENT_ID",
    "YOUTUBE_OAUTH_CLIENT_SECRET",
    "YOUTUBE_OAUTH_REFRESH_TOKEN",
)


class CaptionError(RuntimeError):
    """An actionable caption failure that is safe to save in processing_error."""


def select_track(tracks: list[dict], language: str = "en") -> dict:
    """Return a serving track in the requested language, preferring manual captions.

    Regional variants are allowed; drafts, forced tracks and other languages are skipped.
    Raises CaptionError when there is no suitable track.
    """
    language = language.lower().replace("_", "-")
    choices = []
    for track in tracks:
        if not isinstance(track, dict):
            continue
        snippet = track.get("snippet", {})
        if not isinstance(snippet, dict) or not isinstance(snippet.get("language"), str):
            continue
        track_language = snippet.get("language", "").lower().replace("_", "-")
        kind = snippet.get("trackKind")
        if (isinstance(track.get("id"), str) and track["id"] and snippet.get("status") == "serving"
                and not snippet.get("isDraft", False) and kind in ("standard", "ASR", "asr")
                and (track_language == language or track_language.split("-")[0] == language.split("-")[0])):
            choices.append(track)
    if not choices:
        raise CaptionError("no usable captions in the configured language; publish a caption track on YouTube, then reprocess")
    return min(choices, key=lambda track: (
        track["snippet"]["trackKind"].lower() == "asr",
        track["snippet"]["language"].lower().replace("_", "-") != language,
        track["id"],
    ))


def get_transcript(video_id: str) -> list[TranscriptSegment]:
    """List, select, download and parse captions using the TFH OAuth credentials.

    Refreshes access tokens in memory. Raises CaptionError for missing access,
    missing captions, quota, network or parse failures; never includes remote error text.
    """
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise CaptionError("invalid YouTube video id; correct the sermon video link, then reprocess")
    values = {name: current_app.config.get(name, "") for name in OAUTH_SETTINGS}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise CaptionError(f"OAuth not configured: set {', '.join(missing)} in Backend/.env, then reprocess")
    credentials = Credentials(
        token=None,
        refresh_token=values["YOUTUBE_OAUTH_REFRESH_TOKEN"],
        client_id=values["YOUTUBE_OAUTH_CLIENT_ID"],
        client_secret=values["YOUTUBE_OAUTH_CLIENT_SECRET"],
        token_uri=TOKEN_URI,
        scopes=[SCOPE],
    )
    # Only a 401 refreshes and retries. Quota and permission failures must reach the admin.
    with AuthorizedSession(credentials, refresh_timeout=10, max_refresh_attempts=1) as session:
        response = _get(session, API, {"part": "snippet", "videoId": video_id})
        try:
            tracks = response.json()["items"]
            if not isinstance(tracks, list):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise CaptionError("YouTube returned an invalid caption list; reprocess later") from None
        track = select_track(tracks, current_app.config.get("YOUTUBE_CAPTION_LANGUAGE", "en"))
        response = _get(session, f"{API}/{quote(track['id'], safe='')}", {"tfmt": "vtt"})
        try:
            document = response.content.decode("utf-8-sig")
            return parse_vtt(document, rolling=track["snippet"]["trackKind"].lower() == "asr")
        except (ValueError, UnicodeError):
            raise CaptionError("caption file is empty or invalid WebVTT; check the YouTube caption track, then reprocess") from None


def _get(session: AuthorizedSession, url: str, params: dict) -> requests.Response:
    try:
        response = session.get(url, params=params, timeout=TIMEOUT)
    except RefreshError as error:
        invalid_grant = any(isinstance(arg, dict) and arg.get("error") == "invalid_grant" for arg in error.args)
        if invalid_grant:
            raise CaptionError("invalid_grant: OAuth refresh token expired or was revoked; obtain a new TFH channel refresh token, then reprocess") from None
        raise CaptionError("OAuth token refresh failed; check the OAuth client and TFH channel credentials, then reprocess") from None
    except (requests.RequestException, TransportError):
        raise CaptionError("YouTube caption request timed out or could not connect; reprocess later") from None
    if response.status_code != 200:
        _raise_api_error(response)
    return response


def _raise_api_error(response: requests.Response) -> None:
    try:
        reasons = {error.get("reason") for error in response.json().get("error", {}).get("errors", [])}
    except (ValueError, AttributeError, TypeError):
        reasons = set()
    if reasons & {"quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"}:
        message = "YouTube quota exceeded; wait for the daily quota reset or request a quota increase, then reprocess"
    elif response.status_code == 429 or reasons & {"rateLimitExceeded", "userRateLimitExceeded"}:
        message = "YouTube rate limit reached; reprocess later"
    elif response.status_code in (401, 403):
        message = "YouTube caption permission denied; authorize the TFH channel with youtube.force-ssl and video edit access, then reprocess"
    elif response.status_code == 404:
        message = "YouTube video or caption track was not found; check the video and published captions, then reprocess"
    else:
        message = f"YouTube caption request failed (HTTP {response.status_code}); reprocess later"
    raise CaptionError(message)
