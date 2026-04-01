from dataclasses import asdict
from enum import Enum
from datetime import date
from tsh.database import db
from sqlalchemy import (
    String,
    UniqueConstraint,
    ForeignKey,
    Column,
    FetchedValue,
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.util.typing import Annotated
from typing import Optional, List, Any, Iterable

intpk = Annotated[int, mapped_column(primary_key=True, server_default=FetchedValue())]
str32 = Annotated[str, mapped_column(String(32))]
str64 = Annotated[str, mapped_column(String(64))]


class Series(db.Model):  # ty: ignore[unsupported-base]
    id: Mapped[intpk]
    title: Mapped[Optional[str32]] = mapped_column(unique=True)


class Speaker(db.Model):  # ty: ignore[unsupported-base]
    id: Mapped[intpk]
    first_name: Mapped[Optional[str64]]
    last_name: Mapped[Optional[str64]]
    __table_args__ = (UniqueConstraint("first_name", "last_name"),)


sermon_tag_m2m = db.Table(
    "Sermon_Tag",
    Column(
        "sermon_id",
        ForeignKey("sermon.id", onupdate="CASCADE", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_name",
        ForeignKey("tag.name", onupdate="CASCADE", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class TagSource(Enum):
    AI = "ai"
    MANUAL = "manual"


class Tag(db.Model):  # ty: ignore[unsupported-base]
    name: Mapped[str32] = mapped_column(primary_key=True)
    source: Mapped[TagSource] = mapped_column(
        SAEnum(TagSource, create_constraint=True, validate_strings=True)
    )


class UploadStatus(Enum):
    DRAFT = "draft"
    PROCESSING = "processing"
    PUBLISHED = "published"
    FAILED = "failed"


class Sermon(db.Model):  # ty: ignore[unsupported-base]
    id: Mapped[intpk]
    title: Mapped[str64]
    video_link: Mapped[str32]
    duration: Mapped[int]
    date: Mapped[date]
    description: Mapped[str]
    tags: Mapped[List[Tag]] = relationship(secondary=sermon_tag_m2m)
    transcript: Mapped[Optional[str]]
    summary: Mapped[Optional[str]]
    speaker_id: Mapped[int] = mapped_column(
        ForeignKey(Speaker.id, onupdate="CASCADE", ondelete="RESTRICT")
    )
    speaker: Mapped[Speaker] = relationship()
    series_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(Series.id, onupdate="CASCADE", ondelete="RESTRICT")
    )
    series: Mapped[Optional[Series]] = relationship()
    status: Mapped[UploadStatus] = mapped_column(
        SAEnum(UploadStatus, create_constraint=True, validate_strings=True),
        default=UploadStatus.DRAFT,
    )


def serialize_to_dict(obj: Any) -> dict:
    def dict_enum_factory(data):
        def convert_value(obj):
            if isinstance(obj, Enum):
                return obj.value
            return obj

        return {k: convert_value(v) for k, v in data}

    return asdict(obj, dict_factory=dict_enum_factory)


def serialize_many_to_dicts(objs: Iterable[Any]) -> List[dict]:
    return [serialize_to_dict(obj) for obj in objs]
