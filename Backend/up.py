#!/usr/bin/env -S poetry run python3
from pathlib import Path

from flask_migrate import stamp, upgrade
from sqlalchemy import inspect

from tsh.app import create_app
from tsh.database import db

MIGRATIONS = Path(__file__).parent / "migrations"

# The first migration. It matches what db.create_all() used to build.
BASELINE = "b2f09d55781a"


def main():
    app = create_app("testing.cfg")
    with app.app_context():
        tables = inspect(db.engine).get_table_names()

        # Old databases were made with db.create_all() and have no migration history.
        # Mark them as being at the baseline so upgrade only runs the newer migrations
        # instead of trying to create tables that already exist.
        if "sermon" in tables and "alembic_version" not in tables:
            print("Found a database from before migrations, marking it as baseline.")
            stamp(directory=str(MIGRATIONS), revision=BASELINE)

        upgrade(directory=str(MIGRATIONS))


if __name__ == "__main__":
    main()
    print("Database is up to date.")
