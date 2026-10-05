# Imports the TFH YouTube channel: playlists become series, videos become sermons.
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import func

from tsh import youtube
from tsh.database import db
from tsh.models import Series, Sermon, Speaker

# Every description is this boilerplate plus a few links, so everything from here on is dropped.
BOILERPLATE_START = "broadcasted live from"
DURATION_RE = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")
# YouTube's own titles for playlist entries whose video is gone or hidden.
HIDDEN_TITLES = {"Private video", "Deleted video"}


@dataclass
class ImportReport:
    """What an import did, returned to the admin so problems can be fixed by hand."""

    series_created: int = 0
    sermons_created: int = 0
    # Playlists that could not be read, as "title (id): reason".
    skipped_playlists: list[str] = field(default_factory=list)
    # Private, deleted or unavailable videos, by video id.
    skipped_private: list[str] = field(default_factory=list)
    # Videos over YOUTUBE_MAX_MINUTES, as "title (id): N min".
    skipped_too_long: list[str] = field(default_factory=list)
    # Videos in more than one series playlist, as "title (id): kept A, also in B".
    multiple_series: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class _Playlist:
    id: str
    title: str
    is_series: bool
    video_ids: list[str] = field(default_factory=list)


def import_channel() -> ImportReport:
    """Import every playlist and video on YOUTUBE_CHANNEL_ID.

    Ignored playlists (YOUTUBE_IGNORE_PLAYLISTS) are skipped. The master playlist (YOUTUBE_MASTER_PLAYLIST)
    adds its videos without a series. Every other playlist becomes a series.
    Everything is fetched from YouTube before anything is saved, so a failed run saves nothing.
    Returns an ImportReport. Raises youtube.YouTubeError if the channel or the video details cannot be fetched.
    """
    report = ImportReport()
    playlists = _fetch_playlists(report)

    # video id -> the playlists it is in, in the order the playlists were read.
    playlists_for_video: dict[str, list[_Playlist]] = {}
    for playlist in playlists:
        for video_id in playlist.video_ids:
            playlists_for_video.setdefault(video_id, []).append(playlist)

    videos = youtube.get_videos(list(playlists_for_video))
    found = {v["id"] for v in videos}
    # get_videos leaves out videos that are private or deleted, but still listed in a playlist.
    report.skipped_private.extend(v for v in playlists_for_video if v not in found and v not in report.skipped_private)

    max_seconds = float(current_app.config["YOUTUBE_MAX_MINUTES"]) * 60
    for video in videos:
        if video["privacy"] == "private":
            report.skipped_private.append(video["id"])
            continue
        duration = parse_duration(video["duration"])
        if duration > max_seconds:
            report.skipped_too_long.append(f"{video['title']} ({video['id']}): {round(duration / 60)} min")
            continue

        series = _series_for_video(video, playlists_for_video[video["id"]], report)
        _create_sermon(video, duration, series)
        report.sermons_created += 1

    db.session.commit()
    return report


def parse_duration(value: str | None) -> int:
    """Turn an ISO-8601 duration like "PT1H2M3S" into seconds. Returns 0 for anything it cannot read."""
    match = DURATION_RE.match(value or "")
    if not match:
        return 0
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return ((days * 24 + hours) * 60 + minutes) * 60 + seconds


def local_date(published_at: str) -> date:
    """Turn YouTube's UTC timestamp into the date in YOUTUBE_TIMEZONE.

    Sunday streams publish in the late afternoon Pacific, which is already Monday in UTC.
    """
    utc = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    return utc.astimezone(ZoneInfo(current_app.config["YOUTUBE_TIMEZONE"])).date()


def clean_description(description: str, title: str) -> str:
    """Drop the "Broadcasted live from..." boilerplate. Falls back to the title, since the frontend rejects an empty description."""
    cut = description.lower().find(BOILERPLATE_START)
    if cut != -1:
        description = description[:cut]
    return description.strip() or title


