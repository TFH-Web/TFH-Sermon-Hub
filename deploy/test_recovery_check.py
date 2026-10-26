"""Synthetic scratch-only recovery checks; never touch a real library or service."""

from contextlib import closing, redirect_stdout
import io
import json
import os
from pathlib import Path
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch

import backup
import recovery_check


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.backups = self.root / "backups"
        self.backups.mkdir()
        source = self.root / "synthetic.sqlite3"
        connection = sqlite3.connect(source)
        try:
            backup.load_vec(connection)
            connection.executescript("""
                CREATE TABLE alembic_version (version_num TEXT PRIMARY KEY);
                INSERT INTO alembic_version VALUES ('synthetic-recovery-fixture');
                CREATE TABLE sermon (id INTEGER PRIMARY KEY, title TEXT, youtube_video_id TEXT,
                    transcript TEXT, transcript_segments TEXT);
                CREATE TABLE sermon_chunk (id INTEGER PRIMARY KEY, sermon_id INTEGER REFERENCES sermon(id),
                    text TEXT, start REAL, end REAL, embedding_model TEXT);
                CREATE TABLE source_note (note TEXT);
                CREATE TABLE keyed_note (id TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
                CREATE VIRTUAL TABLE sermon_chunk_embedding USING vec0(
                    sermon_chunk_id INTEGER PRIMARY KEY, embedding FLOAT[768]);
            """)
            connection.execute(
                "INSERT INTO sermon VALUES (7, ?, ?, ?, ?)",
                ("PRIVATE_SYNTHETIC_TITLE", "abcdefghijk", "PRIVATE_SYNTHETIC_CAPTION",
                 '[{"start":75,"end":90,"text":"PRIVATE_SYNTHETIC_CAPTION"}]'),
            )
            connection.execute(
                "INSERT INTO sermon_chunk VALUES (19,7,?,75,90,'synthetic-768')",
                ("PRIVATE_SYNTHETIC_CAPTION",),
            )
            connection.execute(
                "INSERT INTO sermon_chunk_embedding VALUES (19,?)",
                (struct.pack("<768f", *([0.25] * 768)),),
            )
            connection.execute("INSERT INTO source_note (rowid,note) VALUES (91,'synthetic-source-link')")
            connection.execute("INSERT INTO keyed_note VALUES ('key','synthetic')")
            connection.commit()
        finally:
            connection.close()
        with redirect_stdout(io.StringIO()):
            self.database = backup.create_backup(source, self.backups, 14, 14)
        self.manifest = self.database.with_suffix(".sqlite3.json")

    def update_manifest(self, change):
        metadata = json.loads(self.manifest.read_text())
        change(metadata)
        self.manifest.write_text(json.dumps(metadata), encoding="utf-8")

    def test_nonempty_sermons_sources_and_768_vectors_survive_scratch_restore(self):
        original = backup.sha256(self.database)
        with closing(backup.connect_read_only(self.database)) as connection:
            fingerprint = recovery_check.fingerprint(connection)
        self.update_manifest(lambda metadata: metadata.update(content_fingerprint=fingerprint))

        result = recovery_check.rehearse(self.database, scratch_parent=self.root)

        self.assertTrue(result["all_table_content_verified"])
        self.assertTrue(result["scratch_removed"])
        self.assertEqual(result["input_sha256"], original)
        self.assertEqual(result["content_fingerprint"], fingerprint)
        tables = result["content_fingerprint"]["tables"]
        for name in ("sermon", "sermon_chunk", "sermon_chunk_embedding", "source_note", "keyed_note"):
            self.assertEqual(tables[name]["rows"], 1)
        self.assertIn("sermon_chunk_embedding_vector_chunks00", tables)
        self.assertIsNotNone(tables["source_note"]["rowid_alias"])
        self.assertIsNone(tables["keyed_note"]["rowid_alias"])
        self.assertNotIn("PRIVATE_SYNTHETIC", json.dumps(result))
        self.assertEqual(backup.sha256(self.database), original)
        self.assertEqual(list(self.root.glob("tfh-recovery-*")), [])

    def test_normal_nightly_manifest_is_supported_without_optional_content_hashes(self):
        self.assertTrue(recovery_check.rehearse(self.database, scratch_parent=self.root)["manifest_verified"])

    def test_corrupt_file_hash_is_rejected(self):
        self.update_manifest(lambda metadata: metadata.update(sha256="0" * 64))
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_corrupt_manifest_counts_are_rejected(self):
        self.update_manifest(lambda metadata: metadata["row_counts"].update(sermon=99))
        with self.assertRaisesRegex(ValueError, "table counts"):
            recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_corrupt_manifest_content_hash_is_rejected(self):
        self.update_manifest(lambda metadata: metadata.update(content_fingerprint={"wrong": "digest"}))
        with self.assertRaisesRegex(ValueError, "content does not match"):
            recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_source_content_change_is_rejected_even_when_counts_match(self):
        connection = sqlite3.connect(self.database)
        try:
            connection.execute("UPDATE sermon SET title='changed' WHERE id=7")
            connection.commit()
        finally:
            connection.close()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_scratch_content_corruption_is_detected_and_cleaned(self):
        copy = recovery_check.copy_snapshot

        def corrupt(source, destination):
            copy(source, destination)
            with closing(sqlite3.connect(destination)) as connection:
                connection.execute("UPDATE sermon SET transcript='changed' WHERE id=7")
                connection.commit()

        with patch.object(recovery_check, "copy_snapshot", corrupt):
            with self.assertRaisesRegex(ValueError, "Restored database content"):
                recovery_check.rehearse(self.database, scratch_parent=self.root)
        self.assertEqual(list(self.root.glob("tfh-recovery-*")), [])

    def test_rowid_only_corruption_is_detected(self):
        copy = recovery_check.copy_snapshot

        def corrupt(source, destination):
            copy(source, destination)
            with closing(sqlite3.connect(destination)) as connection:
                connection.execute("UPDATE source_note SET rowid=92 WHERE rowid=91")
                connection.commit()

        with patch.object(recovery_check, "copy_snapshot", corrupt):
            with self.assertRaisesRegex(ValueError, "Restored database content"):
                recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_vector_only_corruption_is_detected(self):
        copy = recovery_check.copy_snapshot

        def corrupt(source, destination):
            copy(source, destination)
            with closing(sqlite3.connect(destination)) as connection:
                backup.load_vec(connection)
                connection.execute(
                    "UPDATE sermon_chunk_embedding SET embedding=? WHERE sermon_chunk_id=19",
                    (struct.pack("<768f", *([0.75] * 768)),),
                )
                connection.commit()

        with patch.object(recovery_check, "copy_snapshot", corrupt):
            with self.assertRaisesRegex(ValueError, "Restored database content"):
                recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_unexpected_sidecars_are_rejected_without_writing_input(self):
        original = backup.sha256(self.database)
        for suffix in ("-wal", "-shm", "-journal"):
            with self.subTest(suffix=suffix):
                sidecar = Path(str(self.database) + suffix)
                sidecar.write_bytes(b"unexpected")
                try:
                    with self.assertRaisesRegex(ValueError, "standalone backup"):
                        recovery_check.rehearse(self.database, scratch_parent=self.root)
                finally:
                    sidecar.unlink()
        self.assertEqual(backup.sha256(self.database), original)

    def test_manifest_change_during_copy_is_rejected(self):
        copy = recovery_check.copy_snapshot

        def changed(source, destination):
            copy(source, destination)
            metadata = self.manifest.read_bytes()
            self.manifest.write_bytes(metadata + b"\n")

        with patch.object(recovery_check, "copy_snapshot", changed):
            with self.assertRaisesRegex(ValueError, "changed during recovery"):
                recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_backup_metadata_change_during_copy_is_rejected(self):
        copy = recovery_check.copy_snapshot

        def changed(source, destination):
            copy(source, destination)
            state = self.database.stat()
            os.utime(self.database, ns=(state.st_atime_ns, state.st_mtime_ns + 1_000_000_000))

        with patch.object(recovery_check, "copy_snapshot", changed):
            with self.assertRaisesRegex(ValueError, "changed during recovery"):
                recovery_check.rehearse(self.database, scratch_parent=self.root)

    def test_copy_never_overwrites_existing_destination(self):
        destination = self.root / "existing.sqlite3"
        destination.write_bytes(b"must remain")
        source = backup.connect_read_only(self.database)
        try:
            with self.assertRaises(FileExistsError):
                recovery_check.copy_snapshot(source, destination)
        finally:
            source.close()
        self.assertEqual(destination.read_bytes(), b"must remain")

    def test_symlink_source_and_scratch_parent_are_rejected(self):
        link = self.root / "link"
        try:
            link.symlink_to(self.database)
        except OSError:
            self.skipTest("Creating symlinks is unavailable on this test platform")
        with self.assertRaisesRegex(ValueError, "symlinks"):
            recovery_check.rehearse(link, self.manifest, self.root)
        link.unlink()
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlinks"):
            recovery_check.rehearse(self.database, scratch_parent=link)


if __name__ == "__main__":
    unittest.main()
