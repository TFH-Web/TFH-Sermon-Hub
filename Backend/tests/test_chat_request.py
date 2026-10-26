# Tests for POST /api/chat request validation, size limits and authorization.
import io

import pytest
from flask.testing import FlaskClient

from tsh.chat import (
    MAX_HISTORY_CHARS,
    MAX_HISTORY_TURNS,
    MAX_MESSAGE_CHARS,
    MAX_REQUEST_BYTES,
    UNSUPPORTED_ANSWER,
)


def post(client: FlaskClient, body, **headers):
    return client.post("/api/chat", json=body, headers=headers)


def turn(role: str = "user", content: str = "What is grace?") -> dict:
    return {"role": role, "content": content}


def test_valid_request_is_accepted(client: FlaskClient):
    res = post(client, {"message": "What is grace?", "sermonId": 1, "history": [turn(), turn("assistant", "Grace is...")]})

    assert res.status_code == 200
    assert res.json["ai_generated"] is True


def test_message_alone_is_enough(client: FlaskClient):
    res = post(client, {"message": "What is grace?"})

    assert res.status_code == 200
    assert res.json["answer"] == UNSUPPORTED_ANSWER


def test_null_sermon_id_means_all_sermons(client: FlaskClient):
    assert post(client, {"message": "hi", "sermonId": None}).status_code == 200


def test_limits_are_inclusive(client: FlaskClient):
    body = {
        "message": "m" * MAX_MESSAGE_CHARS,
        "history": [turn(content="h" * MAX_HISTORY_CHARS)] * MAX_HISTORY_TURNS,
    }
    assert post(client, body).status_code == 200


@pytest.mark.parametrize(
    "body, field",
    [
        ({}, "message"),
        ({"message": ""}, "message"),
        ({"message": "   "}, "message"),
        ({"message": 42}, "message"),
        ({"message": "m" * (MAX_MESSAGE_CHARS + 1)}, "message"),
        ({"message": "hi", "sermonId": "3"}, "sermonId"),
        ({"message": "hi", "sermonId": 2.5}, "sermonId"),
        ({"message": "hi", "sermonId": True}, "sermonId"),
        ({"message": "hi", "sermonId": 0}, "sermonId"),
        ({"message": "hi", "history": "earlier"}, "history"),
        ({"message": "hi", "history": [turn()] * (MAX_HISTORY_TURNS + 1)}, "history"),
        ({"message": "hi", "history": [turn("system")]}, "history"),
        ({"message": "hi", "history": [turn("user", "")]}, "history"),
        ({"message": "hi", "history": [turn("user", "  ")]}, "history"),
        ({"message": "hi", "history": [turn(content="h" * (MAX_HISTORY_CHARS + 1))]}, "history"),
        ({"message": "hi", "history": [{"role": "user"}]}, "history"),
        ({"message": "hi", "history": ["What is grace?"]}, "history"),
        ({"message": "hi", "sermonID": 3}, "sermonID"),
    ],
)
def test_invalid_body_is_rejected(client: FlaskClient, body, field):
    res = post(client, body)

    assert res.status_code == 400
    assert res.json["error"] == res.json["message"] == "Invalid chat request."
    assert field in res.json["errors"]


@pytest.mark.parametrize("data", ["[]", '"hello"', "null", "not json"])
def test_non_object_body_is_rejected(client: FlaskClient, data):
    res = client.post("/api/chat", data=data, content_type="application/json")

    assert res.status_code == 400
    assert "_schema" in res.json["errors"]


def test_oversized_body_is_rejected(client: FlaskClient):
    res = client.post(
        "/api/chat",
        data=b'{"message": "' + b"m" * MAX_REQUEST_BYTES + b'"}',
        content_type="application/json",
    )

    assert res.status_code == 413
    assert res.json["error"] == res.json["message"]


def test_oversized_chunked_body_is_rejected(client: FlaskClient):
    """A streamed body with no Content-Length is still capped by the bytes read."""
    body = b'{"message": "' + b"m" * MAX_REQUEST_BYTES + b'"}'
    res = client.post(
        "/api/chat",
        input_stream=io.BytesIO(body),
        content_type="application/json",
        headers={"Transfer-Encoding": "chunked"},
        # Servers that accept chunked bodies set this; without it Werkzeug reads nothing.
        environ_overrides={"wsgi.input_terminated": True},
    )

    assert res.status_code == 413
    assert res.json["error"] == res.json["message"]


def test_no_token_is_401(client: FlaskClient):
    res = post(client, {"message": "hi"}, **{"X-Test-Roles": "none"})
    assert res.status_code == 401


def test_wrong_role_is_403(client: FlaskClient):
    res = post(client, {"message": "hi"}, **{"X-Test-Roles": "Guest"})
    assert res.status_code == 403


@pytest.mark.parametrize("role", ["Internal User", "InternalUser", "Admin"])
def test_staff_roles_are_allowed(client: FlaskClient, role):
    res = post(client, {"message": "hi"}, **{"X-Test-Roles": role})
    assert res.status_code == 200
