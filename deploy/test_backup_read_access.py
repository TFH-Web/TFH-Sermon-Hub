"""Permission grants must exclude unverified and unrelated recovery files."""

import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import backup
import backup_read_access


class BackupReadAccessTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.directory = root / "backups"
        self.directory.mkdir()
        source = root / "source.sqlite3"
        connection = sqlite3.connect(source)
        connection.execute("CREATE TABLE sermon (id INTEGER PRIMARY KEY)")
        connection.execute("INSERT INTO sermon VALUES (1)")
        connection.commit()
        connection.close()
        self.database = backup.create_backup(source, self.directory, 14, 14)
        self.manifest = self.database.with_suffix(".sqlite3.json")
        self.chown = self.enterContext(
            patch.object(backup_read_access.os, "chown", create=True)
        )
        self.chmod = self.enterContext(patch.object(backup_read_access.os, "chmod"))

    def test_only_verified_pair_and_directory_receive_read_access(self):
        unrelated = self.directory / "private-rehearsal.sqlite3"
        unrelated.write_bytes(b"leave private")
        self.assertEqual(
            backup_read_access.grant(self.directory, 123), [self.database.name]
        )
        self.assertEqual(
            self.chmod.call_args_list,
            [
                unittest.mock.call(self.database, 0o640),
                unittest.mock.call(self.manifest, 0o640),
                unittest.mock.call(self.directory, 0o750),
            ],
        )
        self.assertTrue(all(call.args[2] == 123 for call in self.chown.call_args_list))

    def test_missing_manifest_grants_nothing(self):
        self.manifest.unlink()
        with self.assertRaises(ValueError):
            backup_read_access.grant(self.directory, 123)
        self.chown.assert_not_called()
        self.chmod.assert_not_called()

    def test_mismatched_checksum_grants_nothing(self):
        with self.database.open("ab") as stream:
            stream.write(b"changed")
        with self.assertRaisesRegex(ValueError, "checksum"):
            backup_read_access.grant(self.directory, 123)
        self.chmod.assert_not_called()

    def test_wrong_manifest_name_grants_nothing(self):
        data = json.loads(self.manifest.read_text())
        data["backup"] = "other.sqlite3"
        self.manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "paired"):
            backup_read_access.grant(self.directory, 123)
        self.chmod.assert_not_called()

    def test_invalid_sqlite_grants_nothing_even_with_matching_checksum(self):
        self.database.write_bytes(b"not sqlite")
        data = json.loads(self.manifest.read_text())
        data["sha256"] = backup.sha256(self.database)
        self.manifest.write_text(json.dumps(data))
        with self.assertRaises(sqlite3.DatabaseError):
            backup_read_access.grant(self.directory, 123)
        self.chmod.assert_not_called()


if __name__ == "__main__":
    unittest.main()
