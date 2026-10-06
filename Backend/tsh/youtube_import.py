# Imports the TFH YouTube channel: playlists become series, videos become sermons.
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

import click
from flask import current_app
from flask.cli import with_appcontext
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError
from sqlalchemy import func

from tsh import youtube
from tsh.database import db
from tsh.models import Series, Sermon, Speaker, UploadStatus
from tsh.pipeline import start_processing
from tsh.youtube_titles import parse_title, series_named_in

# Every description is this boilerplate plus a few links, so everything from here on is dropped.
BOILERPLATE_START = "broadcasted live from"
DURATION_RE = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")
# YouTube's own titles for playlist entries whose video is gone or hidden.
HIDDEN_TITLES = {"Private video", "Deleted video"}
VIDEO_ID = r"[A-Za-z0-9_-]{11}"
# youtube.com/watch?v=ID, youtu.be/ID and youtube.com/shorts/ID, with or without www., m. and extra params.
VIDEO_URL_PATTERNS = [
    re.compile(rf"^https?://(?:www\.|m\.)?youtube\.com/watch\?(?:.*&)?v=({VIDEO_ID})(?:[&#].*)?$"),
    re.compile(rf"^https?://youtu\.be/({VIDEO_ID})(?:[?#].*)?$"),
    re.compile(rf"^https?://(?:www\.|m\.)?youtube\.com/shorts/({VIDEO_ID})(?:[?#/].*)?$"),
]


