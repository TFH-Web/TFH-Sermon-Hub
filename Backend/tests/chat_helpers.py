# Shared setup for chat tests: sermons with fixed, topic-based embeddings and no ollama.
from datetime import date
from types import SimpleNamespace

from tsh import embeddings
from tsh.database import db
from tsh.embeddings import EMBEDDING_DIM
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding, Speaker, UploadStatus

# Each topic word gets its own axis, so cosine distance is 0 for the same topic and 1 for
# different ones. Text with no topic word points along OTHER, away from every topic.
TOPICS = ["grace", "faith", "hope", "money"]
OTHER = len(TOPICS)


def topic_vector(text: str) -> list[float]:
    """Return a unit vector on the axis of the first topic word in text, or OTHER."""
    lowered = text.lower()
    axis = next((i for i, topic in enumerate(TOPICS) if topic in lowered), OTHER)
    vector = [0.0] * EMBEDDING_DIM
    vector[axis] = 1.0
    return vector


def use_topic_embeddings(monkeypatch) -> None:
    """Make ollama.embed return topic_vector for every input."""
    monkeypatch.setattr(
        "ollama.embed",
        lambda model, input, **kw: SimpleNamespace(embeddings=[topic_vector(t) for t in input]),
    )


def add_sermon(
    title: str,
    chunks: list[tuple[str, float, float]],
    status: UploadStatus = UploadStatus.PUBLISHED,
    video_id: str | None = "abcdefghijk",
    model: str | None = None,
) -> Sermon:
    """Save a sermon with the given (text, start, end) chunks, each embedded by topic_vector."""
    speaker = db.session.scalars(db.select(Speaker)).first()
    sermon = Sermon(
        id=None,
        title=title,
        video_link=f"https://youtu.be/{video_id}" if video_id else "",
        duration=600,
        speaker_id=None,
        series_id=None,
        speaker=speaker,
        series=None,
        date=date(2026, 9, 6),
        description="",
        tags=[],
        transcript=None,
        summary=None,
        status=status,
        youtube_video_id=video_id,
    )
    db.session.add(sermon)
    db.session.flush()
    for i, (text, start, end) in enumerate(chunks):
        chunk = SermonChunk(
            id=None,
            sermon_id=sermon.id,
            sermon=sermon,
            hash=f"{sermon.id}-{i}".ljust(32, "0"),
            text=text,
            start=start,
            end=end,
            embedding_model=model or embeddings.EMBEDDING_MODEL,
        )
        db.session.add(chunk)
        db.session.flush()
        db.session.add(
            SermonChunkEmbedding(
                sermon_chunk_id=chunk.id, sermon_chunk=chunk, embedding=topic_vector(text)
            )
        )
    db.session.commit()
    return sermon
