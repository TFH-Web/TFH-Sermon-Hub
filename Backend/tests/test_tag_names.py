"""Accepted tag names must remain addressable without URL path normalization."""

import pytest

from tsh.database import db
from tsh.models import Sermon, Tag, TagSource


SPECIAL_NAMES = [
    "faith/grace",
    "/faith",
    "//faith//grace/",
    "/",
    "//",
    ".",
    "..",
    "grace/../hope",
    "faith?why#hope&love=1+2%",
    "literal%2Fslash",
    "résurrection/神",
]


@pytest.mark.parametrize("name", SPECIAL_NAMES)
def test_accepted_name_round_trip_preserves_associations_and_filters(client, name):
    response = client.post("/api/tags", json={"name": f"  {name}  "})
    assert response.status_code == 201
    assert response.json == {"name": name, "source": "manual"}

    sermon = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()
    sermon_id = sermon.id
    original_tags = {tag.name for tag in sermon.tags}
    original_sermon_count = db.session.scalar(db.select(db.func.count()).select_from(Sermon))
    sermon.tags.append(db.session.get(Tag, name))
    db.session.commit()

    renamed = name + "/renewed"
    response = client.patch(
        "/api/tags", query_string={"name": name}, json={"newName": f"  {renamed}  "}
    )
    assert response.status_code == 200
    assert response.json == {"name": renamed, "source": "manual"}
    db.session.expire_all()
    assert db.session.get(Tag, name) is None
    assert db.session.get(Tag, renamed) is not None
    assert {tag["name"] for tag in client.get(f"/api/sermons/{sermon_id}").json["tags"]} == original_tags | {renamed}
    used = {tag["name"]: tag for tag in client.get("/api/tags?used=true").json}
    assert name not in used
    assert used[renamed]["count"] == 1
    filtered = client.get(
        "/api/sermons", query_string={"topic": renamed, "page": 1, "pageSize": 1}
    )
    assert filtered.status_code == 200
    assert filtered.json["total"] == 1
    assert [item["id"] for item in filtered.json["items"]] == [sermon_id]

    assert client.delete("/api/tags", query_string={"name": renamed}).status_code == 204
    db.session.expire_all()
    assert db.session.get(Tag, renamed) is None
    assert db.session.scalar(db.select(db.func.count()).select_from(Sermon)) == original_sermon_count
    assert {tag["name"] for tag in client.get(f"/api/sermons/{sermon_id}").json["tags"]} == original_tags
    assert renamed not in {tag["name"] for tag in client.get("/api/tags?used=true").json}


def test_preexisting_slash_tag_keeps_its_source_when_renamed(client):
    old = Tag(name="//already/saved/", source=TagSource.AI, sermons=[])
    db.session.add(old)
    db.session.commit()

    response = client.patch(
        "/api/tags", query_string={"name": old.name}, json={"newName": "../still/manageable"}
    )
    assert response.status_code == 200
    assert response.json == {"name": "../still/manageable", "source": "ai"}
    assert client.delete("/api/tags", query_string={"name": "../still/manageable"}).status_code == 204


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
@pytest.mark.parametrize("query", [None, {"name": ""}, {"name": " \t "}])
def test_query_mutations_reject_missing_or_blank_identifiers(client, method, query):
    response = client.open(
        "/api/tags", method=method, query_string=query, json={"newName": "untouched"}
    )
    assert response.status_code == 422
    assert response.is_json
    assert response.json["errors"]["name"] == ["Tag name is required"]
    assert db.session.get(Tag, "grace") is not None


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
def test_query_mutations_report_missing_tags_without_changing_anything(client, method):
    response = client.open(
        "/api/tags", method=method, query_string={"name": "/missing/tag"}, json={"newName": "unused"}
    )
    assert response.status_code == 404
    assert response.is_json
    assert db.session.get(Tag, "unused") is None


@pytest.mark.parametrize("role,status", [("none", 401), ("Internal User", 403), ("InternalUser", 403), ("Nobody", 403)])
@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
def test_query_mutations_stay_admin_only(client, role, status, method):
    response = client.open(
        "/api/tags", method=method, query_string={"name": "grace"},
        json={"newName": "untouched"}, headers={"X-Test-Roles": role},
    )
    assert response.status_code == status
    assert response.is_json
    assert response.json["error"] and response.json["message"]
    assert db.session.get(Tag, "grace") is not None
    assert db.session.get(Tag, "untouched") is None


def test_query_rename_retains_duplicate_validation(client):
    response = client.patch(
        "/api/tags", query_string={"name": "grace"}, json={"newName": "  FAITH  "}
    )
    assert response.status_code == 422
    assert "newName" in response.json["errors"]
    assert db.session.get(Tag, "grace") is not None


def test_legacy_path_identifier_still_takes_precedence(client):
    response = client.patch(
        "/api/tags/grace", query_string={"name": "faith"}, json={"newName": "still-grace"}
    )
    assert response.status_code == 200
    assert db.session.get(Tag, "faith") is not None
    assert client.delete("/api/tags/still-grace").status_code == 204
