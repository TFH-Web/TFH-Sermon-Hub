#!/usr/bin/env python3
"""Prepare isolated staging storage/configuration; never activate or stop a service."""

from __future__ import annotations

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import sqlite3
import subprocess
import sys
import tempfile
from uuid import UUID

ACCOUNT = "tfh-staging"
INSTALL_DIR = Path("/opt/tfh-staging")
RELEASES_DIR = INSTALL_DIR / "releases"
CONFIG_DIR = Path("/etc/tfh-staging")
ENV_FILE = CONFIG_DIR / ".env"
STATE_DIR = Path("/var/lib/tfh-staging")
DATABASE = STATE_DIR / "sermonhub.sqlite3"
BACKUP_DIR = Path("/var/backups/tfh-staging")
SOURCE_BACKUP = Path(
    "/var/backups/tfh-sermon-hub/20261020T234424Z/database.sqlite3"
)
IDENTITY_KEYS = {"TENANT_ID", "CLIENT_ID", "ENTRA_API_AUDIENCE"}


def no_symlinks(path: Path) -> None:
    """Reject redirected files/directories before any root-owned operation."""
    if any(candidate.is_symlink() for candidate in (path, *path.parents)):
        raise ValueError(f"Refusing a symlink in staging path: {path}")


def release_directory(value: str) -> Path:
    release = Path(value)
    if not release.is_absolute():
        raise ValueError("--release-dir must be absolute")
    no_symlinks(release)
    release = release.resolve(strict=True)
    if release.parent != RELEASES_DIR.resolve(strict=True) or not release.is_dir():
        raise ValueError("Release must be an existing direct child of the staging releases directory")
    for relative in ("Backend/poetry.lock", "Backend/tsh/production.py", "Backend/up.py"):
        if not (release / relative).is_file():
            raise ValueError(f"Release is missing {relative}")
    for relative in ("Backend/.env", "Frontend/.env", "Backend/tsh/testing.cfg"):
        if (release / relative).exists():
            raise ValueError(f"Release contains private/local configuration: {relative}")
    return release


def public_configuration(path: Path) -> dict[str, str]:
    if path.stat().st_size > 16 * 1024:
        raise ValueError("Public configuration is too large")
    try:
        values = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(values, dict):
            raise ValueError()
        if set(values) - (IDENTITY_KEYS | {"ENTRA_API_SCOPE"}) or not IDENTITY_KEYS <= set(values):
            raise ValueError()
        result = {name: str(UUID(values[name])) for name in IDENTITY_KEYS}
        if values.get("ENTRA_API_SCOPE", "access_as_user") != "access_as_user":
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError(
            "Public JSON must contain only TENANT_ID, CLIENT_ID, ENTRA_API_AUDIENCE UUIDs "
            "and optional ENTRA_API_SCOPE=access_as_user"
        ) from None
    return {**result, "ENTRA_API_SCOPE": "access_as_user"}


def fixed_environment() -> dict[str, str]:
    return {
        "TFH_ENV": "production",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{DATABASE.as_posix()}",
        "REDIS_URL": "redis://127.0.0.1:6379/1",
        "OLLAMA_HOST": "http://127.0.0.1:9",
        "OLLAMA_URL": "http://127.0.0.1:9",
    }


def new_environment(public: dict[str, str]) -> str:
    values = {
        **fixed_environment(),
        **public,
        "JWT_SECRET_KEY": secrets.token_urlsafe(64),
        "TESTING": "false",
        "AUTH_TEST_BYPASS": "false",
        "FLASK_DEBUG": "false",
        # Explicitly unavailable until a cloud provider is selected/configured.
        "LLM_PROVIDER": "cloud-pending",
        "LLM_MODEL": "",
        "EMBEDDING_MODEL": "cloud-pending",
    }
    return "".join(f"{name}={json.dumps(value)}\n" for name, value in values.items())


def read_environment(path: Path) -> dict[str, str]:
    """Parse literal assignments, never shell-source or expand a private file."""
    if path.stat().st_size > 64 * 1024:
        raise ValueError("Existing staging environment is too large")
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not re.fullmatch(r"[A-Z_][A-Z0-9_]*", name) or name in values:
            raise ValueError("Existing staging environment has invalid/duplicate assignments")
        try:
            parts = shlex.split(value, comments=False, posix=True)
        except ValueError:
            raise ValueError("Existing staging environment has an invalid quoted value") from None
        if len(parts) > 1:
            raise ValueError("Existing staging environment requires quoted whitespace")
        values[name] = parts[0] if parts else ""
    return values


def validate_environment(path: Path, public: dict[str, str]) -> None:
    no_symlinks(path)
    if not path.is_file():
        raise ValueError("Existing staging environment is not a regular file")
    values = read_environment(path)
    for name, expected in {**fixed_environment(), **public}.items():
        if values.get(name) != expected:
            raise ValueError(f"Existing staging environment does not match required {name}")
    for name in ("TESTING", "AUTH_TEST_BYPASS", "FLASK_DEBUG", "DEBUG", "VITE_E2E_TEST"):
        if values.get(name, "").strip().lower() not in {"", "0", "false", "no", "off"}:
            raise ValueError(f"Existing staging environment must disable {name}")
    if len(values.get("JWT_SECRET_KEY", "")) < 32:
        raise ValueError("Existing staging JWT_SECRET_KEY must have at least 32 characters")
    if not values.get("LLM_PROVIDER") or values["LLM_PROVIDER"].lower() == "ollama":
        raise ValueError("Staging requires a cloud provider or the cloud-pending placeholder")


