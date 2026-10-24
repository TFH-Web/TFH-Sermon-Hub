# One strict rule for YouTube video links and ids, used by import, create, edit and source links. TFH-620
#
# A video is identified by its 11 character id. Every link the app saves or hands out is built from
# that id, so a link typed by an admin or written by the model is never passed along as it is.
import math
import re
from urllib.parse import parse_qsl, urlsplit

VIDEO_ID = r"[A-Za-z0-9_-]{11}"
# The hosts that carry a watch or shorts link. youtu.be is handled on its own because its id is in the path.
WATCH_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com"}
SHORT_HOST = "youtu.be"


class InvalidVideoLink(ValueError):
    """A link or id that is not a safe YouTube video. The message is safe to send to the client."""


def is_video_id(value: object) -> bool:
    """True only for a string that is exactly 11 letters, digits, "-" or "_"."""
    return isinstance(value, str) and re.fullmatch(VIDEO_ID, value) is not None


def parse_video_id(url: object) -> str | None:
    """Return the video id from a youtube.com/watch?v=, youtu.be/ or youtube.com/shorts/ link, else None.

    Strict on purpose: http or https only, no user name or port, an exact host from the list above,
    exactly one v= on a watch link, and nothing after the id except a query, a fragment or one "/".
    """
    if not isinstance(url, str):
        return None
    text = url.strip()
    # A space, control character, backslash or non-ASCII letter inside a link is how look-alike hosts hide.
    if not text.isascii() or any(c.isspace() or ord(c) < 32 or c == "\\" for c in text):
        return None
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https"):
        return None
    if parts.username is not None or parts.password is not None or port is not None:
        return None

    host = parts.hostname or ""
    if host in WATCH_HOSTS:
        if parts.path == "/watch":
            ids = [value for key, value in parse_qsl(parts.query, keep_blank_values=True) if key == "v"]
            return ids[0] if len(ids) == 1 and is_video_id(ids[0]) else None
        match = re.fullmatch(rf"/shorts/({VIDEO_ID})/?", parts.path)
        return match.group(1) if match else None
    if host == SHORT_HOST:
        match = re.fullmatch(rf"/({VIDEO_ID})/?", parts.path)
        return match.group(1) if match else None
    return None


def watch_url(video_id: str) -> str:
    """The one HTTPS link the app saves and shows for a video. Raises InvalidVideoLink for a bad id."""
    if not is_video_id(video_id):
        raise InvalidVideoLink("The video id must be 11 letters, digits, - or _")
    return f"https://www.youtube.com/watch?v={video_id}"


def resolve_video(video_link: object, youtube_video_id: object) -> tuple[str, str]:
    """Turn what a client sent into (the HTTPS link to save, the video id to save).

    Send a link, an id, or both. Both must point at the same video.
    Raises InvalidVideoLink, with a message for the client, for anything else.
    """
    from_link = None
    if video_link is not None:
        from_link = parse_video_id(video_link)
        if from_link is None:
            raise InvalidVideoLink(
                "videoLink must be a youtube.com/watch?v=, youtu.be/ or youtube.com/shorts/ link "
                "with an 11 character video id"
            )
    if youtube_video_id is not None:
        if not is_video_id(youtube_video_id):
            raise InvalidVideoLink("youtubeVideoId must be an 11 character YouTube video id")
        if from_link is not None and from_link != youtube_video_id:
            raise InvalidVideoLink("videoLink and youtubeVideoId point at different videos")
        video_id = youtube_video_id
    elif from_link is not None:
        video_id = from_link
    else:
        raise InvalidVideoLink("Send a videoLink or a youtubeVideoId")
    return watch_url(video_id), video_id


def source_url(video_id: str, start_sec: object) -> str:
    """The link to a moment in a video, for search and chat sources.

    Built only from the stored id and the start time. A start time that is not a finite number
    of at least 0 (negative, NaN, infinite, or not a number) links to the start of the video.
    """
    seconds = 0
    if (
        isinstance(start_sec, (int, float))
        and not isinstance(start_sec, bool)
        and math.isfinite(start_sec)
        and start_sec >= 0
    ):
        seconds = int(start_sec)
    return f"{watch_url(video_id)}&t={seconds}s"