class VideoImportError(Exception):
    """A single video could not be imported. status is the HTTP status the endpoint should send."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


@dataclass
class ImportReport:
    """What an import did, returned to the admin so problems can be fixed by hand."""

    series_created: int = 0
    sermons_created: int = 0
    # Already imported sermons whose length, date or link changed on YouTube.
    sermons_updated: int = 0
    sermons_unchanged: int = 0
    # Playlists that could not be read, as "title (id): reason".
    skipped_playlists: list[str] = field(default_factory=list)
    # Private, deleted or unavailable videos, by video id.
    skipped_private: list[str] = field(default_factory=list)
    # Upcoming premieres and streams still live, which have no length yet, as "title (id)".
    skipped_not_ready: list[str] = field(default_factory=list)
    # Videos over YOUTUBE_MAX_MINUTES, as "title (id): N min".
    skipped_too_long: list[str] = field(default_factory=list)
    # Videos in more than one series playlist, as "title (id): kept A, also in B".
    multiple_series: list[str] = field(default_factory=list)
    # New sermons whose title has no speaker, so they got "Unknown Speaker", as "title (id)".
    unknown_speakers: list[str] = field(default_factory=list)
    # New sermons naming more than one speaker, as "title (id): A & B". The first is the speaker.
    multiple_speakers: list[str] = field(default_factory=list)
    # New sermons whose pipeline job could not be queued, as "title (id): error". They are left FAILED
    # and can be retried with the reprocess endpoint.
    queue_failures: list[str] = field(default_factory=list)

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
    Safe to run again: videos already imported are matched on youtube_video_id and only their
    duration, date and link are updated (see _update_sermon). New sermons are queued with start_processing;
    one that cannot be queued is counted in queue_failures and the import carries on. Once Redis
    cannot be reached, the rest are set FAILED without trying, since each try would wait for a timeout.
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

    existing = {
        s.youtube_video_id: s
        for s in db.session.scalars(db.select(Sermon).where(Sermon.youtube_video_id.in_(list(found))))
    }
    new_sermons = []
    max_seconds = float(current_app.config["YOUTUBE_MAX_MINUTES"]) * 60
    for video in videos:
        if video["privacy"] == "private":
            report.skipped_private.append(video["id"])
            continue
        duration = parse_duration(video["duration"])
        if duration == 0:
            # Imported once it has finished, so it gets its real length.
            report.skipped_not_ready.append(f"{video['title']} ({video['id']})")
            continue
        if duration > max_seconds:
            report.skipped_too_long.append(f"{video['title']} ({video['id']}): {round(duration / 60)} min")
            continue

        sermon = existing.get(video["id"])
        series = _series_for_video(video, playlists_for_video[video["id"]], report, is_new=sermon is None)
        if sermon is None:
            new_sermons.append(_create_sermon(video, duration, series, playlists_for_video[video["id"]], report))
            report.sermons_created += 1
        elif _update_sermon(sermon, video, duration, series):
            report.sermons_updated += 1
        else:
            report.sermons_unchanged += 1

    # Save everything first: start_processing commits, and a job must not run before its sermon is saved.
    db.session.commit()

    _queue_new_sermons(new_sermons, report)
    return report


def parse_video_id(url: str) -> str | None:
    """Return the video id from a youtube.com/watch?v=, youtu.be/ or youtube.com/shorts/ URL, or None if it is not one."""
    for pattern in VIDEO_URL_PATTERNS:
        match = pattern.match(url.strip())
        if match:
            return match.group(1)
    return None


def import_video(video_id: str) -> tuple[Sermon, bool]:
    """Import one video by id, using the same title, speaker and description rules as the full import.

    The series is the one named in the title (see series_named_in), created if it does not exist yet.
    The next full import then links it to its playlist by title.
    Returns (sermon, True) for a new sermon, which is then queued with start_processing,
    or (existing sermon, False) if the video was already imported. A new sermon that cannot be queued
    is still returned; it is left FAILED with the reason in processing_error.
    Raises VideoImportError (404 if the video is private, deleted or missing, 422 if it is still
    streaming or not premiered yet, or over YOUTUBE_MAX_MINUTES, 502 if YouTube fails).
    """
    sermon = db.session.scalar(db.select(Sermon).where(Sermon.youtube_video_id == video_id))
    if sermon:
        return sermon, False

    try:
        videos = youtube.get_videos([video_id])
    except youtube.YouTubeError as e:
        raise VideoImportError(f"YouTube request failed: {e}", 502) from None
    if not videos or videos[0]["privacy"] == "private":
        raise VideoImportError("Video not found, or it is private or deleted", 404)
    video = videos[0]

    duration = parse_duration(video["duration"])
    if duration == 0:
        raise VideoImportError("Video is not finished streaming yet", 422)
    max_minutes = float(current_app.config["YOUTUBE_MAX_MINUTES"])
    if duration > max_minutes * 60:
        raise VideoImportError(
            f"Video is {round(duration / 60)} minutes, over the {max_minutes:g} minute limit for sermons", 422
        )

    series = _series_named_in_title(video["title"])
    sermon = _create_sermon(video, duration, series, [], ImportReport())
    db.session.commit()
    try:
        start_processing(sermon)
    except Exception:
        # start_processing has already set the sermon FAILED with the reason, so it can be reprocessed later.
        current_app.logger.exception("Could not queue imported sermon %s", sermon.id)
    return sermon, True


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


def clean_description(description: str, title: str, all_speakers: str | None = None) -> str:
    """Drop the "Broadcasted live from..." boilerplate and start with "Speakers: A & B" when there are several.

    Falls back to the title, since the frontend rejects an empty description.
    """
    cut = description.lower().find(BOILERPLATE_START)
    if cut != -1:
        description = description[:cut]
    description = description.strip()
    # The sermon only has room for one speaker, so the description names them all.
    if all_speakers:
        description = f"Speakers: {all_speakers}\n\n{description}".strip()
    return description or title


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


def _series_for_video(video: dict, playlists: list[_Playlist], report: ImportReport, is_new: bool) -> Series | None:
    """Return the series for the first series playlist the video is in, or None if it is only in the master list.

    A new video in more than one series keeps the first and the others go in the report.
    Already imported videos were reported on their first run, so they are not reported again.
    """
    series_list: list[Series] = []
    for playlist in playlists:
        if playlist.is_series:
            series = _get_or_create_series(playlist, report)
            if series not in series_list:
                series_list.append(series)
    if is_new and len(series_list) > 1:
        others = ", ".join(s.title for s in series_list[1:])
        report.multiple_series.append(f"{video['title']} ({video['id']}): kept {series_list[0].title}, also in {others}")
    return series_list[0] if series_list else None


def _series_named_in_title(title: str) -> Series | None:
    """Find or create the series a single video's title names. None if it names none, or an ignored or master playlist."""
    name = series_named_in(title)
    if not name or name.lower() in _names("YOUTUBE_IGNORE_PLAYLISTS") | _names("YOUTUBE_MASTER_PLAYLIST"):
        return None
    series = _existing_series(name)
    if series is None:
        # No playlist id yet; the next full import matches this series by title and fills it in.
        series = Series(id=None, title=_series_aliases().get(name.lower(), name))
        db.session.add(series)
        db.session.flush()
    return series


def _existing_series(name: str | None) -> Series | None:
    """Find an existing series by name (case-insensitive, after aliases), or None."""
    if not name:
        return None
    name = _series_aliases().get(name.lower(), name)
    return db.session.scalar(db.select(Series).where(func.lower(Series.title) == name.lower()))


def _get_or_create_series(playlist: _Playlist, report: ImportReport) -> Series:
    """Find the series for a playlist by playlist id, then by title (case-insensitive, after aliases), else create it."""
    series = db.session.scalar(db.select(Series).where(Series.youtube_playlist_id == playlist.id))
    if series:
        return series

    title = _series_aliases().get(playlist.title.lower(), playlist.title)
    series = _existing_series(title)
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


