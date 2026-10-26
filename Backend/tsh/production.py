"""Production application factory using only explicitly supplied server settings."""

import os
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from tsh.app import create_app


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required in the production environment")
    return value


def _require_disabled(name: str) -> None:
    if os.environ.get(name, "").strip().lower() not in {"", "0", "false", "no", "off"}:
        raise RuntimeError(f"{name} must be disabled in production")


def _database_uri() -> str:
    uri = _required("SQLALCHEMY_DATABASE_URI")
    try:
        url = make_url(uri)
        if (
            url.drivername != "sqlite"
            or url.query
            or url.username
            or url.password
            or url.host
            or url.port
            or not url.database
        ):
            raise ValueError()
        database = Path(url.database)
        if not database.is_absolute() or database.name == ":memory:":
            raise ValueError()
        # Release directories are replaced on deploy; the database must survive them.
        if database.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
            raise ValueError()
    except (ArgumentError, TypeError, ValueError):
        raise RuntimeError(
            "SQLALCHEMY_DATABASE_URI must name an absolute SQLite file outside the application checkout"
        ) from None
    return uri


def create_production_app():
    """Create the real-auth API without testing.cfg, migrations or provider requests.

    Systemd supplies the private environment file before Python imports this package.
    API, worker and migration commands all use this factory with TFH_ENV=production.
    Provision the database directory separately, e.g. /var/lib/tfh-staging; this
    factory never creates, seeds, migrates or re-embeds a database.
    """
    if os.environ.get("TFH_ENV", "").strip().lower() != "production":
        raise RuntimeError("TFH_ENV=production is required for the production factory")
    for name in ("TESTING", "AUTH_TEST_BYPASS", "FLASK_DEBUG"):
        _require_disabled(name)

    secret = _required("JWT_SECRET_KEY")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET_KEY must contain at least 32 characters in production")

    redis_url = _required("REDIS_URL")
    try:
        parsed = urlsplit(redis_url)
        if parsed.scheme not in {"redis", "rediss"} or not parsed.hostname:
            raise ValueError()
    except ValueError:
        raise RuntimeError("REDIS_URL must be a redis:// or rediss:// server URL") from None

    return create_app(
        config_path=None,
        settings={
            "TESTING": False,
            "DEBUG": False,
            "AUTH_TEST_BYPASS": False,
            "JWT_SECRET_KEY": secret,
            "SQLALCHEMY_DATABASE_URI": _database_uri(),
            "TENANT_ID": _required("TENANT_ID"),
            "ENTRA_API_AUDIENCE": _required("ENTRA_API_AUDIENCE"),
            "ENTRA_API_SCOPE": _required("ENTRA_API_SCOPE")
            if "ENTRA_API_SCOPE" in os.environ
            else "access_as_user",
            "REDIS_URL": redis_url,
        },
    )
