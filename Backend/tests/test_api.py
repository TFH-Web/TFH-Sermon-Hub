import json

import pytest  # noqa: F401
from flask.testing import FlaskClient
from syrupy.data import Snapshot

from tsh.schemas import (
    series_schema,
    seriess_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
    speakers_schema,
)


def test_series(client: FlaskClient, snapshot: Snapshot):
    from tsh.models import Series

    res = client.get("/series")
    seriess: list[Series] = seriess_schema.loads(res.data)
    assert seriess == snapshot

    for series in seriess:
        res = client.get(f"/series/{series.id}")
        res_series: Series = series_schema.loads(res.data)
        assert res_series == series


def test_speakers(client, snapshot):
    from tsh.models import Speaker

    res = client.get("/speakers")
    speakers: list[Speaker] = speakers_schema.loads(res.data)
    assert speakers == snapshot

    for speaker in speakers:
        res = client.get(f"/speakers/{speaker.id}")
        res_speaker: Speaker = speaker_schema.loads(res.data)
        assert res_speaker == speaker


def test_sermons(client, snapshot):
    from tsh.models import Sermon

    res = client.get("/sermons")
    sermons: list[Sermon] = sermons_schema.loads(res.data)
    assert sermons == snapshot

    for sermon in sermons:
        res = client.get(f"/sermons/{sermon.id}")
        res_sermon: Sermon = sermon_schema.loads(res.data())
        assert res_sermon == sermon


def test_get_id_404(client):
    paths = [
        "/series",
        "/speakers",
        "/sermons",
    ]

    for path in paths:
        res = client.get(f"{path}/1000")
        assert res.status == "404 NOT FOUND"