def _queue_new_sermons(sermons: list[Sermon], report: ImportReport) -> None:
    """Call start_processing for each new sermon, adding any that fail to report.queue_failures.

    After the first Redis connection error or timeout, the rest are set FAILED with "queue: Redis unavailable"
    without trying, since each try would wait for its own timeout and fail the same way.
    """
    redis_down = False
    for sermon in sermons:
        if redis_down:
            sermon.status = UploadStatus.FAILED
            sermon.processing_error = "queue: Redis unavailable"
            db.session.commit()
            report.queue_failures.append(f"{sermon.title} ({sermon.youtube_video_id}): Redis unavailable")
            continue
        try:
            start_processing(sermon)
        except Exception as e:
            # start_processing has already set this sermon FAILED, so log it and move on to the next one.
            current_app.logger.exception("Could not queue imported sermon %s", sermon.id)
            report.queue_failures.append(f"{sermon.title} ({sermon.youtube_video_id}): {str(e) or type(e).__name__}")
            redis_down = isinstance(e, (RedisConnectionError, RedisTimeoutError))


def _synced_fields(video: dict, duration: int) -> dict:
    """The sermon fields kept in step with YouTube on every run."""
    return {
        "video_link": f"https://www.youtube.com/watch?v={video['id']}",
        "duration": duration,
        "date": local_date(video["published_at"]),
    }


def _create_sermon(
    video: dict, duration: int, series: Series | None, playlists: list[_Playlist], report: ImportReport
) -> Sermon:
    """Add a sermon for one YouTube video, with the title cleaned up and the speaker parsed from it.

    Titles with no speaker get "Unknown Speaker" and go in report.unknown_speakers.
    Titles naming several speakers go in report.multiple_speakers.
    """
    playlist_titles = [p.title for p in playlists] + ([series.title] if series else [])
    parsed = parse_title(video["title"], playlist_titles, series is not None, _speaker_aliases())
    if parsed.first_name is None:
        speaker = _unknown_speaker()
        report.unknown_speakers.append(f"{video['title']} ({video['id']})")
    else:
        speaker = _get_or_create_speaker(parsed.first_name, parsed.last_name)
    if parsed.all_speakers:
        report.multiple_speakers.append(f"{video['title']} ({video['id']}): {parsed.all_speakers}")

    sermon = Sermon(
        id=None,
        # Title and description are only set here, so admin edits are never undone by a re-run.
        title=parsed.title,
        description=clean_description(video["description"], parsed.title, parsed.all_speakers),
        **_synced_fields(video, duration),
        transcript=None,
        summary=None,
        speaker_id=None,
        series_id=None,
        speaker=speaker,
        series=series,
        tags=[],
        youtube_video_id=video["id"],
    )
    db.session.add(sermon)
    return sermon


def _update_sermon(sermon: Sermon, video: dict, duration: int, series: Series | None) -> bool:
    """Bring an already imported sermon up to date with YouTube. Returns True if anything changed.

    Only duration, date and link are updated. Title, description, speaker, tags, transcript and summary
    are never touched, since admins may have edited them.
    The series is only filled in when the sermon has none, e.g. it was in the master list before its series playlist existed.
    """
    changed = False
    for name, value in _synced_fields(video, duration).items():
        if getattr(sermon, name) != value:
            setattr(sermon, name, value)
            changed = True
    if sermon.series is None and series is not None:
        sermon.series = series
        changed = True
    return changed


def _get_or_create_speaker(first_name: str, last_name: str) -> Speaker:
    """Find a speaker by first and last name (case-insensitive), or create one."""
    speaker = db.session.scalar(
        db.select(Speaker).where(
            func.lower(Speaker.first_name) == first_name.lower(),
            func.lower(Speaker.last_name) == last_name.lower(),
        )
    )
    if speaker is None:
        speaker = Speaker(id=None, first_name=first_name, last_name=last_name)
        db.session.add(speaker)
        # Flush so the next sermon by the same speaker finds this one instead of breaking the unique name.
        db.session.flush()
    return speaker


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


def _series_aliases() -> dict[str, str]:
    """Read YOUTUBE_SERIES_ALIASES ("Playlist=Series,...") as {lowercase playlist title: series title}."""
    return _pairs("YOUTUBE_SERIES_ALIASES")


def _speaker_aliases() -> dict[str, str]:
    """Read YOUTUBE_SPEAKER_ALIASES ("Misspelled Name=Right Name,...") as {lowercase misspelling: right name}."""
    return _pairs("YOUTUBE_SPEAKER_ALIASES")


def _pairs(setting: str) -> dict[str, str]:
    """Read a comma-separated "From=To" setting as {lowercase from: to}."""
    pairs = {}
    for pair in current_app.config[setting].split(","):
        if "=" in pair:
            old, new = pair.split("=", 1)
            pairs[old.strip().lower()] = new.strip()
    return pairs


@click.command("import-youtube")
@with_appcontext
def import_youtube_command() -> None:
    """Import every playlist and video from the YouTube channel and print the report."""
    report = import_channel().as_dict()
    for name, value in report.items():
        if isinstance(value, int):
            click.echo(f"{name}: {value}")
    for name, value in report.items():
        if isinstance(value, list) and value:
            click.echo(f"\n{name} ({len(value)}):")
            for line in value:
                click.echo(f"  {line}")
