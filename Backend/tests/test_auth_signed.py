"""Real JWT validation with a local JWKS, not a token-decoder bypass."""

import ssl
import time
import urllib.error
import urllib.request
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Flask
from jwt.algorithms import RSAAlgorithm

from tsh import create_app
from tsh.auth import init_auth


@pytest.fixture(scope="module")
def private_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def local_jwks(app, monkeypatch, private_key):
    jwk = RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk.update(kid="test-key", use="sig")
    monkeypatch.setattr(
        app.extensions["entra_jwks"], "fetch_data", lambda: {"keys": [jwk]}
    )


@pytest.fixture()
def signed_client(monkeypatch, private_key):
    app = create_app(
        None,
        settings={
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "TENANT_ID": "test-tenant",
            "ENTRA_API_AUDIENCE": "test-api",
            "ENTRA_API_SCOPE": "access_as_user",
        },
    )
    local_jwks(app, monkeypatch, private_key)
    return app.test_client()


def token(private_key, **overrides):
    now = int(time.time())
    claims = {
        "iss": "https://login.microsoftonline.com/test-tenant/v2.0",
        "aud": "test-api",
        "tid": "test-tenant",
        "ver": "2.0",
        "sub": "test-user",
        "iat": now,
        "nbf": now,
        "exp": now + 300,
        "scp": "access_as_user",
        "roles": ["InternalUser"],
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(
        claims, private_key, algorithm="RS256", headers={"kid": "test-key"}
    )


@pytest.mark.parametrize("role", ["Internal User", "InternalUser", "Admin"])
def test_signed_staff_roles(signed_client, private_key, role):
    response = signed_client.get(
        "/api/whoami",
        headers={"Authorization": f"Bearer {token(private_key, roles=[role])}"},
    )
    assert response.status_code == 200
    assert response.json["roles"] == (
        ["Internal User"] if role == "InternalUser" else [role]
    )


@pytest.mark.parametrize(
    "claims,status",
    [
        ({"exp": 1}, 401),
        ({"exp": None}, 401),
        ({"aud": "other-api"}, 401),
        ({"iss": "https://attacker.example"}, 401),
        ({"tid": "other-tenant"}, 401),
        ({"ver": "1.0"}, 401),
        ({"nbf": 9999999999}, 401),
        ({"scp": None}, 401),  # ID tokens are not API access tokens.
        ({"roles": "Admin"}, 401),
        ({"roles": [1]}, 401),
        ({"roles": []}, 403),
        ({"roles": ["Nobody"]}, 403),
        ({"roles": ["NotAdmin"]}, 403),
        ({"scp": "other_scope"}, 403),
    ],
)
def test_invalid_claims(signed_client, private_key, claims, status):
    response = signed_client.get(
        "/api/whoami",
        headers={"Authorization": f"Bearer {token(private_key, **claims)}"},
    )
    assert response.status_code == status
    assert response.json["error"] == response.json["message"]


@pytest.mark.parametrize(
    "authorization", [None, "Bearer", "Bearer junk", "Basic junk", "Bearer a b"]
)
def test_missing_or_malformed_token(signed_client, authorization):
    headers = {"X-Test-Roles": "Admin"}
    if authorization:
        headers["Authorization"] = authorization
    response = signed_client.get("/api/whoami", headers=headers)
    assert response.status_code == 401  # TESTING=True alone cannot bypass auth.
    assert response.json["error"] == response.json["message"]


def test_lowercase_bearer_scheme_is_accepted(signed_client, private_key):
    # The auth scheme is case-insensitive (RFC 9110), so a valid token still works.
    response = signed_client.get(
        "/api/whoami", headers={"Authorization": f"bearer {token(private_key)}"}
    )
    assert response.status_code == 200


def test_unsigned_alg_none_token_is_rejected(signed_client):
    now = int(time.time())
    unsigned = jwt.encode(
        {
            "iss": "https://login.microsoftonline.com/test-tenant/v2.0",
            "aud": "test-api",
            "tid": "test-tenant",
            "ver": "2.0",
            "iat": now,
            "nbf": now,
            "exp": now + 300,
            "scp": "access_as_user",
            "roles": ["Admin"],
        },
        None,
        algorithm="none",
        headers={"kid": "test-key"},
    )
    response = signed_client.get(
        "/api/whoami", headers={"Authorization": f"Bearer {unsigned}"}
    )
    assert response.status_code == 401


def test_required_scope_among_several_is_accepted(signed_client, private_key):
    # Entra lists every granted delegated scope in one space-separated scp claim.
    response = signed_client.get(
        "/api/whoami",
        headers={
            "Authorization": f"Bearer {token(private_key, scp='openid profile access_as_user')}"
        },
    )
    assert response.status_code == 200


def test_wrong_signature(signed_client):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    response = signed_client.get(
        "/api/whoami", headers={"Authorization": f"Bearer {token(other_key)}"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "error",
    [
        ConnectionResetError("jwks-outage-detail"),
        ssl.SSLError("jwks-outage-detail"),
        urllib.error.URLError("jwks-outage-detail"),
    ],
)
def test_jwks_outage_is_unauthorized(signed_client, private_key, monkeypatch, error):
    # Use the real PyJWT key fetch again, but make the network call itself fail.
    monkeypatch.delattr(
        signed_client.application.extensions["entra_jwks"], "fetch_data"
    )

    def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", fail)
    response = signed_client.get(
        "/api/whoami", headers={"Authorization": f"Bearer {token(private_key)}"}
    )
    assert response.status_code == 401
    assert "jwks-outage-detail" not in response.get_data(as_text=True)


def test_test_headers_ignored_outside_testing(signed_client):
    signed_client.application.config.update(TESTING=False, AUTH_TEST_BYPASS=True)
    assert (
        signed_client.get("/api/whoami", headers={"X-Test-Roles": "Admin"}).status_code
        == 401
    )


def test_production_bypass_misconfiguration_fails_startup():
    app = Flask(__name__)
    app.config["AUTH_TEST_BYPASS"] = True
    with pytest.raises(RuntimeError, match="never enable"):
        init_auth(app)


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/sermons"),
        ("PATCH", "/api/sermons/1"),
        ("DELETE", "/api/sermons/1"),
        ("POST", "/api/sermons/1/reprocess"),
        ("POST", "/api/sermons/1/regenerate-summary"),
        ("POST", "/api/import/youtube"),
        ("POST", "/api/import/youtube/video"),
    ],
)
@pytest.mark.parametrize("role", ["Internal User", "InternalUser", "Admin"])
def test_mutation_permission_matrix(
    app, client, monkeypatch, private_key, method, path, role
):
    app.config.update(
        AUTH_TEST_BYPASS=False,
        TENANT_ID="test-tenant",
        ENTRA_API_AUDIENCE="test-api",
        ENTRA_API_SCOPE="access_as_user",
    )
    init_auth(app)
    local_jwks(app, monkeypatch, private_key)
    monkeypatch.setattr("tsh.views.start_processing", lambda sermon: None)
    monkeypatch.setattr(
        "tsh.views.enqueue", lambda *a, **k: SimpleNamespace(as_dict=lambda: {})
    )
    response = client.open(
        path,
        method=method,
        json={},
        headers={"Authorization": f"Bearer {token(private_key, roles=[role])}"},
    )
    if role == "Admin":
        assert response.status_code in (200, 201, 202, 204, 400, 409, 422)
    else:
        assert response.status_code == 403
        assert response.json["error"] == response.json["message"]
    assert client.open(path, method=method, json={}).status_code == 401
