#!/usr/bin/env python3
"""Allow a dedicated pull group to read verified generated backup pairs only.

Run as root after a successful backup. The pull user must not belong to the app's
group: that would also grant access to the private application environment. This
helper grants no writes and never changes unrelated files or private rehearsals.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys

import backup


def grant(directory: Path, group_id: int) -> list[str]:
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Expected a regular backup directory")
    directory = directory.resolve()
    verified = []
    for database in sorted(directory.iterdir()):
        if not backup.BACKUP_NAME.fullmatch(database.name):
            continue
        manifest = database.with_suffix(database.suffix + ".json")
        if any(p.is_symlink() or not p.is_file() for p in (database, manifest)):
            raise ValueError("Expected a complete regular backup pair")
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("backup") != database.name:
            raise ValueError("Manifest does not name its paired backup")
        if data.get("sha256") != backup.sha256(database):
            raise ValueError("Backup checksum does not match its manifest")
        backup.verify_database(database)
        verified.append((database, manifest))

    # Validate every candidate before widening any access. The directory stays
    # writable only by its original owner; the new group receives read/traverse.
    for pair in verified:
        for path in pair:
            os.chown(path, -1, group_id)
            os.chmod(path, 0o640)
    os.chown(directory, -1, group_id)
    os.chmod(directory, 0o750)
    return [pair[0].name for pair in verified]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-dir", required=True, type=Path)
    parser.add_argument("--group", default="tfh-backups-read")
    args = parser.parse_args(argv)
    try:
        if os.name != "posix":
            raise RuntimeError("This permission helper requires Linux")
        import grp

        if os.geteuid() != 0:
            raise PermissionError(
                "Run as root; do not give the app privileged group access"
            )
        names = grant(args.backup_dir, grp.getgrnam(args.group).gr_gid)
    except (OSError, RuntimeError, ValueError, KeyError, sqlite3.Error) as error:
        print(f"Backup read access failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"readable_backups": names, "group": args.group}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
