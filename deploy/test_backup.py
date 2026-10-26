"""Local-only backup/retention checks; no application, server, or network required."""

import json
import sqlite3
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

import backup


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.database = self.root / "source.sqlite3"
        self.directory = self.root / "backups"
        self.directory.mkdir()

    def source(self):
        connection = sqlite3.connect(self.database)
        backup.load_vec(connection)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE sermon (id INTEGER PRIMARY KEY)")
        connection.execute("INSERT INTO sermon VALUES (1)")
        connection.execute(
            "CREATE VIRTUAL TABLE sermon_chunk_embedding USING vec0(embedding float[2])"
        )
        connection.execute(
            "INSERT INTO sermon_chunk_embedding (rowid, embedding) VALUES (1, '[1, 0]')"
        )
        connection.commit()
        self.addCleanup(connection.close)
        return connection

    def test_live_wal_backup_is_standalone_verified_and_has_manifest(self):
        self.source()
        result = backup.create_backup(self.database, self.directory, 14, 14)
        verified = backup.verify_database(result)
        self.assertEqual(verified["row_counts"]["sermon"], 1)
        self.assertEqual(verified["row_counts"]["sermon_chunk_embedding"], 1)
        self.assertEqual(verified["integrity_check"], "ok")
        manifest = json.loads(result.with_suffix(".sqlite3.json").read_text())
        self.assertEqual(manifest["sha256"], backup.sha256(result))
        self.assertTrue(backup.BACKUP_NAME.fullmatch(result.name))
        self.assertFalse(list(self.directory.glob("*.partial")))
        self.assertFalse(result.with_name(result.name + "-wal").exists())

    def test_missing_source_is_not_created_and_existing_backups_are_preserved(self):
        old = self.directory / "sermonhub-20200101T000000000000Z-aaaaaaaa.sqlite3"
        old.write_bytes(b"existing backup")
        with self.assertRaises(ValueError):
            backup.create_backup(self.database, self.directory, 1, 1)
        self.assertFalse(self.database.exists())
        self.assertTrue(old.exists())

    def test_retention_only_removes_expired_exact_generated_names(self):
        old = self.directory / "sermonhub-20200101T000000000000Z-aaaaaaaa.sqlite3"
        old.write_bytes(b"old")
        manifest = old.with_suffix(".sqlite3.json")
        manifest.write_text("{}")
        recent = self.directory / "sermonhub-20261020T000000000000Z-bbbbbbbb.sqlite3"
        recent.write_bytes(b"recent")
        unrelated = self.directory / "manual.sqlite3"
        unrelated.write_bytes(b"must retain")
        partial = (
            self.directory / "sermonhub-20200101T000000000000Z-cccccccc.sqlite3.partial"
        )
        partial.write_bytes(b"must retain")
        backup.prune_backups(self.directory, 14, 1, datetime(2026, 10, 20, tzinfo=UTC))
        self.assertFalse(old.exists())
        self.assertFalse(manifest.exists())
        self.assertTrue(recent.exists())
        self.assertTrue(unrelated.exists())
        self.assertTrue(partial.exists())

    def test_minimum_copies_are_retained_even_when_expired(self):
        old = self.directory / "sermonhub-20200101T000000000000Z-aaaaaaaa.sqlite3"
        old.write_bytes(b"old")
        backup.prune_backups(self.directory, 14, 14, datetime(2026, 10, 20, tzinfo=UTC))
        self.assertTrue(old.exists())

    def test_corrupt_source_cannot_trigger_retention(self):
        self.database.write_bytes(b"not a SQLite database")
        old = self.directory / "sermonhub-20200101T000000000000Z-aaaaaaaa.sqlite3"
        old.write_bytes(b"existing backup")
        with self.assertRaises(sqlite3.DatabaseError):
            backup.create_backup(self.database, self.directory, 1, 1)
        self.assertTrue(old.exists())

    def test_foreign_key_violation_prevents_publication_and_retention(self):
        connection = self.source()
        connection.execute(
            "CREATE TABLE child (sermon_id INTEGER REFERENCES sermon(id))"
        )
        connection.execute("INSERT INTO child VALUES (999)")
        connection.commit()
        old = self.directory / "sermonhub-20200101T000000000000Z-aaaaaaaa.sqlite3"
        old.write_bytes(b"existing backup")
        with self.assertRaisesRegex(RuntimeError, "foreign_key_check failed"):
            backup.create_backup(self.database, self.directory, 1, 1)
        self.assertTrue(old.exists())
        self.assertEqual(list(self.directory.iterdir()), [old])


if __name__ == "__main__":
    unittest.main()