def _fetch_playlists(report: ImportReport) -> list[_Playlist]:
    """Read the channel's playlists and their video ids, leaving out ignored ones.

    Playlists that fail with a 403 or 404 (private or deleted) are added to the report and skipped.
    Hidden entries ("Private video", "Deleted video") are added to the report and left out.
    """
    ignore = _names("YOUTUBE_IGNORE_PLAYLISTS")
    master = _names("YOUTUBE_MASTER_PLAYLIST")

    playlists = []
    for p in youtube.list_playlists(current_app.config["YOUTUBE_CHANNEL_ID"]):
        if _matches(p, ignore):
            continue
        if p["privacy"] == "private":
            report.skipped_playlists.append(f"{p['title']} ({p['id']}): private")
            continue
        try:
            items = youtube.list_playlist_items(p["id"])
        except youtube.YouTubeError as e:
            if e.status not in (403, 404):
                raise
            report.skipped_playlists.append(f"{p['title']} ({p['id']}): {e}")
            continue

        playlist = _Playlist(id=p["id"], title=p["title"], is_series=not _matches(p, master))
        for item in items:
            if item["title"] in HIDDEN_TITLES or item["privacy"] == "private":
                if item["video_id"] not in report.skipped_private:
                    report.skipped_private.append(item["video_id"])
            elif item["video_id"] not in playlist.video_ids:
                playlist.video_ids.append(item["video_id"])
        playlists.append(playlist)
    return playlists


def _series_for_video(video: dict, playlists: list[_Playlist], report: ImportReport) -> Series | None:
    """Return the series for the first series playlist the video is in, or None if it is only in the master list.

    A video in more than one series keeps the first and the others go in the report.
    """
    series_list: list[Series] = []
    for playlist in playlists:
        if playlist.is_series:
            series = _get_or_create_series(playlist, report)
            if series not in series_list:
                series_list.append(series)
    if len(series_list) > 1:
        others = ", ".join(s.title for s in series_list[1:])
        report.multiple_series.append(f"{video['title']} ({video['id']}): kept {series_list[0].title}, also in {others}")
    return series_list[0] if series_list else None


def _get_or_create_series(playlist: _Playlist, report: ImportReport) -> Series:
    """Find the series for a playlist by playlist id, then by title (case-insensitive, after aliases), else create it."""
    series = db.session.scalar(db.select(Series).where(Series.youtube_playlist_id == playlist.id))
    if series:
        return series

    title = _aliases().get(playlist.title.lower(), playlist.title)
    series = db.session.scalar(db.select(Series).where(func.lower(Series.title) == title.lower()))
    if series:
        # Merged playlists keep the first playlist's id; the others match on title.
        if series.youtube_playlist_id is None:
            series.youtube_playlist_id = playlist.id
        return series

    series = Series(id=None, title=title, youtube_playlist_id=playlist.id)
    db.session.add(series)
    # Flush so the next playlist with the same title finds this series instead of breaking the unique title.
    db.session.flush()
    report.series_created += 1
    return series


def _create_sermon(video: dict, duration: int, series: Series | None) -> Sermon:
    """Add a sermon for one YouTube video. The speaker is the placeholder until titles are parsed (TFH-480)."""
    sermon = Sermon(
        id=None,
        title=video["title"],
        video_link=f"https://www.youtube.com/watch?v={video['id']}",
        duration=duration,
        date=local_date(video["published_at"]),
        description=clean_description(video["description"], video["title"]),
        transcript=None,
        summary=None,
        speaker_id=None,
        series_id=None,
        speaker=_unknown_speaker(),
        series=series,
        tags=[],
        youtube_video_id=video["id"],
    )
    db.session.add(sermon)
    return sermon


def _unknown_speaker() -> Speaker:
    """Return the "Unknown Speaker" placeholder, creating it the first time. Sermons with it need their speaker fixed by hand."""
    speaker = db.session.scalar(
        db.select(Speaker).where(Speaker.first_name == "Unknown", Speaker.last_name == "Speaker")
    )
    if speaker is None:
        speaker = Speaker(id=None, first_name="Unknown", last_name="Speaker")
        db.session.add(speaker)
        db.session.flush()
    return speaker


def _names(setting: str) -> set[str]:
    """Read a comma-separated playlist setting as lowercase titles or ids."""
    return {name.strip().lower() for name in current_app.config[setting].split(",") if name.strip()}


def _matches(playlist: dict, names: set[str]) -> bool:
    return playlist["title"].lower() in names or playlist["id"].lower() in names


def _aliases() -> dict[str, str]:
    """Read YOUTUBE_SERIES_ALIASES ("Playlist=Series,...") as {lowercase playlist title: series title}."""
    aliases = {}
    for pair in current_app.config["YOUTUBE_SERIES_ALIASES"].split(","):
        if "=" in pair:
            playlist, series = pair.split("=", 1)
            aliases[playlist.strip().lower()] = series.strip()
    return aliases
