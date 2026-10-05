# Processing pipeline for a sermon: transcript, then embeddings, then summary.
import time
from datetime import datetime, timezone
from typing import Callable

from flask import current_app

from tsh.database import db
from tsh.models import Sermon, UploadStatus
from tsh.queue import enqueue


def dummy_delay(sermon: Sermon) -> None:
    """Sleep for PIPELINE_DUMMY_DELAY seconds (default 0), so the frontend can watch a sermon sit in PROCESSING.

    Only for development until the real steps exist. Remove once S5 to S7 are in.
    """
    delay = float(current_app.config.get("PIPELINE_DUMMY_DELAY", 0))
    if delay > 0:
        time.sleep(delay)


def fetch_transcript(sermon: Sermon) -> None:
    """Fill in the transcript from the YouTube captions. Placeholder until S5."""


def embed_chunks(sermon: Sermon) -> None:
    """Split the transcript into chunks and store their embeddings. Placeholder until S6."""


def summarize_sermon(sermon: Sermon) -> None:
    """Write the AI summary for the sermon. Placeholder until S7."""


def start_processing(sermon: Sermon) -> None:
    """Mark a sermon PROCESSING and queue process_sermon for it.

    Call this after creating or importing a sermon. It does not need storage_key,
    since sermons come from YouTube. Without REDIS_URL the pipeline runs before this returns.
    If the job cannot be queued, the sermon is set FAILED with a "queue: <error>" message
    and the error is raised again, e.g. redis.ConnectionError or redis.TimeoutError when Redis is down.
    """
    sermon.status = UploadStatus.PROCESSING
    sermon.processing_error = None
    # Commit before queueing, or the worker could load the sermon before this change is saved.
    db.session.commit()

    try:
        enqueue(process_sermon, sermon.id)
    except Exception as e:
        db.session.rollback()
        # Without this the sermon would stay PROCESSING forever, since no job is coming.
        sermon.status = UploadStatus.FAILED
        sermon.processing_error = f"queue: {str(e) or type(e).__name__}"
        db.session.commit()
        raise


def process_sermon(sermon_id: int) -> None:
    """Run every pipeline step for one sermon and save the result on it.

    Starts by setting status PROCESSING and clearing the old processing_error.
    Required steps (transcript, embeddings) failing sets status FAILED.
    The summary is best effort: if it fails the sermon is still PUBLISHED.
    Any error is saved to processing_error as "<step>: <error>" instead of raised,
    so the job itself never fails. Does nothing if the sermon no longer exists.
    """
    sermon = db.session.get(Sermon, sermon_id)
    if sermon is None:
        current_app.logger.warning("Sermon %s was deleted before it could be processed", sermon_id)
        return

    # Set here as well as in start_processing, so a job queued any other way still shows as processing.
    sermon.status = UploadStatus.PROCESSING
    sermon.processing_error = None
    db.session.commit()

    # Steps are looked up when this runs, not at import, so tests can monkeypatch them.
    required_steps = (
        ("dummy_delay", dummy_delay),
        ("fetch_transcript", fetch_transcript),
        ("embed_chunks", embed_chunks),
    )
    for name, step in required_steps:
        error = _run_step(name, step, sermon_id)
        if error:
            sermon = db.session.get(Sermon, sermon_id)
            sermon.status = UploadStatus.FAILED
            sermon.processing_error = error
            db.session.commit()
            return

    # Search and chat only need the transcript and embeddings, so a failed summary still publishes.
    error = _run_step("summarize_sermon", summarize_sermon, sermon_id)
    sermon = db.session.get(Sermon, sermon_id)
    sermon.status = UploadStatus.PUBLISHED
    sermon.processing_error = error
    # The column has no time zone, so store UTC without tzinfo.
    sermon.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()


def regenerate_summary(sermon_id: int) -> None:
    """Run only the summary step, for the "Regenerate with AI" buttons.

    Leaves the status alone. Saves "summarize_sermon: <error>" to processing_error if it fails.
    If it works, clears processing_error only when that was an old summary error.
    Does nothing unless the sermon exists and is PUBLISHED.
    """
    sermon = db.session.get(Sermon, sermon_id)
    # The summary needs the transcript, which only a PUBLISHED sermon is sure to have.
    if sermon is None or sermon.status != UploadStatus.PUBLISHED:
        return

    error = _run_step("summarize_sermon", summarize_sermon, sermon_id)
    sermon = db.session.get(Sermon, sermon_id)
    if error:
        sermon.processing_error = error
    elif (sermon.processing_error or "").startswith("summarize_sermon:"):
        sermon.processing_error = None
    db.session.commit()


def _run_step(name: str, step: Callable[[Sermon], None], sermon_id: int) -> str | None:
    """Run one step and commit what it changed. Returns "<name>: <error>" if it raised, else None."""
    sermon = db.session.get(Sermon, sermon_id)
    try:
        step(sermon)
        db.session.commit()
        return None
    except Exception as e:
        # Roll back so a half-finished step never gets saved, e.g. a partial summary.
        db.session.rollback()
        current_app.logger.exception("Sermon %s failed at %s", sermon_id, name)
        return f"{name}: {str(e) or type(e).__name__}"
