# Processing pipeline for a sermon: transcript, then embeddings, then summary.
import time
from collections.abc import Callable
from datetime import UTC, datetime

import click
from flask import current_app
from flask.cli import with_appcontext
from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.sqlite import insert

from tsh import captions, embeddings
from tsh.database import db
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding, UploadStatus
from tsh.queue import enqueue
from tsh.transcripts import transcript_text
from tsh.summarize import summarize_transcript
from tsh.tagging import save_ai_tags, suggest_tags


def dummy_delay(sermon: Sermon) -> None:
    """Sleep for PIPELINE_DUMMY_DELAY seconds (default 0), so the frontend can watch a sermon sit in PROCESSING.

    Only for development until the real steps exist. Remove once S5 to S7 are in.
    """
    delay = float(current_app.config.get("PIPELINE_DUMMY_DELAY", 0))
    if delay > 0:
        time.sleep(delay)


def fetch_transcript(sermon: Sermon) -> None:
    """Save clean YouTube caption text and timed segments; raise CaptionError on failure.

    The pipeline commits both together. Chunking receives the persisted segments on the sermon.
    """
    # Captions off: keep what is saved. process_sermon already held back sermons with nothing saved
    if not captions.captions_enabled():
        return
    # The importer also queues this pipeline, so importing its URL parser here avoids a cycle.
    from tsh.youtube_import import parse_video_id

    video_id = sermon.youtube_video_id or parse_video_id(sermon.video_link)
    if not video_id:
        raise captions.CaptionError(
            "missing YouTube video id; correct the sermon video link, then reprocess"
        )
    segments = captions.get_transcript(video_id)
    sermon.transcript = transcript_text(segments)
    sermon.transcript_segments = segments
    db.session.commit()


def embed_chunks(sermon: Sermon) -> None:
    """Chunk sermon.transcript_segments with source times and store one embedding per chunk.

    Safe to re-run. A chunk is identified by its text and which repeat of that text it
    is (see embeddings.chunk_hash), not by its times. Chunks whose identity is unchanged
    keep their rows and embeddings and only get their start and end updated, chunks that
    no longer appear in the captions are deleted with their embeddings, and only new
    chunks are sent to ollama. Errors from ollama (or ValueError for a bad embedding batch)
    propagate before anything is written, and _run_step records them. A database error
    while replacing rolls back this sermon's whole replace and is raised again.

    Raises EmbeddingError before any ollama call if the vec0 table's dimension is not
    EMBEDDING_DIM, or if this sermon has vectors from a model other than EMBEDDING_MODEL.
    Mixing models would make search compare unrelated vectors, so re-embedding has to
    be deliberate: run `flask reembed` after changing EMBEDDING_MODEL.
    """
    if not sermon.transcript_segments:
        return

    chunks = embeddings.chunk(sermon, sermon.transcript_segments)
    # Segments with only blank text give no chunks. Keep what the sermon already has
    # instead of deleting it, the same as having no segments at all.
    if not chunks:
        return
    # insert().values() takes plain column values, not model objects.
    rows = [
        {
            "sermon_id": chunk.sermon_id,
            "hash": chunk.hash,
            "text": chunk.text,
            "start": chunk.start,
            "end": chunk.end,
        }
        for chunk in chunks
    ]

    embeddings.check_schema_dimension()
    _require_current_model(sermon.id)

    # Embed before writing anything. A slow or failing ollama call then never holds the
    # database write lock, and a failure leaves the old chunks and vectors untouched.
    embedded = set(
        db.session.scalars(
            select(SermonChunk.hash)
            .join(SermonChunkEmbedding)
            .where(SermonChunk.sermon_id == sermon.id)
        )
    )
    missing = [row for row in rows if row["hash"] not in embedded]
    vectors = embeddings.embed_texts([row["text"] for row in missing])

    # One transaction per sermon: either every stale row is gone and every new chunk has
    # its vector, or nothing changed. Only this sermon's rows are touched.
    try:
        stale_ids = select(SermonChunk.id).where(
            SermonChunk.sermon_id == sermon.id,
            SermonChunk.hash.not_in([row["hash"] for row in rows]),
        )
        # sermon_chunk_embedding is a sqlite-vec virtual table, which ignores foreign keys,
        # so ON DELETE CASCADE never fires. Delete the embeddings first or they are orphaned.
        # Virtual tables also reject DELETE RETURNING, which the ORM uses to sync the session.
        db.session.execute(
            delete(SermonChunkEmbedding)
            .where(SermonChunkEmbedding.sermon_chunk_id.in_(stale_ids))
            .execution_options(synchronize_session=False)
        )
        db.session.execute(delete(SermonChunk).where(SermonChunk.id.in_(stale_ids)))

        # Relies on unique (sermon_id, hash). A chunk this sermon already has keeps its id
        # and embedding, and only its times are refreshed, since the text did not change.
        statement = insert(SermonChunk).values(rows)
        db.session.execute(
            statement.on_conflict_do_update(
                index_elements=[SermonChunk.sermon_id, SermonChunk.hash],
                set_={"start": statement.excluded.start, "end": statement.excluded.end},
            )
        )

        by_hash = {
            chunk.hash: chunk
            for chunk in db.session.scalars(
                select(SermonChunk).where(
                    SermonChunk.sermon_id == sermon.id,
                    SermonChunk.hash.in_([row["hash"] for row in missing]),
                )
            )
        }
        db.session.add_all(
            SermonChunkEmbedding(
                sermon_chunk_id=by_hash[row["hash"]].id,
                sermon_chunk=by_hash[row["hash"]],
                embedding=vector,
            )
            for row, vector in zip(missing, vectors, strict=True)
        )
        for row in missing:
            by_hash[row["hash"]].embedding_model = embeddings.EMBEDDING_MODEL
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


