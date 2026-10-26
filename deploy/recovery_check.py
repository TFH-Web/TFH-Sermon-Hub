#!/usr/bin/env python3
"""Rehearse a verified standalone SQLite backup in disposable private storage.

Never opens the input for writing, imports the application, migrates a schema,
accesses Redis, or calls a provider. Output contains counts and hashes, not rows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import struct
import sys
import tempfile
import time

import backup


def safe_path(path: Path, *, directory: bool = False) -> Path:
    path = Path(os.path.abspath(path))
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise ValueError("Recovery inputs and scratch paths must not contain symlinks")
    if not (path.is_dir() if directory else path.is_file()):
        raise ValueError("Recovery requires an existing regular input file or scratch directory")
    return path


def standalone(path: Path) -> None:
    for suffix in ("-wal", "-shm", "-journal"):
        sibling = Path(str(path) + suffix)
        if sibling.exists() or sibling.is_symlink():
            raise ValueError("Select an immutable standalone backup, without WAL/SHM/journal siblings")
    with path.open("rb") as stream:
        header = stream.read(20)
    if header[:16] != b"SQLite format 3\0" or header[18:20] != b"\x01\x01":
        raise ValueError("Select a standalone rollback-journal SQLite backup, not a live/WAL database")


def file_identity(path: Path) -> tuple:
    state = path.stat()
    return state.st_dev, state.st_ino, state.st_size, state.st_mtime_ns, state.st_ctime_ns


def identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def row_hash(row: tuple) -> bytes:
    """Frame SQLite values by type/length; never serialize private rows into proof."""
    digest = hashlib.sha256()
    for value in row:
        if value is None:
            tag, encoded = b"n", b""
        elif isinstance(value, int):
            tag, encoded = b"i", str(value).encode("ascii")
        elif isinstance(value, float):
            tag, encoded = b"f", struct.pack(">d", value)
        elif isinstance(value, str):
            tag, encoded = b"s", value.encode("utf-8")
        elif isinstance(value, bytes):
            tag, encoded = b"b", value
        else:
            raise ValueError("Unexpected SQLite value type during recovery verification")
        digest.update(tag)
        digest.update(len(encoded).to_bytes(8, "big"))
        digest.update(encoded)
    return digest.digest()


def fingerprint(connection: sqlite3.Connection) -> dict:
    """Hash every table, including vec0 virtual/shadow tables and accessible rowids.

    WITHOUT ROWID tables use their stored primary-key columns. If a table shadows
    all three rowid aliases, the file hash still authenticates that physical mapping.
    Sorting fixed-size row hashes makes results independent of scan order without
    sorting or retaining private row contents. Duplicate rows retain multiplicity.
    """
    schema = connection.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name"
    ).fetchall()
    tables = {}
    for kind, name, _, _ in schema:
        if kind != "table":
            continue
        quoted = identifier(name)
        columns = {
            column[1].lower()
            for column in connection.execute(f"PRAGMA table_xinfo({quoted})")
        }
        rowid = next((alias for alias in ("_rowid_", "rowid", "oid") if alias not in columns), None)
        selection = "t.*"
        if rowid is not None:
            try:
                connection.execute(f"SELECT t.{rowid} FROM {quoted} AS t LIMIT 0")
            except sqlite3.OperationalError:
                rowid = None  # WITHOUT ROWID tables have no implicit row identity.
            else:
                selection = f"t.{rowid}, t.*"
        rows = [row_hash(row) for row in connection.execute(f"SELECT {selection} FROM {quoted} AS t")]
        digest = hashlib.sha256()
        for hashed in sorted(rows):
            digest.update(hashed)
        tables[name] = {"rows": len(rows), "sha256": digest.hexdigest(), "rowid_alias": rowid}
    return {
        "schema_sha256": hashlib.sha256(json.dumps(schema, separators=(",", ":")).encode()).hexdigest(),
        "tables": tables,
    }


def read_manifest(path: Path, database: Path) -> dict:
    if path.stat().st_size > 1024 * 1024:
        raise ValueError("Backup manifest exceeds the recovery verification limit")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("backup") != database.name:
            raise ValueError()
        if not re.fullmatch(r"[0-9a-f]{64}", manifest.get("sha256", "")):
            raise ValueError()
        counts = manifest["row_counts"]
        if not isinstance(counts, dict) or any(
            not isinstance(name, str) or type(count) is not int or count < 0
            for name, count in counts.items()
        ):
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise ValueError("Expected a paired backup.py JSON manifest with a file SHA-256 and row counts") from None
    return manifest


def copy_snapshot(source: sqlite3.Connection, destination: Path) -> None:
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    target = sqlite3.connect(destination)
    deadline = time.monotonic() + 120

    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError("Recovery scratch copy exceeded 120 seconds")

    try:
        backup.load_vec(target)
        source.backup(target, pages=256, progress=progress, sleep=0.05)
        target.execute("PRAGMA journal_mode=DELETE")
    finally:
        target.close()


def rehearse(database: Path, manifest_path: Path | None = None, scratch_parent: Path | None = None) -> dict:
    database = safe_path(database)
    manifest_path = safe_path(manifest_path or database.with_suffix(database.suffix + ".json"))
    parent = safe_path(scratch_parent or Path(tempfile.gettempdir()), directory=True)
    standalone(database)
    original_identity = file_identity(database)
    manifest_identity = file_identity(manifest_path)
    manifest_hash = backup.sha256(manifest_path)
    manifest = read_manifest(manifest_path, database)
    input_hash = backup.sha256(database)
    if input_hash != manifest["sha256"]:
        raise ValueError("Backup file SHA-256 does not match its paired manifest")

    source = backup.connect_read_only(database)
    try:
        source.execute("BEGIN")
        inspected = backup.inspect_connection(source)
        expected = fingerprint(source)
        for name, count in manifest["row_counts"].items():
            if name not in expected["tables"] or expected["tables"][name]["rows"] != count:
                raise ValueError("Backup table counts do not match the paired manifest")
        for name in ("integrity_check", "foreign_key_check", "sqlite_vec_version"):
            if manifest.get(name) != inspected[name]:
                raise ValueError(f"Backup {name} does not match the paired manifest")
        if sorted(manifest.get("alembic_revisions", [])) != sorted(inspected["alembic_revisions"]):
            raise ValueError("Backup migration revision does not match the paired manifest")
        # Existing nightly manifests authenticate all bytes, but only list core-table
        # counts. Check full fingerprints too when a manifest explicitly supplies them.
        if "content_fingerprint" in manifest and manifest["content_fingerprint"] != expected:
            raise ValueError("Backup content does not match the paired manifest")

        with tempfile.TemporaryDirectory(prefix="tfh-recovery-", dir=parent) as temporary:
            scratch = safe_path(Path(temporary), directory=True)
            if scratch.parent != parent or not scratch.name.startswith("tfh-recovery-"):
                raise ValueError("Recovery scratch directory escaped its selected parent")
            restored = scratch / "restored.sqlite3"
            copy_snapshot(source, restored)
            copied = backup.connect_read_only(restored)
            try:
                restored_state = backup.inspect_connection(copied)
                actual = fingerprint(copied)
            finally:
                copied.close()
            if actual != expected or restored_state != inspected:
                raise ValueError("Restored database content/counts/schema do not match the verified input")
            restored_hash = backup.sha256(restored)
        source.rollback()
    finally:
        source.close()

    standalone(database)
    if (
        file_identity(safe_path(database)) != original_identity
        or backup.sha256(database) != input_hash
        or file_identity(safe_path(manifest_path)) != manifest_identity
        or backup.sha256(manifest_path) != manifest_hash
    ):
        raise ValueError("Selected backup or manifest changed during recovery verification")
    return {
        "backup": database.name,
        "input_sha256": input_hash,
        "manifest_sha256": manifest_hash,
        "restored_sha256": restored_hash,
        "manifest_verified": True,
        "all_table_content_verified": True,
        "scratch_removed": True,
        "input_unchanged": True,
        "sqlite_version": inspected["sqlite_version"],
        "sqlite_vec_version": inspected["sqlite_vec_version"],
        "alembic_revisions": inspected["alembic_revisions"],
        "content_fingerprint": expected,
        "scope": "standalone-backup-to-scratch-only; no live database, application, queue or provider access",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--scratch-parent", type=Path)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(rehearse(args.backup, args.manifest, args.scratch_parent), indent=2))
    except sqlite3.Error:
        print("Recovery check failed: SQLite validation/copy failed; no live restore was attempted", file=sys.stderr)
        return 1
    except (OSError, RuntimeError, TypeError, ValueError) as error:
        print(f"Recovery check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
