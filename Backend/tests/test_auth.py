import pytest
from flask.testing import FlaskClient

PROTECTED_ROUTES = [
    "/api/series",
    "/api/speakers",
    "/api/sermons",
    "/api/tags",
    "/api/search",
]


def test_protected_routes_require_token(client: FlaskClient):
    """Test that all protected routes require a valid token."""
    for route in PROTECTED_ROUTES:
        response = client.get(route, headers={"X-Test-Roles": "none"})
        assert response.status_code == 401, f"Route {route} did not return 401 for missing token"
        assert response.is_json
        assert "error" in response.json

def test_protected_routes_reject_wrong_role(client: FlaskClient):
    """Valid Tokens for the wrong role triggers 403"""
    for route in PROTECTED_ROUTES:
        response = client.get(route, headers={"X-Test-Roles": "Nobody"})
        assert response.status_code == 403, f"Route {route} did not return 403 for wrong role"
        assert response.is_json
        assert "error" in response.json

def test_protected_routes_allow_internal_user(client: FlaskClient):
    for route in PROTECTED_ROUTES:
        response = client.get(route, headers={"X-Test-Roles": "Internal User"})
        assert response.status_code == 200, f"Route {route} did not allow Internal User"

def test_protected_routes_allow_admin(client: FlaskClient):
    for route in PROTECTED_ROUTES:
        response = client.get(route, headers={"X-Test-Roles": "Admin"})
        assert response.status_code == 200, f"Route {route} did not allow Admin"

def test_public_routes_stay_public(client: FlaskClient):
    for route in ["/api/", "/api/health"]:
        response = client.get(route, headers={"X-Test-Roles": "none"})
        assert response.status_code == 200, f"Public route {route} did not stay public"