def _require_current_model(sermon_id: int) -> None:
    """Raise EmbeddingError if any of the sermon's vectors came from another model."""
    mismatch = db.session.execute(
        _other_model_chunks().where(SermonChunk.sermon_id == sermon_id).limit(1)
    ).first()
    if mismatch is not None:
        raise embeddings.EmbeddingError(
            f"sermon {sermon_id} has vectors from {mismatch.embedding_model or 'an unrecorded model'} "
            f"but EMBEDDING_MODEL is {embeddings.EMBEDDING_MODEL}; run flask reembed"
        )


def _other_model_chunks():
    """Select chunks with a vector from a model other than EMBEDDING_MODEL, or an unrecorded one."""
    return (
        select(SermonChunk.id, SermonChunk.sermon_id, SermonChunk.text, SermonChunk.embedding_model)
        .join(SermonChunkEmbedding)
        .where(
            or_(
                SermonChunk.embedding_model.is_(None),
                SermonChunk.embedding_model != embeddings.EMBEDDING_MODEL,
            )
        )
    )


def reembed_sermon(sermon_id: int) -> int:
    """Replace the sermon's vectors from other models with EMBEDDING_MODEL ones; return how many.

    Runs in one transaction, so a failure leaves the old vectors in place. Raises what
    embed_texts raises, and EmbeddingError if the vec0 dimension is not EMBEDDING_DIM.
    """
    embeddings.check_schema_dimension()
    rows = db.session.execute(
        _other_model_chunks().where(SermonChunk.sermon_id == sermon_id)
    ).all()
    vectors = embeddings.embed_texts([row.text for row in rows])
    try:
        ids = [row.id for row in rows]
        # vec0 has no UPDATE for the vector through the ORM, so delete and insert again.
        db.session.execute(
            delete(SermonChunkEmbedding)
            .where(SermonChunkEmbedding.sermon_chunk_id.in_(ids))
            .execution_options(synchronize_session=False)
        )
        chunks = {c.id: c for c in db.session.scalars(select(SermonChunk).where(SermonChunk.id.in_(ids)))}
        for chunk_id, vector in zip(ids, vectors, strict=True):
            chunks[chunk_id].embedding_model = embeddings.EMBEDDING_MODEL
            db.session.add(
                SermonChunkEmbedding(
                    sermon_chunk_id=chunk_id, sermon_chunk=chunks[chunk_id], embedding=vector
                )
            )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return len(rows)


