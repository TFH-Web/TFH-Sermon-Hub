"""Run a bounded caption backfill with progress persisted by the existing pipeline."""

import re

import click
from flask import current_app
from flask.cli import with_appcontext
from sqlalchemy import func, or_

from tsh import pipeline
from tsh.captions import OAUTH_SETTINGS
from tsh.database import db
from tsh.models import Sermon, UploadStatus
from tsh.youtube_import import VIDEO_ID, parse_video_id

QUOTA_ERROR = "fetch_transcript: YouTube quota exceeded"


@click.command("backfill-captions")
@click.option(
    "--limit",
    type=click.IntRange(1, 40),
    default=35,
    show_default=True,
    help="Maximum sermon attempts in this run; other API use shares the daily quota.",
)
@click.option(
    "--failed-only",
    is_flag=True,
    help="Retry failed sermons, including ones with older saved captions.",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="List selected sermons without changing data or calling YouTube.",
)
@with_appcontext
def backfill_captions_command(limit: int, failed_only: bool, dry_run: bool) -> None:
    """Backfill missing captions or retry failures, stopping on quota or OAuth errors.

    Runs synchronously even with Redis configured so a quota failure stops this batch.
    Completed transcripts are skipped by default. Other failures require --failed-only
    after their cause is fixed; quota failures are eligible again on the next run.
    """
    query = db.select(Sermon.id, Sermon.youtube_video_id, Sermon.video_link).order_by(
        Sermon.date.desc(), Sermon.id
    )
    if failed_only:
        query = query.where(Sermon.status == UploadStatus.FAILED)
    else:
        query = query.where(
            Sermon.status != UploadStatus.PROCESSING,
            or_(Sermon.transcript.is_(None), func.trim(Sermon.transcript) == ""),
            or_(
                Sermon.status != UploadStatus.FAILED,
                Sermon.processing_error.startswith(QUOTA_ERROR),
            ),
        )
    selected = []
    for sermon_id, video_id, link in db.session.execute(query):
        if (video_id and re.fullmatch(VIDEO_ID, video_id)) or (
            not video_id and parse_video_id(link)
        ):
            selected.append(sermon_id)
            if len(selected) == limit:
                break
    click.echo(f"selected: {len(selected)}")
    if dry_run:
        for sermon_id in selected:
            click.echo(f"sermon {sermon_id}")
        click.echo("Dry run: no downloads or database changes.")
        return
    if not selected:
        return
    missing = [name for name in OAUTH_SETTINGS if not current_app.config.get(name)]
    if missing:
        raise click.ClickException(
            "OAuth not configured: set "
            + ", ".join(missing)
            + " privately in Backend/.env."
        )

    succeeded = failed = attempted = 0
    for sermon_id in selected:
        db.session.expire_all()
        sermon = db.session.get(Sermon, sermon_id)
        if sermon is None or sermon.status == UploadStatus.PROCESSING:
            continue
        if not failed_only and sermon.transcript and sermon.transcript.strip():
            continue
        # Do not queue every selected job: inspect each saved result before starting the next.
        pipeline.process_sermon(sermon_id)
        attempted += 1
        db.session.expire_all()
        sermon = db.session.get(Sermon, sermon_id)
        error = sermon.processing_error or ""
        if sermon.status == UploadStatus.FAILED:
            failed += 1
            click.echo(f"sermon {sermon_id}: {error}")
        else:
            succeeded += 1
            click.echo(f"sermon {sermon_id}: captions saved")
        if error.startswith(QUOTA_ERROR):
            click.echo(
                "Stopped: daily YouTube quota exhausted. Resume after the quota resets."
            )
            break
        if error.startswith(
            (
                "fetch_transcript: invalid_grant:",
                "fetch_transcript: OAuth ",
                "fetch_transcript: YouTube caption permission denied",
            )
        ):
            click.echo(
                f"attempted: {attempted}; succeeded: {succeeded}; failed: {failed}"
            )
            raise click.ClickException(
                "Stopped: fix the channel OAuth credentials or permissions before retrying."
            )
    click.echo(f"attempted: {attempted}; succeeded: {succeeded}; failed: {failed}")
