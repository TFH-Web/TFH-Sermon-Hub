# Download YouTube captions with the channel's OAuth refresh credentials.
import re
from urllib.parse import quote

import requests
from flask import current_app
from google.auth.exceptions import RefreshError, TransportError
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials

from tsh import caption_quota
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


# The reasons YouTube gives when the project's daily quota is used up. rateLimitExceeded is a short-term
# limit that clears in seconds, so it does not open the breaker.
DAILY_QUOTA_REASONS = {"quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"}


class CaptionError(RuntimeError):
    """An actionable caption failure that is safe to save in processing_error."""


class CaptionQuotaError(CaptionError):
    """YouTube's daily quota is used up, so no caption request is made until it resets."""


class CaptionAuthError(CaptionError):
    """The TFH channel's OAuth sign-in expired, was revoked, or could not be renewed."""


class CaptionsDisabledError(CaptionError):
    """Caption downloads are turned off by CAPTIONS_ENABLED, so no caption request is made."""


DISABLED_MESSAGE = ("captions are turned off (CAPTIONS_ENABLED is false); turn them on and reprocess to get a transcript")


def parse_flag(value, name: str) -> bool:
    """Parse a boolean flag from a string, raising ValueError for invalid values."""
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("", "1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    raise ValueError(f"{name} must be true or false, not {value!r}")


def captions_enabled() -> bool:
    """True unless CAPTIONS_ENABLED turns caption downloads off. Read each time, so tests can change it."""
    return parse_flag(current_app.config.get("CAPTIONS_ENABLED", True), "CAPTIONS_ENABLED")


def quota_message(resume) -> str:
    """Say when captions resume. Starts with "YouTube quota exceeded" so it is easy to identify."""
    when = resume.astimezone(caption_quota.RESET_TIMEZONE).strftime("%Y-%m-%d %H:%M %Z")
    return f"YouTube quota exceeded; no caption requests are sent until {when}, then reprocess."


AUTH_EXPIRED = "YouTube sign-in expired, refresh the token"

# How a caption failure starts once the pipeline saves it in processing_error as "fetch_transcript: <message>".
# Shared so backfill and the sync report recognise the same pauses.
QUOTA_PREFIX = "fetch_transcript: YouTube quota exceeded"
AUTH_PREFIX = "fetch_transcript: " + AUTH_EXPIRED
DISABLED_PREFIX = "fetch_transcript: " + DISABLED_MESSAGE.split(";")[0]


def pause_reason() -> str | None:
    """Say why caption downloads are on hold right now, or None if they are not.

    Reads the CAPTIONS_ENABLED flag and the saved quota breaker only, so it never calls YouTube.
    An expired sign-in has no saved state: it is only known from a sermon's processing_error (AUTH_PREFIX).
    """
    if not captions_enabled():
        return DISABLED_MESSAGE
    resume = caption_quota.blocked_until()
    if resume is not None:
        return quota_message(resume)
    return None


def auth_message(category: str) -> str:
    """Tell an admin to renew the sign-in. category is a label like invalid_grant, never a credential value."""
    steps = (
        "create a new refresh token for the TFH channel, set YOUTUBE_OAUTH_REFRESH_TOKEN in Backend/.env "
        "and the worker's environment, restart the API and worker, then reprocess"
    )
    if category == "token refresh failed":
        steps = "check YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET, or " + steps
    return f"{AUTH_EXPIRED} ({category}); {steps}"


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
    if not captions_enabled():
        raise CaptionsDisabledError(DISABLED_MESSAGE)
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise CaptionError("invalid YouTube video id; correct the sermon video link, then reprocess")
    resume = caption_quota.blocked_until()
    if resume is not None:
        raise CaptionQuotaError(quota_message(resume))
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
        raise CaptionAuthError(auth_message("invalid_grant" if invalid_grant else "token refresh failed")) from None
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
    if reasons & DAILY_QUOTA_REASONS:
        raise CaptionQuotaError(quota_message(caption_quota.open_breaker()))
    elif response.status_code == 429 or reasons & {"rateLimitExceeded", "userRateLimitExceeded"}:
        message = "YouTube rate limit reached; reprocess later"
    elif response.status_code in (401, 403):
        message = "YouTube caption permission denied; authorize the TFH channel with youtube.force-ssl and video edit access, then reprocess"
    elif response.status_code == 404:
        message = "YouTube video or caption track was not found; check the video and published captions, then reprocess"
    else:
        message = f"YouTube caption request failed (HTTP {response.status_code}); reprocess later"
    raise CaptionError(message)
