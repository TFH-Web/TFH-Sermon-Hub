from datetime import date
import pytest
from marshmallow import ValidationError

from tsh.models import Series, Speaker, Tag, TagSource, UploadStatus, Sermon
from tsh.schemas import (
    camelcase,
    series_schema,
    seriess_schema,
    speaker_schema,
    speakers_schema,
    tag_schema,
    tags_schema,
    counted_tag_schema,
    counted_tags_schema,
    sermon_schema,
    sermons_schema,
)


def test_camelcase():
    assert camelcase("video_link") == "videoLink"
    assert camelcase("first_name") == "firstName"
    assert camelcase("last_name") == "lastName"
    assert camelcase("speaker_id") == "speakerId"
    assert camelcase("title") == "title"


def test_series_schema_dump():
    series = Series(id=1, title="Live Your Best Life")
    data = series_schema.dump(series)
    assert data == {"id": 1, "title": "Live Your Best Life"}


def test_series_schema_load():
    data = {"id": 1, "title": "Live Your Best Life"}
    series = series_schema.load(data)
    assert isinstance(series, Series)
    assert series.id == 1
    assert series.title == "Live Your Best Life"


def test_series_schema_validation():
    with pytest.raises(ValidationError) as exc_info:
        series_schema.load({"id": 1})
    assert "title" in exc_info.value.messages


def test_seriess_schema_many():
    series_list = [
        Series(id=1, title="Live Your Best Life"),
        Series(id=2, title="Hope Rising"),
    ]
    data = seriess_schema.dump(series_list)
    assert len(data) == 2
    assert data[0]["title"] == "Live Your Best Life"
    assert data[1]["title"] == "Hope Rising"

    loaded = seriess_schema.load(data)
    assert len(loaded) == 2
    assert loaded[0].title == "Live Your Best Life"
    assert loaded[1].title == "Hope Rising"


def test_speaker_schema_dump():
    speaker = Speaker(id=1, first_name="Dave", last_name="Patterson", role="Lead Speaker")
    data = speaker_schema.dump(speaker)
    assert data == {
        "id": 1,
        "firstName": "Dave",
        "lastName": "Patterson",
        "role": "Lead Speaker",
    }


def test_speaker_schema_load():
    data = {
        "id": 1,
        "firstName": "Dave",
        "lastName": "Patterson",
        "role": "Lead Speaker",
    }
    speaker = speaker_schema.load(data)
    assert isinstance(speaker, Speaker)
    assert speaker.id == 1
    assert speaker.first_name == "Dave"
    assert speaker.last_name == "Patterson"
    assert speaker.role == "Lead Speaker"


def test_speaker_schema_validation():
    with pytest.raises(ValidationError) as exc_info:
        speaker_schema.load({"id": 1, "firstName": "Dave"})
    assert "lastName" in exc_info.value.messages
    assert "role" in exc_info.value.messages


def test_speakers_schema_many():
    speakers = [
        Speaker(id=1, first_name="Dave", last_name="Patterson", role="Lead Speaker"),
        Speaker(id=2, first_name="Jane", last_name="Doe", role="Guest Speaker"),
    ]
    data = speakers_schema.dump(speakers)
    assert len(data) == 2
    assert data[0]["firstName"] == "Dave"
    assert data[1]["firstName"] == "Jane"

    loaded = speakers_schema.load(data)
    assert len(loaded) == 2
    assert loaded[0].first_name == "Dave"
    assert loaded[1].first_name == "Jane"


def test_tag_schema_dump():
    tag = Tag(name="faith", source=TagSource.AI, sermons=[])
    data = tag_schema.dump(tag)
    assert data == {"name": "faith", "source": "ai"}


def test_tag_schema_load():
    data = {"name": "faith", "source": "ai"}
    tag = tag_schema.load(data)
    assert isinstance(tag, Tag)
    assert tag.name == "faith"
    assert tag.source == TagSource.AI
    assert tag.sermons == []


def test_tag_schema_validation():
    with pytest.raises(ValidationError) as exc_info:
        tag_schema.load({"name": "faith", "source": "invalid_source"})
    assert "source" in exc_info.value.messages

    with pytest.raises(ValidationError) as exc_info:
        tag_schema.load({"source": "ai"})
    assert "name" in exc_info.value.messages


def test_tags_schema_many():
    tags = [
        Tag(name="faith", source=TagSource.AI, sermons=[]),
        Tag(name="anxiety", source=TagSource.MANUAL, sermons=[]),
    ]
    data = tags_schema.dump(tags)
    assert len(data) == 2
    assert data[0] == {"name": "faith", "source": "ai"}
    assert data[1] == {"name": "anxiety", "source": "manual"}

    loaded = tags_schema.load(data)
    assert len(loaded) == 2
    assert loaded[0].name == "faith"
    assert loaded[1].source == TagSource.MANUAL


def test_counted_tag_schema_dump():
    tag = Tag(name="faith", source=TagSource.AI, sermons=[])
    tag.count = 12
    data = counted_tag_schema.dump(tag)
    assert data == {"name": "faith", "source": "ai", "count": 12}


def test_counted_tag_schema_load():
    data = {"name": "faith", "source": "ai", "count": 12}
    tag = counted_tag_schema.load(data)
    assert isinstance(tag, Tag)
    assert tag.name == "faith"
    assert tag.source == TagSource.AI


