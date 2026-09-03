from __future__ import annotations

from dataclasses import asdict
from datetime import date
from enum import Enum
from typing import Any, Iterable, List, Optional

from sqlalchemy import (
    Column,
    FetchedValue,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, query_expression
from sqlalchemy.util.typing import Annotated

from tsh.database import db

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
    sermons: Mapped[List[Sermon]] = relationship(
        secondary=sermon_tag_m2m, back_populates="tags"
    )
    count: Mapped[int] = query_expression()


class UploadStatus(Enum):
    DRAFT = "Draft"
    PROCESSING = "Processing"
    PUBLISHED = "Published"
    FAILED = "Failed"


class Sermon(db.Model):  # ty: ignore[unsupported-base]
    id: Mapped[intpk]
    title: Mapped[str64]
    video_link: Mapped[str32]
    duration: Mapped[int]
    date: Mapped[date]
    description: Mapped[str]
    tags: Mapped[List[Tag]] = relationship(
        secondary=sermon_tag_m2m, back_populates="sermons"
    )
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
