import pytest  # noqa: F401
import json


def test_series(client, snapshot):
    from tsh.models import Series

    res = client.get("/series")
    series = [Series(**dict) for dict in json.loads(res.data)]
    assert series == snapshot

    for series in series:
        res = client.get(f"/series/{series.id}")
        res_series = Series(**json.loads(res.data))
        assert res_series == series


def test_speakers(client, snapshot):
    from tsh.models import Speaker

    res = client.get("/speakers")
    speakers = [Speaker(**dict) for dict in json.loads(res.data)]
    assert speakers == snapshot

    for speaker in speakers:
        res = client.get(f"/speakers/{speaker.id}")
        res_speakers = Speaker(**json.loads(res.data))
        assert res_speakers == speaker


def test_sermons(client, snapshot):
    from tsh.models import Sermon

    res = client.get("/sermons")
    sermons = [Sermon(**dict) for dict in json.loads(res.data)]
    assert sermons == snapshot

    for sermon in sermons:
        res = client.get(f"/sermons/{sermon.id}")
        res_sermon = Sermon(**json.loads(res.data))
        assert res_sermon == sermon


def test_get_id_404(client):
    paths = [
        '/series',
        '/speakers',
        '/sermons',
    ]

    for path in paths:
        res = client.get(f'{path}/1000')
        assert res.status == '404 NOT FOUND'
