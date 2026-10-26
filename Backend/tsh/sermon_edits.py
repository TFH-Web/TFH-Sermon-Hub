"""Transaction-local cleanup and edit ownership for persisted sermon sources."""

from sqlalchemy import delete, select

from tsh.database import db
from tsh.models import (
    Sermon,
    SermonChunk,
    SermonChunkEmbedding,
    SummaryRegenState,
    TagSource,
    UploadStatus,
)

EDITABLE_FIELDS = frozenset(
    {
        "title",
        "date",
        "duration",
        "description",
        "speaker",
        "speakers",
        "series",
        "tags",
        "summary",
        "videoLink",
        "youtubeVideoId",
    }
)


def derived_edit_conflict(sermon: Sermon) -> str | None:
    """Refuse source/summary changes while an existing worker owns that content."""
    if sermon.status == UploadStatus.PROCESSING:
        return "Sermon processing is active. Wait for it to finish before editing its source or summary."
    if sermon.summary_regen_state in (
        SummaryRegenState.QUEUED,
        SummaryRegenState.RUNNING,
    ):
        return "Summary regeneration is active. Wait for it to finish before editing its source or summary."
    return None


def delete_derived_chunks(sermon_id: int) -> None:
    """Delete vec0 rows before their chunks, without committing the caller's transaction."""
    chunk_ids = select(SermonChunk.id).where(SermonChunk.sermon_id == sermon_id)
    # vec0 ignores foreign-key cascades and does not support DELETE RETURNING.
    db.session.execute(
        delete(SermonChunkEmbedding)
        .where(SermonChunkEmbedding.sermon_chunk_id.in_(chunk_ids))
        .execution_options(synchronize_session=False)
    )
    db.session.execute(delete(SermonChunk).where(SermonChunk.sermon_id == sermon_id))


def invalidate_video_source(sermon: Sermon) -> None:
    """A different video needs explicit reprocessing; none of the old evidence is reusable."""
    delete_derived_chunks(sermon.id)
    sermon.transcript = None
    sermon.transcript_segments = None
    sermon.summary = None
    sermon.summary_source = None
    sermon.tags = [tag for tag in sermon.tags if tag.source != TagSource.AI]
    sermon.storage_key = None
    sermon.audio_key = None
    sermon.processing_error = None
    sermon.processed_at = None
    sermon.status = UploadStatus.DRAFT
    sermon.summary_regen_state = SummaryRegenState.IDLE
    sermon.summary_regen_error = None
    sermon.summary_regen_run_id = None
    sermon.summary_regen_requested_at = None
    sermon.summary_regen_started_at = None
    sermon.summary_regen_finished_at = None
