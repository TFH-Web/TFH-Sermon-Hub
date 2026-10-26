#!/usr/bin/env python3
"""Online SQLite backups, sqlite-vec verification, and narrowly scoped retention.

Run with the release's Python environment. No Flask imports, credentials, model calls,
or network access. Only this script's timestamp/UUID-named backup pairs are pruned.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKUP_NAME = re.compile(r"sermonhub-(\d{8}T\d{12}Z)-[0-9a-f]{8}\.sqlite3\Z")
COUNT_TABLES = (
    "sermon",
    "speaker",
    "series",
    "tag",
    "Sermon_Tag",
    "sermon_tag",
    "sync_run",
    "sermon_chunk",
    "sermon_chunk_embedding",
)


def connect_read_only(path: Path) -> sqlite3.Connection:
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"Expected an existing regular database file: {path}")
    connection = sqlite3.connect(
        path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30
    )
    try:
        load_vec(connection)
    except Exception:
        connection.close()
        raise
    return connection


def load_vec(connection: sqlite3.Connection) -> None:
    try:
        import sqlite_vec
    except ImportError as error:
        raise RuntimeError(
            "Use the release's Python with locked sqlite-vec installed"
        ) from error
    try:
        connection.enable_load_extension(True)
        sqlite_vec.load(connection)
    finally:
        connection.enable_load_extension(False)


def inspect_connection(connection: sqlite3.Connection) -> dict:
    integrity = [row[0] for row in connection.execute("PRAGMA integrity_check")]
    if integrity != ["ok"]:
        raise RuntimeError("SQLite integrity_check failed; no backup will be pruned")
    if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise RuntimeError("SQLite foreign_key_check failed; no backup will be pruned")
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type='table'"
        )
    }
    # Table names come from this fixed whitelist, never from command-line or database text.
    counts = {
        table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        for table in COUNT_TABLES
        if table in tables
    }
    revisions = (
        [
            row[0]
            for row in connection.execute("SELECT version_num FROM alembic_version")
        ]
        if "alembic_version" in tables
        else []
    )
    return {
        "integrity_check": "ok",
        "foreign_key_check": "ok",
        "sqlite_version": sqlite3.sqlite_version,
        "sqlite_vec_version": connection.execute("SELECT vec_version()").fetchone()[0],
        "alembic_revisions": revisions,
        "row_counts": counts,
    }


def verify_database(path: Path) -> dict:
    connection = connect_read_only(path)
    try:
        return inspect_connection(connection)
    finally:
        connection.close()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prune_backups(
    directory: Path, retain_days: int, min_copies: int, now: datetime
) -> None:
    """Keep every copy from the retention window and at least min_copies overall.

    Refuse symlinks and unknown filenames. Never recursively remove a directory or touch
    the pre-staging server snapshot, manual copies, partial files, or unrelated files.
    """
    candidates = []
    for path in directory.iterdir():
        match = BACKUP_NAME.fullmatch(path.name)
        if match and path.is_file() and not path.is_symlink():
            try:
                created = datetime.strptime(match[1], "%Y%m%dT%H%M%S%fZ").replace(
                    tzinfo=UTC
                )
            except ValueError:
                continue
            candidates.append((created, path))
    candidates.sort(reverse=True)
    cutoff = now - timedelta(days=retain_days)
    for index, (created, path) in enumerate(candidates):
        if index < min_copies or created >= cutoff:
            continue
        # Recheck the exact child immediately before unlinking; no glob or recursion.
        if path.parent.resolve() != directory.resolve() or path.is_symlink():
            raise RuntimeError("Backup retention target changed; refusing to delete")
        manifest = path.with_suffix(path.suffix + ".json")
        if manifest.exists() and manifest.is_symlink():
            raise RuntimeError("Backup manifest is a symlink; refusing to delete")
        path.unlink()
        if manifest.is_file():
            manifest.unlink()
        print(f"Pruned expired generated backup: {path.name}", file=sys.stderr)


def create_backup(
    database: Path, directory: Path, retain_days: int, min_copies: int
) -> Path:
    if directory.is_symlink():
        raise ValueError("Backup directory must not be a symlink")
    directory = directory.resolve()
    if not directory.is_dir():
        raise ValueError(
            "Create the private backup directory before running this command"
        )
    now = datetime.now(UTC)
    name = (
        f"sermonhub-{now.strftime('%Y%m%dT%H%M%S%fZ')}-{uuid.uuid4().hex[:8]}.sqlite3"
    )
    destination = directory / name
    temporary = directory / (name + ".partial")
    manifest = destination.with_suffix(destination.suffix + ".json")
    manifest_temporary = directory / (manifest.name + ".partial")
    source = connect_read_only(database)
    try:
        descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(descriptor)
        target = sqlite3.connect(temporary)
        try:
            load_vec(target)
            source.backup(target, pages=1024, sleep=0.05)
            # A completed backup is one standalone database, not a DB/WAL file pair.
            target.execute("PRAGMA journal_mode=DELETE")
            inspect_connection(target)
        finally:
            target.close()
        metadata = {
            "created_at": now.isoformat(),
            "database": str(database.resolve()),
            "backup": name,
            "sha256": sha256(temporary),
            **verify_database(temporary),
        }
        descriptor = os.open(
            manifest_temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(metadata, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        with temporary.open("r+b") as stream:
            os.fsync(stream.fileno())
        # Same-directory hard links publish complete files without overwriting anything.
        os.link(temporary, destination)
        os.link(manifest_temporary, manifest)
        if os.name == "posix":
            descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        source.close()
        for path in (temporary, manifest_temporary):
            if path.is_file() and not path.is_symlink():
                path.unlink()
    print(json.dumps(metadata))
    # A failure above can never expire older backups.
    prune_backups(directory, retain_days, min_copies, now)
    return destination


def positive(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database", type=Path, default=Path("/var/lib/tfh-staging/sermonhub.sqlite3")
    )
    parser.add_argument(
        "--backup-dir", type=Path, default=Path("/var/backups/tfh-staging")
    )
    parser.add_argument("--retain-days", type=positive, default=14)
    parser.add_argument("--min-copies", type=positive, default=14)
    parser.add_argument(
        "--verify",
        type=Path,
        help="verify one existing backup without creating/pruning anything",
    )
    arguments = parser.parse_args()
    try:
        if arguments.verify is not None:
            print(
                json.dumps(
                    {"file": str(arguments.verify), **verify_database(arguments.verify)}
                )
            )
        else:
            create_backup(
                arguments.database,
                arguments.backup_dir,
                arguments.retain_days,
                arguments.min_copies,
            )
    except (OSError, sqlite3.Error, RuntimeError, ValueError) as error:
        print(f"Backup failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
