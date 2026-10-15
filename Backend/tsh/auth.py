import os
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request
from jwt import PyJWKClient


def init_auth(app):
    """Keep identity configuration per app, not frozen at module import time."""
    app.config.setdefault("TENANT_ID", os.environ.get("TENANT_ID", ""))
    app.config.setdefault(
        "ENTRA_API_AUDIENCE",
        os.environ.get("ENTRA_API_AUDIENCE") or os.environ.get("CLIENT_ID", ""),
    )
    app.config.setdefault(
        "ENTRA_API_SCOPE", os.environ.get("ENTRA_API_SCOPE", "access_as_user")
    )
    app.config.setdefault("AUTH_TEST_BYPASS", False)
    if app.config["AUTH_TEST_BYPASS"] and not app.testing:
        raise RuntimeError(
            "AUTH_TEST_BYPASS requires TESTING=True; never enable it on a server"
        )
    tenant = app.config["TENANT_ID"]
    app.extensions["entra_jwks"] = PyJWKClient(
        f"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys"
    )


def canonical_role(role):
    # Explicit aliases only: never grant an unknown or partially matching role.
    return "Internal User" if role == "InternalUser" else role


def parse_role_from_token():
    g.current_user_role = None
    # Test convenience is opt-in; TESTING alone never bypasses real validation.
    if current_app.testing and current_app.config["AUTH_TEST_BYPASS"] is True:
        test_roles = request.headers.get("X-Test-Roles", "Admin,Internal User")
        if test_roles.strip().lower() != "none":
            g.current_user_role = [
                canonical_role(r.strip()) for r in test_roles.split(",")
            ]
        return

    try:
        scheme, token = request.headers.get("Authorization", "").split()
        if scheme.lower() != "bearer":
            raise ValueError("Missing bearer token")
        tenant = current_app.config["TENANT_ID"]
        audience = current_app.config["ENTRA_API_AUDIENCE"]
        scope = current_app.config["ENTRA_API_SCOPE"]
        if not tenant or not audience or not scope:
            raise ValueError("API identity configuration is incomplete")
        signing_key = current_app.extensions["entra_jwks"].get_signing_key_from_jwt(
            token
        )
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=f"https://login.microsoftonline.com/{tenant}/v2.0",
            options={
                "require": ["exp", "iat", "nbf", "iss", "aud", "tid", "ver", "scp"]
            },
        )
        if claims["tid"] != tenant or claims["ver"] != "2.0":
            raise ValueError("Wrong tenant or token version")
        scopes = claims["scp"]
        roles = claims.get("roles", [])
        if (
            not isinstance(scopes, str)
            or not isinstance(roles, list)
            or any(not isinstance(role, str) for role in roles)
        ):
            raise ValueError("Invalid access-token claims")
        g.current_user_role = (
            [canonical_role(role) for role in roles] if scope in scopes.split() else []
        )
    except (jwt.PyJWTError, ValueError, TypeError):
        # Never return/log bearer tokens or identity-provider exception details.
        g.current_user_role = None


def require_role(*accepted_roles):
    def decorator(function_to_wrap):
        @wraps(function_to_wrap)
        def check_role_then_run(*args, **kwargs):
            parse_role_from_token()

            if g.current_user_role is None:
                message = "Missing or invalid token. Please log in."
                return jsonify({"error": message, "message": message}), 401

            if not any(
                canonical_role(role) in g.current_user_role for role in accepted_roles
            ):
                message = "Access denied. Your account needs the API permission and an assigned staff role."
                return jsonify({"error": message, "message": message}), 403

            return function_to_wrap(*args, **kwargs)

        return check_role_then_run

    return decorator
