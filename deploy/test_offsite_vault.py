"""Local-only checks for the off-droplet vault; no server, network or application needed."""

import json
import os
import sqlite3
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import backup
import offsite_vault


class OffsiteVaultTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.database = root / "source.sqlite3"
        self.droplet = root / "droplet-backups"
        self.incoming = root / "incoming"
        self.vault = root / "vault"
        for folder in (self.droplet, self.incoming, self.vault):
            folder.mkdir()
        connection = sqlite3.connect(self.database)
        backup.load_vec(connection)
        connection.execute("CREATE TABLE sermon (id INTEGER PRIMARY KEY)")
        connection.execute("INSERT INTO sermon VALUES (1)")
        connection.commit()
        connection.close()

    def pull(self):
        """Make a real backup pair, then copy it to incoming the way rsync would."""
        made = backup.create_backup(self.database, self.droplet, 14, 14)
        for name in (made.name, made.name + ".json"):
            (self.incoming / name).write_bytes((self.droplet / name).read_bytes())
        return made.name

    def test_verified_pair_is_published_privately_with_its_manifest(self):
        name = self.pull()
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [name])
        self.assertEqual(summary["failed"], [])
        for published in (self.vault / name, self.vault / (name + ".json")):
            self.assertTrue(published.is_file())
            if os.name == "posix":
                self.assertEqual(stat.S_IMODE(published.stat().st_mode), 0o600)
        self.assertEqual(
            backup.verify_database(self.vault / name)["row_counts"]["sermon"], 1
        )

    def test_second_run_skips_pairs_already_in_the_vault(self):
        name = self.pull()
        offsite_vault.accept(self.incoming, self.vault, 30, 30)
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [])
        self.assertEqual(summary["skipped"], [name])

    def test_checksum_mismatch_is_rejected_and_not_published(self):
        name = self.pull()
        with (self.incoming / name).open("ab") as stream:
            stream.write(b"tampered")
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [])
        self.assertIn("Checksum", summary["failed"][0]["error"])
        self.assertFalse((self.vault / name).exists())

    def test_missing_manifest_is_rejected(self):
        name = self.pull()
        (self.incoming / (name + ".json")).unlink()
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertIn("Missing manifest", summary["failed"][0]["error"])
        self.assertFalse((self.vault / name).exists())

    def test_manifest_naming_another_backup_is_rejected(self):
        name = self.pull()
        manifest_path = self.incoming / (name + ".json")
        manifest = json.loads(manifest_path.read_text())
        manifest["backup"] = "sermonhub-20260101T000000000000Z-deadbeef.sqlite3"
        manifest_path.write_text(json.dumps(manifest))
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertIn("different backup", summary["failed"][0]["error"])

    def test_unrelated_files_in_incoming_are_ignored(self):
        (self.incoming / "notes.txt").write_text("not a backup")
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary, {"accepted": [], "skipped": [], "failed": []})
        self.assertFalse((self.vault / "notes.txt").exists())

    def test_cli_exits_non_zero_when_a_pair_fails(self):
        name = self.pull()
        (self.incoming / (name + ".json")).unlink()
        code = offsite_vault.main(
            ["--incoming", str(self.incoming), "--vault", str(self.vault)]
        )
        self.assertEqual(code, 1)

    def test_cli_exits_zero_on_success(self):
        self.pull()
        code = offsite_vault.main(
            ["--incoming", str(self.incoming), "--vault", str(self.vault)]
        )
        self.assertEqual(code, 0)

    def test_symlinked_vault_is_refused(self):
        link = Path(self.temporary.name) / "vault-link"
        try:
            link.symlink_to(self.vault, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"Symlink creation is unavailable: {error}")
        with self.assertRaises(ValueError):
            offsite_vault.accept(self.incoming, link, 30, 30)

    def test_retry_after_only_manifest_was_published(self):
        name = self.pull()
        offsite_vault.publish(self.incoming / (name + ".json"), self.vault)
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [name])
        self.assertEqual(summary["failed"], [])
        offsite_vault.verify_pair(self.vault / name)

    def test_stale_partial_from_interrupted_copy_does_not_block_retry(self):
        name = self.pull()
        stale = self.vault / (name + ".json.partial")
        stale.write_bytes(b"incomplete")
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [name])
        self.assertEqual(stale.read_bytes(), b"incomplete")

    def test_damaged_existing_database_is_failed_instead_of_skipped(self):
        name = self.pull()
        offsite_vault.accept(self.incoming, self.vault, 30, 30)
        with (self.vault / name).open("ab") as stream:
            stream.write(b"damaged")
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["skipped"], [])
        self.assertIn("Checksum", summary["failed"][0]["error"])

    def test_conflicting_partial_pair_is_not_overwritten(self):
        name = self.pull()
        manifest = self.vault / (name + ".json")
        manifest.write_bytes(b"conflicting existing manifest")
        summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [])
        self.assertIn("conflicts", summary["failed"][0]["error"])
        self.assertEqual(manifest.read_bytes(), b"conflicting existing manifest")

    def test_failed_publication_is_reported_and_retention_is_suppressed(self):
        name = self.pull()
        with patch.object(offsite_vault, "publish", side_effect=OSError("disk full")):
            with patch.object(backup, "prune_backups") as prune:
                summary = offsite_vault.accept(self.incoming, self.vault, 30, 30)
        self.assertEqual(summary["accepted"], [])
        self.assertEqual(summary["failed"], [{"backup": name, "error": "disk full"}])
        prune.assert_not_called()


if __name__ == "__main__":
    unittest.main()