def metadata(path: Path, uid: int, gid: int, mode: int) -> None:
    no_symlinks(path)
    os.chown(path, uid, gid)
    path.chmod(mode)


def directory(path: Path, uid: int, gid: int, mode: int) -> None:
    no_symlinks(path)
    path.mkdir(parents=True, exist_ok=True)
    metadata(path, uid, gid, mode)


def staging_account() -> tuple[int, int]:
    import grp
    import pwd

    try:
        account = pwd.getpwnam(ACCOUNT)
    except KeyError:
        subprocess.run(
            ["useradd", "--system", "--user-group", "--home-dir", str(STATE_DIR),
             "--no-create-home", "--shell", "/usr/sbin/nologin", ACCOUNT],
            check=True,
        )
        account = pwd.getpwnam(ACCOUNT)
    group = grp.getgrnam(ACCOUNT)
    if (account.pw_uid == 0 or group.gr_gid == 0 or account.pw_gid != group.gr_gid
            or account.pw_dir != str(STATE_DIR)
            or account.pw_shell not in {"/usr/sbin/nologin", "/sbin/nologin", "/bin/false"}):
        raise ValueError("Existing tfh-staging account is not the expected isolated service identity")
    return account.pw_uid, group.gr_gid


def prepare_environment(public: dict[str, str], gid: int) -> bool:
    no_symlinks(ENV_FILE)
    if ENV_FILE.exists():
        validate_environment(ENV_FILE, public)
        metadata(ENV_FILE, 0, gid, 0o640)
        return False
    descriptor, temporary = tempfile.mkstemp(prefix=".env-", dir=CONFIG_DIR)
    temporary = Path(temporary)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(new_environment(public))
            output.flush()
            os.fsync(output.fileno())
        metadata(temporary, 0, gid, 0o640)
        # Publish without replacing a file another invocation may have created.
        os.link(temporary, ENV_FILE)
    except FileExistsError:
        validate_environment(ENV_FILE, public)
        return False
    finally:
        temporary.unlink(missing_ok=True)
    return True


def prepare_database(uid: int, gid: int) -> bool:
    no_symlinks(DATABASE)
    if DATABASE.exists():
        if not DATABASE.is_file():
            raise ValueError("Staging database path is not a regular file")
        metadata(DATABASE, uid, gid, 0o600)
        return False
    no_symlinks(SOURCE_BACKUP)
    if not SOURCE_BACKUP.is_file():
        raise ValueError("The fixed server bootstrap backup is missing; no alternative database is used")
    descriptor, temporary = tempfile.mkstemp(prefix=".bootstrap-", dir=STATE_DIR)
    os.close(descriptor)
    temporary = Path(temporary)
    try:
        # Online backup includes a consistent snapshot, never a raw DB/WAL copy.
        with closing(sqlite3.connect(SOURCE_BACKUP.as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(temporary)) as destination:
                source.backup(destination)
                if destination.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise ValueError("Server bootstrap database failed SQLite integrity validation")
                if destination.execute("PRAGMA foreign_key_check").fetchall():
                    raise ValueError("Server bootstrap database contains foreign-key violations")
        metadata(temporary, uid, gid, 0o600)
        os.link(temporary, DATABASE)
    except FileExistsError:
        no_symlinks(DATABASE)
        return False
    finally:
        temporary.unlink(missing_ok=True)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-dir", required=True)
    parser.add_argument("--public-config", required=True, type=Path)
    parser.add_argument("--prepare-only", action="store_true", help="Explicit default: no activation or service changes")
    args = parser.parse_args(argv)
    if sys.platform != "linux" or os.geteuid() != 0:
        raise ValueError("Provisioning must run as root on Linux")
    release = release_directory(args.release_dir)
    public = public_configuration(args.public_config)
    uid, gid = staging_account()
    for path in (INSTALL_DIR, RELEASES_DIR, release):
        directory(path, 0, 0, 0o755)
    directory(CONFIG_DIR, 0, gid, 0o750)
    directory(STATE_DIR, uid, gid, 0o700)
    directory(BACKUP_DIR, uid, gid, 0o700)
    prepare_environment(public, gid)
    prepare_database(uid, gid)
    print("Staging directories, private environment and isolated database are prepared.")
    print("No migrations, units, current symlink, services or existing site were changed.")
    print("AI remains unavailable until a cloud provider is configured.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as error:
        # Application validation errors name fields/paths, never private values.
        print(f"Staging preparation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
    except sqlite3.Error:
        print("Staging preparation failed: server bootstrap SQLite validation/copy failed.", file=sys.stderr)
        raise SystemExit(1)
    except (OSError, subprocess.CalledProcessError):
        # Do not leak private file contents, provider values or subprocess arguments.
        print("Staging preparation failed; verify paths, public configuration and private environment locally.", file=sys.stderr)
        raise SystemExit(1)