def test_counted_tags_schema_many():
    tags = [
        Tag(name="faith", source=TagSource.AI, sermons=[]),
        Tag(name="grace", source=TagSource.AI, sermons=[]),
    ]
    tags[0].count = 5
    tags[1].count = 3
    data = counted_tags_schema.dump(tags)
    assert len(data) == 2
    assert data[0]["count"] == 5
    assert data[1]["count"] == 3


def test_sermon_schema_dump():
    speaker = Speaker(id=1, first_name="Dave", last_name="Patterson", role="Lead Speaker")
    series = Series(id=2, title="Hope Rising")
    tag = Tag(name="faith", source=TagSource.AI, sermons=[])
    sermon = Sermon(
        id=1,
        title="Bold Faith",
        video_link="https://youtu.be/test",
        duration=2500,
        date=date(2026, 1, 19),
        description="A sermon about faith",
        tags=[tag],
        transcript="Test transcript",
        summary="Test summary",
        speaker_id=1,
        speaker=speaker,
        series_id=2,
        series=series,
        status=UploadStatus.PUBLISHED,
    )
    data = sermon_schema.dump(sermon)
    assert data["id"] == 1
    assert data["title"] == "Bold Faith"
    assert data["videoLink"] == "https://youtu.be/test"
    assert data["duration"] == 2500
    assert data["date"] == "2026-01-19"
    assert data["description"] == "A sermon about faith"
    assert data["speaker"]["firstName"] == "Dave"
    assert data["series"]["title"] == "Hope Rising"
    assert data["tags"] == [{"name": "faith", "source": "ai"}]
    assert data["transcript"] == "Test transcript"
    assert data["summary"] == "Test summary"
    assert data["status"] == "Published"


def test_sermon_schema_load():
    data = {
        "id": 1,
        "title": "Bold Faith",
        "videoLink": "https://youtu.be/test",
        "duration": 2500,
        "date": "2026-01-19",
        "description": "A sermon about faith",
        "tags": [{"name": "faith", "source": "ai"}],
        "speaker": {
            "id": 1,
            "firstName": "Dave",
            "lastName": "Patterson",
            "role": "Lead Speaker",
        },
        "series": {"id": 2, "title": "Hope Rising"},
        "status": "Published",
        "transcript": "Test transcript",
        "summary": "Test summary",
    }
    sermon = sermon_schema.load(data)
    assert isinstance(sermon, Sermon)
    assert sermon.id == 1
    assert sermon.title == "Bold Faith"
    assert sermon.speaker_id == 1
    assert sermon.series_id == 2
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.date == date(2026, 1, 19)


def test_sermon_schema_load_null_series():
    data = {
        "id": 2,
        "title": "Standalone Sermon",
        "videoLink": "https://youtu.be/standalone",
        "duration": 1800,
        "date": "2026-02-01",
        "description": "No series sermon",
        "tags": [],
        "speaker": {
            "id": 1,
            "firstName": "Dave",
            "lastName": "Patterson",
            "role": "Lead Speaker",
        },
        "series": None,
        "status": "Draft",
    }
    sermon = sermon_schema.load(data)
    assert isinstance(sermon, Sermon)
    assert sermon.series is None
    assert sermon.series_id is None
    assert sermon.transcript is None
    assert sermon.summary is None
    assert sermon.status == UploadStatus.DRAFT


def test_sermon_schema_validation():
    with pytest.raises(ValidationError) as exc_info:
        sermon_schema.load({"title": "Incomplete"})
    errors = exc_info.value.messages
    assert "videoLink" in errors
    assert "duration" in errors
    assert "date" in errors
    assert "description" in errors
    assert "speaker" in errors
    assert "status" in errors

    # Invalid status
    with pytest.raises(ValidationError) as exc_info:
        sermon_schema.load({
            "id": 1,
            "title": "Title",
            "videoLink": "https://youtu.be/test",
            "duration": 100,
            "date": "2026-01-01",
            "description": "Desc",
            "tags": [],
            "speaker": {
                "id": 1,
                "firstName": "A",
                "lastName": "B",
                "role": "C",
            },
            "status": "InvalidStatus",
        })
    assert "status" in exc_info.value.messages


def test_sermons_schema_many():
    speaker = Speaker(id=1, first_name="Dave", last_name="Patterson", role="Lead Speaker")
    sermons = [
        Sermon(
            id=1,
            title="Sermon 1",
            video_link="https://youtu.be/1",
            duration=1000,
            date=date(2026, 1, 1),
            description="Desc 1",
            tags=[],
            transcript=None,
            summary=None,
            speaker_id=1,
            speaker=speaker,
            series_id=None,
            series=None,
            status=UploadStatus.PUBLISHED,
        ),
        Sermon(
            id=2,
            title="Sermon 2",
            video_link="https://youtu.be/2",
            duration=2000,
            date=date(2026, 1, 2),
            description="Desc 2",
            tags=[],
            transcript=None,
            summary=None,
            speaker_id=1,
            speaker=speaker,
            series_id=None,
            series=None,
            status=UploadStatus.DRAFT,
        ),
    ]
    data = sermons_schema.dump(sermons)
    assert len(data) == 2
    assert data[0]["title"] == "Sermon 1"
    assert data[1]["title"] == "Sermon 2"

    loaded = sermons_schema.load(data)
    assert len(loaded) == 2
    assert loaded[0].title == "Sermon 1"
    assert loaded[1].title == "Sermon 2"
