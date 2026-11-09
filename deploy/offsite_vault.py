#!/usr/bin/env python3
"""Accept pulled staging backups into an off-droplet vault, verifying each one first.

Runs on the off-droplet machine, never on the droplet. A separate transfer step (for
example `rsync --ignore-existing` over SSH, see docs/deploying.md) copies backup pairs
from /var/backups/tfh-staging into an incoming folder. This script then checks each
pair before it counts as protected:

1. the backup file name matches the names backup.py creates,
2. the manifest's sha256 and file name match the copied database exactly, and
3. the copy passes integrity_check, foreign_key_check and loads sqlite-vec.

Only verified pairs are published into the vault, as private 0600 files. A pair that
fails is left in the incoming folder, reported, and makes the run exit non-zero, so a
scheduler can alert on it. The vault is then pruned with backup.py's narrow retention
rule. No credentials, network access or application imports are used here.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import backup


def read_manifest(path: Path) -> dict:
    """Return the parsed manifest. Raises ValueError if it is missing or malformed."""
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"Missing manifest for {path.name.removesuffix('.json')}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Manifest is not valid JSON: {path.name}") from error
    if not isinstance(data, dict):
        raise ValueError(f"Manifest is not a JSON object: {path.name}")
    return data


def verify_pair(database: Path) -> dict:
    """Check one pulled backup against its manifest and its own integrity.

    Returns the verification result. Raises ValueError for a name, manifest or checksum
    mismatch, and RuntimeError or sqlite3.Error when the database itself fails checks.
    """
    if database.is_symlink() or not database.is_file():
        raise ValueError(f"Not a regular backup file: {database.name}")
    if not backup.BACKUP_NAME.fullmatch(database.name):
        raise ValueError(f"Unexpected backup file name: {database.name}")
    manifest = read_manifest(database.with_suffix(database.suffix + ".json"))
    if manifest.get("backup") != database.name:
        raise ValueError(f"Manifest names a different backup: {database.name}")
    expected = manifest.get("sha256")
    if not isinstance(expected, str) or backup.sha256(database) != expected:
        raise ValueError(f"Checksum does not match the manifest: {database.name}")
    return backup.verify_database(database)


def publish(source: Path, vault: Path) -> None:
    """Copy one file into the vault as 0600, never overwriting an existing file."""
    destination = vault / source.name
    # A process can stop after publishing a manifest but before its database.
    # Reuse that exact manifest on retry; conflicting content must fail closed.
    if destination.exists() or destination.is_symlink():
        if destination.is_symlink() or not destination.is_file():
            raise ValueError(f"Not a regular vault file: {destination.name}")
        if backup.sha256(destination) != backup.sha256(source):
            raise ValueError(
                f"Vault file conflicts with incoming file: {destination.name}"
            )
        return
    descriptor, name = tempfile.mkstemp(
        prefix=source.name + ".", suffix=".partial", dir=vault
    )
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as target, source.open("rb") as stream:
            shutil.copyfileobj(stream, target)
            target.flush()
            os.fsync(target.fileno())
        # A same-directory hard link publishes the complete file and fails if one exists.
        os.link(temporary, destination)
    finally:
        if temporary.is_file() and not temporary.is_symlink():
            temporary.unlink()


def accept(incoming: Path, vault: Path, retain_days: int, min_copies: int) -> dict:
    """Verify and publish every new pair from incoming into vault, then prune the vault.

    Returns a summary with accepted, skipped (already in the vault) and failed names.
    Raises ValueError if either folder is missing or is a symlink.
    """
    for folder in (incoming, vault):
        if folder.is_symlink() or not folder.is_dir():
            raise ValueError(f"Expected an existing, non-symlink directory: {folder}")
    summary: dict = {"accepted": [], "skipped": [], "failed": []}
    for database in sorted(incoming.iterdir()):
        if not backup.BACKUP_NAME.fullmatch(database.name):
            continue
        try:
            existing = vault / database.name
            if existing.exists() or existing.is_symlink():
                verify_pair(existing)
                summary["skipped"].append(database.name)
                continue
            verify_pair(database)
            # Publish the manifest first; an interrupted pair can be retried.
            publish(database.with_suffix(database.suffix + ".json"), vault)
            publish(database, vault)
            summary["accepted"].append(database.name)
        except (OSError, ValueError, RuntimeError, sqlite3.Error) as error:
            summary["failed"].append({"backup": database.name, "error": str(error)})
            continue
    # A failed copy or damaged existing pair must not expire older recovery copies.
    if not summary["failed"]:
        backup.prune_backups(vault, retain_days, min_copies, datetime.now(UTC))
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incoming", required=True, type=Path)
    parser.add_argument("--vault", required=True, type=Path)
    # Off-droplet copies are kept longer than the droplet's own 14-day window.
    parser.add_argument("--retain-days", type=backup.positive, default=30)
    parser.add_argument("--min-copies", type=backup.positive, default=30)
    arguments = parser.parse_args(argv)
    try:
        summary = accept(
            arguments.incoming,
            arguments.vault,
            arguments.retain_days,
            arguments.min_copies,
        )
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Off-droplet vault update failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(summary))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