@click.command("reembed")
@with_appcontext
def reembed_command() -> None:
    """Re-embed every chunk whose vector is not from the configured EMBEDDING_MODEL.

    The deliberate step after changing EMBEDDING_MODEL. Each sermon is replaced in its own
    transaction, so a failure stops the command and leaves that sermon's old vectors.
    Safe to run again: sermons already on the current model are skipped.
    """
    sermon_ids = db.session.scalars(
        select(_other_model_chunks().subquery().c.sermon_id).distinct()
    ).all()
    total = 0
    for sermon_id in sermon_ids:
        try:
            count = reembed_sermon(sermon_id)
        except Exception as e:
            raise click.ClickException(f"sermon {sermon_id}: {str(e) or type(e).__name__}") from e
        total += count
        click.echo(f"sermon {sermon_id}: re-embedded {count} chunks")
    click.echo(f"re-embedded {total} chunks in {len(sermon_ids)} sermons with {embeddings.EMBEDDING_MODEL}")


def summarize_sermon(sermon: Sermon) -> None:
    """Write the AI summary for the sermon. TFH-461
    Neither commits: _run_step commits on success and rolls back on failure, so a 
    sermon never keeps a summary whose tagging failed halfway through.

    Does nothing without a transcript. fetch_transcript owns that failure and reports
    it; raising here too would put a second error on every sermon it could not fetch.
    """
    if not sermon.transcript:
        return
    sermon.summary = summarize_transcript(sermon.transcript)
    save_ai_tags(sermon, suggest_tags(sermon.summary))



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
        current_app.logger.warning(
            "Sermon %s was deleted before it could be processed", sermon_id
        )
        return

    # Set here as well as in start_processing, so a job queued any other way still shows as processing.
    sermon.status = UploadStatus.PROCESSING
    sermon.processing_error = None    
    db.session.commit()

    # Captions off and nothing saved: there is no transcript to build on, so hold it as a draft.
    # A sermon that already has a transcript carries on, so saved captions are never thrown away.
    if not captions.captions_enabled() and not (sermon.transcript or "").strip():
        sermon.status = UploadStatus.DRAFT
        sermon.processing_error = "fetch_transcript: " + captions.DISABLED_MESSAGE
        db.session.commit()
        return

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
            if not sermon:
                return
            sermon.status = UploadStatus.FAILED
            sermon.processing_error = error
            db.session.commit()
            return

    # Search and chat only need the transcript and embeddings, so a failed summary still publishes.
    error = _run_step("summarize_sermon", summarize_sermon, sermon_id)
    sermon = db.session.get(Sermon, sermon_id)
    if not sermon:
        return
    sermon.status = UploadStatus.PUBLISHED
    sermon.processing_error = error
    # The column has no time zone, so store UTC without tzinfo.
    sermon.processed_at = datetime.now(UTC).replace(tzinfo=None)
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
    if not sermon:
        return
    if error:
        sermon.processing_error = error
    elif (sermon.processing_error or "").startswith("summarize_sermon:"):
        sermon.processing_error = None
    db.session.commit()


def _run_step(name: str, step: Callable[[Sermon], None], sermon_id: int) -> str | None:
    """Run one step and commit what it changed. Returns "<name>: <error>" if it raised, else None."""
    sermon = db.session.get(Sermon, sermon_id)
    if not sermon:
        return
    try:
        step(sermon)
        db.session.commit()
        return None
    except Exception as e:
        # Roll back so a half-finished step never gets saved, e.g. a partial summary.
        db.session.rollback()
        current_app.logger.exception("Sermon %s failed at %s", sermon_id, name)
        return f"{name}: {str(e) or type(e).__name__}"
